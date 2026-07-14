/**
 * checks.js
 *
 * A library of reusable validation predicates for troubleshooting scenarios.
 * Each factory returns a *check*: an object with a human-readable
 * `description`, a `points` weight, and a `run(ctx)` method that inspects the
 * live topology (and, where needed, the packet engine) and reports whether
 * the objective is met.
 *
 * Checks are pure and DOM-free — the same check runs in a `node:test` and in
 * the browser. The evaluation context is:
 *   ctx = { topology, engine }
 * where `engine` is a `PacketEngine` bound to `topology`.
 */

/**
 * Resolves a node reference (its id, or its hostname, case-insensitive) to a
 * node, or null.
 * @param {import('../topology/Topology.js').Topology} topology
 * @param {string} ref
 * @returns {import('../topology/Node.js').Node|null}
 */
export function resolveNode(topology, ref) {
  const byId = topology.getNode(ref);
  if (byId) return byId;
  const lower = String(ref).toLowerCase();
  return topology.getNodes().find((n) => n.hostname.toLowerCase() === lower) ?? null;
}

/**
 * @param {string} description
 * @param {number} points
 * @param {(ctx: object) => {passed: boolean, detail?: string}} run
 * @returns {object}
 */
function makeCheck(description, points, run) {
  return { description, points, run };
}

/**
 * The first enabled, addressed interface's IP owner check helper.
 * @param {import('../topology/Node.js').Node} node
 * @param {string} ifaceName
 * @returns {import('../devices/NetworkInterface.js').NetworkInterface|null}
 */
function iface(node, ifaceName) {
  return (
    node?.device?.resolveInterface?.(ifaceName) ?? node?.device?.getInterface?.(ifaceName) ?? null
  );
}

/**
 * Passes when a ping from a node to a destination IP succeeds.
 * @param {string} fromRef
 * @param {string} dstIp
 * @param {{points?: number}} [opts]
 * @returns {object}
 */
export function pingSucceeds(fromRef, dstIp, { points = 1 } = {}) {
  return makeCheck(`${fromRef} can ping ${dstIp}`, points, ({ topology, engine }) => {
    const node = resolveNode(topology, fromRef);
    if (!node) return { passed: false, detail: `Unknown device: ${fromRef}` };
    const result = engine.ping(node.id, dstIp);
    return { passed: result.success, detail: result.success ? 'reachable' : result.reason };
  });
}

/**
 * Passes when a ping from a node to a destination IP fails (e.g. an ACL or
 * VLAN is supposed to block it).
 * @param {string} fromRef
 * @param {string} dstIp
 * @param {{points?: number}} [opts]
 * @returns {object}
 */
export function pingFails(fromRef, dstIp, { points = 1 } = {}) {
  return makeCheck(`${fromRef} cannot ping ${dstIp}`, points, ({ topology, engine }) => {
    const node = resolveNode(topology, fromRef);
    if (!node) return { passed: false, detail: `Unknown device: ${fromRef}` };
    const result = engine.ping(node.id, dstIp);
    return {
      passed: !result.success,
      detail: result.success ? 'unexpectedly reachable' : 'blocked',
    };
  });
}

/**
 * Passes when an interface is administratively up (`no shutdown`).
 * @param {string} nodeRef
 * @param {string} ifaceName
 * @param {{points?: number}} [opts]
 * @returns {object}
 */
export function interfaceEnabled(nodeRef, ifaceName, { points = 1 } = {}) {
  return makeCheck(`${nodeRef} ${ifaceName} is up`, points, ({ topology }) => {
    const node = resolveNode(topology, nodeRef);
    const i = iface(node, ifaceName);
    if (!i) return { passed: false, detail: 'interface not found' };
    return { passed: i.enabled, detail: i.enabled ? 'up' : 'administratively down' };
  });
}

/**
 * Passes when an interface carries exactly the given IP and mask.
 * @param {string} nodeRef
 * @param {string} ifaceName
 * @param {string} ip
 * @param {string} mask
 * @param {{points?: number}} [opts]
 * @returns {object}
 */
export function interfaceHasIp(nodeRef, ifaceName, ip, mask, { points = 1 } = {}) {
  return makeCheck(`${nodeRef} ${ifaceName} has IP ${ip}/${mask}`, points, ({ topology }) => {
    const node = resolveNode(topology, nodeRef);
    const i = iface(node, ifaceName);
    if (!i) return { passed: false, detail: 'interface not found' };
    const ok = i.ipAddress === ip && i.subnetMask === mask;
    return { passed: ok, detail: ok ? 'configured' : `found ${i.ipAddress ?? 'none'}` };
  });
}

/**
 * Passes when an endpoint's default gateway is set to the given IP.
 * @param {string} nodeRef
 * @param {string} gatewayIp
 * @param {{points?: number}} [opts]
 * @returns {object}
 */
export function defaultGatewayIs(nodeRef, gatewayIp, { points = 1 } = {}) {
  return makeCheck(`${nodeRef} default gateway is ${gatewayIp}`, points, ({ topology }) => {
    const node = resolveNode(topology, nodeRef);
    const gw = node?.device?.defaultGateway ?? null;
    return { passed: gw === gatewayIp, detail: gw ? `is ${gw}` : 'not set' };
  });
}

/**
 * Passes when a switch port is an access port in the given VLAN.
 * @param {string} nodeRef
 * @param {string} ifaceName
 * @param {number} vlan
 * @param {{points?: number}} [opts]
 * @returns {object}
 */
export function accessVlanIs(nodeRef, ifaceName, vlan, { points = 1 } = {}) {
  return makeCheck(`${nodeRef} ${ifaceName} is in VLAN ${vlan}`, points, ({ topology }) => {
    const node = resolveNode(topology, nodeRef);
    const i = iface(node, ifaceName);
    if (!i) return { passed: false, detail: 'interface not found' };
    const ok = i.switchportMode === 'access' && (i.accessVlan ?? 1) === vlan;
    return { passed: ok, detail: ok ? 'assigned' : `VLAN ${i.accessVlan ?? 1}` };
  });
}

/**
 * Passes when a router has at least one FULL OSPF adjacency.
 * @param {string} nodeRef
 * @param {{points?: number}} [opts]
 * @returns {object}
 */
export function ospfNeighborUp(nodeRef, { points = 1 } = {}) {
  return makeCheck(`${nodeRef} has an OSPF neighbor`, points, ({ topology, engine }) => {
    const node = resolveNode(topology, nodeRef);
    if (!node) return { passed: false, detail: `Unknown device: ${nodeRef}` };
    const neighbors = engine.ospf().neighbors.get(node.id) ?? [];
    const full = neighbors.filter((n) => n.state.startsWith('FULL'));
    return { passed: full.length > 0, detail: `${full.length} full adjacency(ies)` };
  });
}

/**
 * An escape hatch for scenario-specific logic.
 * @param {string} description
 * @param {number} points
 * @param {(ctx: object) => boolean} predicate
 * @returns {object}
 */
export function custom(description, points, predicate) {
  return makeCheck(description, points, (ctx) => ({ passed: Boolean(predicate(ctx)) }));
}
