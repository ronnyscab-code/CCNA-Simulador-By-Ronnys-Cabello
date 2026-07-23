/**
 * segments.js
 *
 * Groups a topology into the zones a network diagram actually draws: one
 * region per broadcast domain, labelled with its subnet and VLAN.
 *
 * A zone is a set of endpoints that share both a Layer-2 component (reachable
 * through switches only — routers terminate the walk) and an access VLAN.
 * Splitting by VLAN as well as by cabling is what makes a misconfigured port
 * visible: two hosts on the same wire but in different VLANs land in two
 * separate zones, which is exactly the fault the learner is hunting.
 *
 * Routers are deliberately left out of zone membership. They sit at the
 * boundary between zones, so putting them inside one would either overlap the
 * boxes or lie about where the edge of the broadcast domain is; instead the
 * zone records the gateway it found so the label can name it.
 *
 * Pure and DOM-free.
 */

import { networkAddress, maskToPrefix, sameSubnet } from '../devices/net-utils.js';

/**
 * @typedef {object} Zone
 * @property {string} id
 * @property {string[]} nodeIds - members to draw the region around.
 * @property {number|null} vlan
 * @property {string|null} cidr - e.g. "192.168.1.0/24", null if unaddressed.
 * @property {string|null} gateway - a router IP on this subnet, if any.
 * @property {string} label
 * @property {'ok'|'warn'} level
 * @property {string|null} note - why it is flagged, when level is "warn".
 */

/**
 * @param {object} node
 * @returns {boolean}
 */
function isSwitch(node) {
  return Boolean(node.device?.capabilities?.switching);
}

/**
 * @param {object} node
 * @returns {boolean}
 */
function isRouter(node) {
  return Boolean(node.device?.capabilities?.routing);
}

/**
 * The first addressed interface on a device, which for an endpoint is its
 * only one.
 * @param {object} node
 * @returns {{ipAddress: string, subnetMask: string}|null}
 */
function addressOf(node) {
  return node.device?.interfaces?.find((i) => i.ipAddress && i.subnetMask) ?? null;
}

/**
 * The access VLAN a node sits in, read from the switch port it is patched
 * into. Ports on a trunk, or hosts cabled straight to a router, have no
 * meaningful access VLAN.
 * @param {import('./Topology.js').Topology} topology
 * @param {string} nodeId
 * @returns {number|null}
 */
export function accessVlanOf(topology, nodeId) {
  for (const edge of topology.getEdgesForNode(nodeId)) {
    const other = topology.getNode(edge.otherNodeId(nodeId));
    if (!other || !isSwitch(other)) continue;
    const iface = other.device.getInterface(topology.portForNode(edge, other.id));
    if (!iface || iface.switchportMode === 'trunk') continue;
    return iface.accessVlan ?? 1;
  }
  return null;
}

/**
 * Collects the Layer-2 components of the topology: sets of nodes reachable
 * from one another without crossing a router.
 * @param {import('./Topology.js').Topology} topology
 * @returns {string[][]}
 */
export function layer2Components(topology) {
  const nodes = topology.getNodes().filter((n) => n.device && !isRouter(n));
  const seen = new Set();
  const components = [];

  for (const start of nodes) {
    if (seen.has(start.id)) continue;
    const component = [];
    const stack = [start.id];
    while (stack.length) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      const node = topology.getNode(id);
      if (!node?.device || isRouter(node)) continue;
      seen.add(id);
      component.push(id);
      // Keep walking only through switches; an endpoint ends the segment.
      if (!isSwitch(node) && id !== start.id) continue;
      for (const edge of topology.getEdgesForNode(id)) stack.push(edge.otherNodeId(id));
    }
    if (component.length) components.push(component);
  }
  return components;
}

/**
 * Finds a router interface addressed inside a subnet — the zone's gateway.
 * @param {import('./Topology.js').Topology} topology
 * @param {{ipAddress: string, subnetMask: string}} address
 * @returns {string|null}
 */
function gatewayFor(topology, address) {
  for (const node of topology.getNodes()) {
    if (!isRouter(node)) continue;
    for (const iface of node.device.interfaces) {
      if (!iface.ipAddress || !iface.subnetMask) continue;
      const onSubnet = sameSubnet(iface.ipAddress, address.ipAddress, address.subnetMask);
      if (onSubnet) return iface.ipAddress;
    }
  }
  return null;
}

/**
 * Builds the drawable zones for a topology.
 * @param {import('./Topology.js').Topology} topology
 * @returns {Zone[]}
 */
export function computeZones(topology) {
  const zones = [];

  for (const [index, component] of layer2Components(topology).entries()) {
    const endpoints = component
      .map((id) => topology.getNode(id))
      .filter((n) => n && !isSwitch(n) && addressOf(n));
    if (endpoints.length === 0) continue;

    // One zone per VLAN inside the component.
    /** @type {Map<string, object[]>} */
    const byVlan = new Map();
    for (const node of endpoints) {
      const vlan = accessVlanOf(topology, node.id);
      const key = String(vlan ?? 'none');
      if (!byVlan.has(key)) byVlan.set(key, []);
      byVlan.get(key).push(node);
    }

    const switches = component.map((id) => topology.getNode(id)).filter((n) => n && isSwitch(n));

    for (const [key, members] of byVlan) {
      const vlan = key === 'none' ? null : Number(key);
      const address = addressOf(members[0]);
      const subnets = new Set(
        members.map((n) => {
          const a = addressOf(n);
          return `${networkAddress(a.ipAddress, a.subnetMask)}/${maskToPrefix(a.subnetMask)}`;
        }),
      );
      const cidr = subnets.size === 1 ? [...subnets][0] : null;

      // A switch belongs to the zone only when it serves this VLAN alone —
      // otherwise it straddles zones and drawing it inside one would lie.
      const ownedSwitches =
        byVlan.size === 1 ? switches.filter((s) => componentServesOneVlan(topology, s)) : [];

      const nodeIds = [...members.map((n) => n.id), ...ownedSwitches.map((s) => s.id)];
      const gateway = address ? gatewayFor(topology, address) : null;

      let level = 'ok';
      let note = null;
      if (!cidr) {
        level = 'warn';
        note = 'La zona mezcla varias subredes.';
      } else if (byVlan.size > 1 && subnetsOverlapAcrossVlans(byVlan)) {
        level = 'warn';
        note = 'Misma subred repartida en VLANs distintas.';
      } else if (!gateway) {
        level = 'warn';
        note = 'Ningún router tiene una IP en esta subred.';
      }

      zones.push({
        id: `zone-${index}-${key}`,
        nodeIds,
        vlan,
        cidr,
        gateway,
        label: [cidr ?? 'sin direccionar', vlan === null ? null : `VLAN ${vlan}`]
          .filter(Boolean)
          .join(' · '),
        level,
        note,
      });
    }
  }

  return zones;
}

/**
 * @param {import('./Topology.js').Topology} topology
 * @param {object} switchNode
 * @returns {boolean} whether every host port on the switch uses one VLAN.
 */
function componentServesOneVlan(topology, switchNode) {
  const vlans = new Set();
  for (const edge of topology.getEdgesForNode(switchNode.id)) {
    const iface = switchNode.device.getInterface(topology.portForNode(edge, switchNode.id));
    if (!iface || iface.switchportMode === 'trunk') continue;
    vlans.add(iface.accessVlan ?? 1);
  }
  return vlans.size <= 1;
}

/**
 * @param {Map<string, object[]>} byVlan
 * @returns {boolean} whether two different VLANs carry the same subnet.
 */
function subnetsOverlapAcrossVlans(byVlan) {
  const seen = new Map();
  for (const [key, members] of byVlan) {
    for (const node of members) {
      const a = addressOf(node);
      if (!a) continue;
      const net = networkAddress(a.ipAddress, a.subnetMask);
      if (seen.has(net) && seen.get(net) !== key) return true;
      seen.set(net, key);
    }
  }
  return false;
}
