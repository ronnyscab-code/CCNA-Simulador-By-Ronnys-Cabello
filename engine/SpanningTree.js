/**
 * SpanningTree.js
 *
 * Computes a spanning tree over the switched topology to prevent bridging
 * loops — the job real switches do with STP/RSTP. Without this, a triangle
 * of three switches would let an ARP broadcast circulate forever and the
 * L2 pathfinder could hand back a looping path.
 *
 * The model here is a single Common Spanning Tree (not per-VLAN PVST+),
 * which is enough to demonstrate the CCNA essentials: root-bridge election
 * by bridge ID, root/designated/blocking port roles, and one redundant port
 * blocked per loop. The result feeds two consumers:
 *   - `L2Fabric`, which refuses to forward through blocked ports;
 *   - `show spanning-tree`, which renders the roles/states.
 *
 * DOM-free.
 */

const DEFAULT_PRIORITY = 32768;

/**
 * STP path cost by link speed, inferred from the IOS-style port name.
 * @param {string} portName
 * @returns {number}
 */
function portCost(portName) {
  const name = String(portName || '');
  if (/^TenGig/i.test(name)) return 2;
  if (/^GigabitEthernet|^Gig/i.test(name)) return 4;
  if (/^FastEthernet|^Fast/i.test(name)) return 19;
  return 19;
}

/**
 * Converts a colon-separated MAC to a number (safe: 48 bits < 2^53).
 * @param {string} mac
 * @returns {number}
 */
function macToNum(mac) {
  return parseInt(String(mac).replace(/[:-]/g, ''), 16) || 0;
}

/**
 * A switch's bridge MAC: the lowest of its interface MACs, mirroring how a
 * real switch derives its base MAC.
 * @param {import('../devices/Device.js').Device} device
 * @returns {number}
 */
function bridgeMac(device) {
  if (device.interfaces.length === 0) return 0;
  return Math.min(...device.interfaces.map((i) => macToNum(i.mac)));
}

/**
 * The 8-byte bridge ID as a comparable number: priority in the high bits,
 * bridge MAC in the low 48. Lower wins the root election.
 * @param {import('../topology/Node.js').Node} node
 * @returns {number}
 */
function bridgeId(node) {
  const priority = node.device.config?.bridgePriority ?? DEFAULT_PRIORITY;
  return priority * 2 ** 48 + bridgeMac(node.device);
}

/**
 * @typedef {object} SpanningTreeResult
 * @property {string|null} rootId - Node id of the root bridge, or null.
 * @property {Map<string, number>} bridgeIds - switchId → bridge ID.
 * @property {Map<string, number>} dist - switchId → root path cost.
 * @property {Map<string, {role: string, state: string, cost: number}>} portStates
 *   keyed `nodeId|port`.
 * @property {Set<string>} blockedPorts - `nodeId|port` keys in BLK state.
 */

/**
 * @param {import('../topology/Topology.js').Topology} topology
 * @returns {SpanningTreeResult}
 */
export function computeSpanningTree(topology) {
  const switches = topology.getNodes().filter((n) => n.deviceType === 'switch');
  const portStates = new Map();
  const blockedPorts = new Set();
  const bridgeIds = new Map();

  if (switches.length === 0) {
    return { rootId: null, bridgeIds, dist: new Map(), portStates, blockedPorts };
  }

  for (const sw of switches) bridgeIds.set(sw.id, bridgeId(sw));

  // Root bridge: lowest bridge ID.
  let rootId = switches[0].id;
  for (const sw of switches) {
    if (bridgeIds.get(sw.id) < bridgeIds.get(rootId)) rootId = sw.id;
  }

  // Inter-switch links only.
  const links = [];
  for (const edge of topology.getEdges()) {
    const a = topology.getNode(edge.sourceNodeId);
    const b = topology.getNode(edge.targetNodeId);
    if (a && b && a.deviceType === 'switch' && b.deviceType === 'switch') {
      links.push({
        aId: a.id,
        aPort: edge.sourcePort,
        bId: b.id,
        bPort: edge.targetPort,
        cost: Math.min(portCost(edge.sourcePort), portCost(edge.targetPort)),
      });
    }
  }

  // Root path cost via Bellman-Ford relaxation (topologies are tiny), also
  // recording each bridge's chosen upstream link (its future root port).
  const dist = new Map(switches.map((s) => [s.id, Infinity]));
  dist.set(rootId, 0);
  /** @type {Map<string, object>} switchId → link used to reach root */
  const rootLink = new Map();

  let changed = true;
  while (changed) {
    changed = false;
    for (const link of links) {
      const directions = [
        [link.aId, link.bId],
        [link.bId, link.aId],
      ];
      for (const [from, to] of directions) {
        const candidate = dist.get(from) + link.cost;
        if (candidate < dist.get(to)) {
          dist.set(to, candidate);
          rootLink.set(to, link);
          changed = true;
        } else if (candidate === dist.get(to) && candidate !== Infinity && rootLink.has(to)) {
          // Tie-break on the upstream bridge ID.
          const current = rootLink.get(to);
          const currentFrom = current.aId === to ? current.bId : current.aId;
          if (bridgeIds.get(from) < bridgeIds.get(currentFrom)) rootLink.set(to, link);
        }
      }
    }
  }

  // Assign port roles/states per link.
  for (const link of links) {
    const costA = dist.get(link.aId);
    const costB = dist.get(link.bId);

    let designated;
    if (costA < costB) designated = 'a';
    else if (costB < costA) designated = 'b';
    else designated = bridgeIds.get(link.aId) <= bridgeIds.get(link.bId) ? 'a' : 'b';

    const isRootPort = (sideId) => rootLink.get(sideId) === link;

    for (const side of ['a', 'b']) {
      const sideId = side === 'a' ? link.aId : link.bId;
      const port = side === 'a' ? link.aPort : link.bPort;
      const cost = side === 'a' ? costA : costB;
      const key = `${sideId}|${port}`;

      let role;
      let state;
      if (isRootPort(sideId)) {
        role = 'Root';
        state = 'FWD';
      } else if (designated === side) {
        role = 'Desg';
        state = 'FWD';
      } else {
        role = 'Altn';
        state = 'BLK';
        blockedPorts.add(key);
      }
      portStates.set(key, { role, state, cost });
    }
  }

  return { rootId, bridgeIds, dist, portStates, blockedPorts };
}
