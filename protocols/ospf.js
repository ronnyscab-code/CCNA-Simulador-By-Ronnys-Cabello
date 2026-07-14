/**
 * ospf.js
 *
 * A single-area OSPFv2 control plane, computed over the whole topology.
 * Real OSPF floods link-state advertisements until every router holds an
 * identical link-state database, then each runs Dijkstra (SPF) on it. Since
 * the simulator already has global visibility of the topology, this module
 * skips the flooding and computes the converged result directly — the
 * outcome a stable OSPF domain would reach:
 *
 *   - a router ID per router (configured, else highest interface IP);
 *   - neighbor adjacencies on shared, OSPF-advertised subnets;
 *   - DR/BDR election per multi-access segment;
 *   - SPF shortest-path routes to every remote subnet, with next hops.
 *
 * The routes feed `protocols/routing.js` (as `type: "ospf"` entries) so a
 * `ping` across routers works with OSPF alone — no static routes required.
 * DOM-free.
 */

import {
  ipv4ToInt,
  intToIpv4,
  networkAddress,
  maskToPrefix,
  sameSubnet,
} from '../devices/net-utils.js';

const DEFAULT_PRIORITY = 1;

/**
 * OSPF interface cost, approximated from the port type (reference-bandwidth
 * style). Real IOS derives this from bandwidth; these values keep the
 * Gigabit < FastEthernet < Serial ordering learners expect.
 * @param {string} portName
 * @returns {number}
 */
function ospfCost(portName) {
  const name = String(portName || '');
  if (/^TenGig/i.test(name)) return 1;
  if (/^Gigabit|^Gig/i.test(name)) return 1;
  if (/^FastEthernet|^Fast/i.test(name)) return 10;
  if (/^Serial/i.test(name)) return 64;
  return 10;
}

/**
 * Whether an IP falls within an OSPF `network address wildcard` statement.
 * @param {string} ip
 * @param {{address: string, wildcard: string}} statement
 * @returns {boolean}
 */
function matchesNetworkStatement(ip, statement) {
  const wild = ipv4ToInt(statement.wildcard);
  const mask = ~wild >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(statement.address) & mask);
}

/**
 * The router ID: an explicit `router-id`, otherwise the highest IPv4 address
 * among the router's addressed interfaces.
 * @param {import('../devices/Device.js').Device} device
 * @returns {string|null}
 */
function routerIdFor(device) {
  if (device.config.ospf?.routerId) return device.config.ospf.routerId;
  let best = -1;
  for (const iface of device.interfaces) {
    if (iface.enabled && iface.ipAddress) best = Math.max(best, ipv4ToInt(iface.ipAddress));
  }
  return best >= 0 ? intToIpv4(best) : null;
}

/**
 * The OSPF-active interfaces on a router: enabled, addressed, and matched by
 * one of its `network` statements.
 * @param {import('../devices/Device.js').Device} device
 * @returns {Array<{iface: object, area: number}>}
 */
function activeInterfaces(device) {
  const statements = device.config.ospf?.networks ?? [];
  const result = [];
  for (const iface of device.interfaces) {
    if (!iface.enabled || !iface.ipAddress || !iface.subnetMask) continue;
    const statement = statements.find((s) => matchesNetworkStatement(iface.ipAddress, s));
    if (statement) result.push({ iface, area: statement.area });
  }
  return result;
}

/**
 * @typedef {object} OspfResult
 * @property {boolean} enabled
 * @property {Map<string, string>} routerIds - nodeId → router ID.
 * @property {Map<string, Array<object>>} neighbors - nodeId → neighbor list.
 * @property {Map<string, Array<object>>} routes - nodeId → learned routes.
 * @property {Map<string, {drId: string|null, bdrId: string|null}>} segments
 *   subnet key → elected DR/BDR router IDs.
 */

/**
 * Computes the converged OSPF state for the topology.
 * @param {import('../topology/Topology.js').Topology} topology
 * @param {import('../engine/L2Fabric.js').L2Fabric} fabric
 * @returns {OspfResult}
 */
export function computeOspf(topology, fabric) {
  const routers = topology
    .getNodes()
    .filter((n) => n.device?.capabilities?.routing && n.device.config.ospf);

  const routerIds = new Map();
  const neighbors = new Map();
  const routes = new Map();
  const segments = new Map();

  if (routers.length === 0) {
    return { enabled: false, routerIds, neighbors, routes, segments };
  }

  for (const router of routers) {
    routerIds.set(router.id, routerIdFor(router.device));
    neighbors.set(router.id, []);
    routes.set(router.id, []);
  }

  // Group OSPF-active interfaces by subnet to elect DR/BDR and to find
  // which routers are neighbors on each segment.
  /** @type {Map<string, Array<{nodeId: string, iface: object, priority: number}>>} */
  const segmentMembers = new Map();
  for (const router of routers) {
    for (const { iface } of activeInterfaces(router.device)) {
      const key = `${networkAddress(iface.ipAddress, iface.subnetMask)}/${maskToPrefix(
        iface.subnetMask,
      )}`;
      if (!segmentMembers.has(key)) segmentMembers.set(key, []);
      segmentMembers.get(key).push({
        nodeId: router.id,
        iface,
        priority: iface.ospfPriority ?? DEFAULT_PRIORITY,
      });
    }
  }

  // DR/BDR election per segment: highest priority, then highest router ID.
  // Priority 0 is ineligible.
  for (const [key, members] of segmentMembers) {
    const eligible = members
      .filter((m) => m.priority > 0)
      .sort(
        (a, b) =>
          b.priority - a.priority ||
          ipv4ToInt(routerIds.get(b.nodeId)) - ipv4ToInt(routerIds.get(a.nodeId)),
      );
    segments.set(key, {
      drId: eligible[0] ? routerIds.get(eligible[0].nodeId) : null,
      bdrId: eligible[1] ? routerIds.get(eligible[1].nodeId) : null,
    });
  }

  // Build neighbor adjacencies and the SPF graph. Two routers are neighbors
  // if they share a subnet on OSPF-active interfaces and can reach each
  // other at layer 2 on it.
  /** @type {Map<string, Array<{to: string, cost: number, nextHopIp: string}>>} */
  const graph = new Map(routers.map((r) => [r.id, []]));

  for (const [key, members] of segmentMembers) {
    const { drId, bdrId } = segments.get(key);
    for (let i = 0; i < members.length; i += 1) {
      for (let j = 0; j < members.length; j += 1) {
        if (i === j) continue;
        const a = members[i];
        const b = members[j];
        if (!fabric.findPath(a.nodeId, b.nodeId, {})) continue;

        const bRid = routerIds.get(b.nodeId);
        const role = bRid === drId ? 'DR' : bRid === bdrId ? 'BDR' : 'DROTHER';
        const aRid = routerIds.get(a.nodeId);
        const adjacent = aRid === drId || aRid === bdrId || role === 'DR' || role === 'BDR';

        neighbors.get(a.nodeId).push({
          neighborId: b.nodeId,
          routerId: bRid,
          address: b.iface.ipAddress,
          localIface: a.iface.name,
          priority: b.priority,
          role,
          state: `${adjacent ? 'FULL' : '2WAY'}/${role}`,
        });

        graph.get(a.nodeId).push({
          to: b.nodeId,
          cost: ospfCost(a.iface.name),
          nextHopIp: b.iface.ipAddress,
        });
      }
    }
  }

  // SPF: shortest paths from each router, yielding routes to remote subnets.
  for (const source of routers) {
    routes.set(source.id, spfRoutes(source.id, graph, routers, topology));
  }

  return { enabled: true, routerIds, neighbors, routes, segments };
}

/**
 * Runs Dijkstra from `sourceId` over the OSPF graph and turns the result
 * into routes to every subnet owned by a reachable router (excluding the
 * source's own connected subnets).
 * @param {string} sourceId
 * @param {Map<string, Array<{to: string, cost: number, nextHopIp: string}>>} graph
 * @param {import('../topology/Node.js').Node[]} routers
 * @param {import('../topology/Topology.js').Topology} topology
 * @returns {Array<object>}
 */
function spfRoutes(sourceId, graph, routers, topology) {
  const dist = new Map([[sourceId, 0]]);
  const firstHop = new Map(); // routerId → next-hop IP from source
  const visited = new Set();

  while (visited.size < routers.length) {
    // Pick the unvisited node with the smallest distance.
    let currentId = null;
    let currentDist = Infinity;
    for (const [id, d] of dist) {
      if (!visited.has(id) && d < currentDist) {
        currentDist = d;
        currentId = id;
      }
    }
    if (currentId === null) break;
    visited.add(currentId);

    for (const edge of graph.get(currentId) ?? []) {
      const nd = currentDist + edge.cost;
      if (nd < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, nd);
        // First hop: the source's own neighbor, else inherit.
        firstHop.set(edge.to, currentId === sourceId ? edge.nextHopIp : firstHop.get(currentId));
      }
    }
  }

  const sourceDevice = topology.getNode(sourceId).device;
  const localSubnets = new Set(
    sourceDevice.interfaces
      .filter((i) => i.enabled && i.ipAddress && i.subnetMask)
      .map((i) => `${networkAddress(i.ipAddress, i.subnetMask)}/${maskToPrefix(i.subnetMask)}`),
  );

  const best = new Map(); // subnetKey → route
  for (const router of routers) {
    if (router.id === sourceId || !dist.has(router.id)) continue;
    const metric = dist.get(router.id);
    const nextHop = firstHop.get(router.id);
    if (!nextHop) continue;

    // Only subnets the remote router actually advertises into OSPF (covered
    // by one of its `network` statements) are learnable.
    for (const { iface } of activeInterfaces(router.device)) {
      if (!iface.enabled || !iface.ipAddress || !iface.subnetMask) continue;
      const network = networkAddress(iface.ipAddress, iface.subnetMask);
      const prefix = maskToPrefix(iface.subnetMask);
      const key = `${network}/${prefix}`;
      if (localSubnets.has(key)) continue;

      const existing = best.get(key);
      if (!existing || metric < existing.metric) {
        best.set(key, {
          network,
          prefix,
          mask: iface.subnetMask,
          nextHop,
          type: 'ospf',
          metric,
        });
      }
    }
  }

  return [...best.values()];
}

/**
 * Convenience: does `ip` belong to the same subnet as any OSPF-active
 * interface of `device`? (Used by callers that need a quick on-link check.)
 * @param {import('../devices/Device.js').Device} device
 * @param {string} ip
 * @returns {boolean}
 */
export function hasOspfLocalSubnet(device, ip) {
  return activeInterfaces(device).some(({ iface }) =>
    sameSubnet(iface.ipAddress, ip, iface.subnetMask),
  );
}
