/**
 * telemetry.js
 *
 * Reads the live state of a topology into a flat snapshot the canvas and the
 * telemetry rail can draw without re-deriving anything: what each cable is
 * doing, what each device's interfaces look like, and what the engine has
 * actually learned (ARP entries, MAC table).
 *
 * The distinction that matters: a scenario's checks say whether the objective
 * is met, `scenarios/diagnostics.js` says where a likely fault is, and this
 * says what the network is doing *right now*. It judges nothing — it reports.
 *
 * Pure and DOM-free. The engine argument is optional so a topology can be
 * inspected before any packet has ever been sent.
 */

/**
 * @typedef {'ok'|'warn'|'down'} LinkLevel
 * @typedef {{edgeId: string, level: LinkLevel, reason: string|null,
 *            a: {nodeId: string, port: string}, b: {nodeId: string, port: string}}} LinkState
 */

/**
 * Abbreviates an interface name IOS-style (GigabitEthernet0/0 → Gi0/0).
 * @param {string} name
 * @returns {string}
 */
export function shortPort(name) {
  return String(name ?? '')
    .replace(/^GigabitEthernet/, 'Gi')
    .replace(/^FastEthernet/, 'Fa')
    .replace(/^Ethernet/, 'Et')
    .replace(/^Serial/, 'Se');
}

/**
 * Classifies every cable in the topology.
 * @param {import('../topology/Topology.js').Topology} topology
 * @returns {LinkState[]}
 */
export function linkStates(topology) {
  const states = [];

  for (const edge of topology.getEdges()) {
    const a = topology.getNode(edge.sourceNodeId);
    const b = topology.getNode(edge.targetNodeId);
    if (!a || !b) continue;

    const portA = topology.portForNode(edge, a.id);
    const portB = topology.portForNode(edge, b.id);
    const ifaceA = a.device?.getInterface(portA);
    const ifaceB = b.device?.getInterface(portB);

    let level = 'ok';
    let reason = null;

    const downEnd = [
      [a, ifaceA],
      [b, ifaceB],
    ].find(([, iface]) => iface && !iface.enabled);

    if (downEnd) {
      level = 'down';
      reason = `${downEnd[0].hostname} tiene ${shortPort(downEnd[1].name)} apagada (shutdown).`;
    } else {
      const unaddressed = [
        [a, ifaceA],
        [b, ifaceB],
      ].find(([node, iface]) => iface && needsAddress(node) && !iface.ipAddress);
      if (unaddressed) {
        level = 'warn';
        reason = `${unaddressed[0].hostname} ${shortPort(unaddressed[1].name)} no tiene dirección IP.`;
      } else {
        const mismatch = vlanMismatch(a, ifaceA, b, ifaceB);
        if (mismatch) {
          level = 'warn';
          reason = mismatch;
        }
      }
    }

    states.push({
      edgeId: edge.id,
      level,
      reason,
      a: { nodeId: a.id, port: portA },
      b: { nodeId: b.id, port: portB },
    });
  }

  return states;
}

/**
 * Switch ports carry frames without an IP; routers and hosts do not.
 * @param {object} node
 * @returns {boolean}
 */
function needsAddress(node) {
  return !node.device?.capabilities?.switching;
}

/**
 * @param {object} a
 * @param {object} ifaceA
 * @param {object} b
 * @param {object} ifaceB
 * @returns {string|null}
 */
function vlanMismatch(a, ifaceA, b, ifaceB) {
  const bothSwitches = a.device?.capabilities?.switching && b.device?.capabilities?.switching;
  if (!bothSwitches || !ifaceA || !ifaceB) return null;
  const modeA = ifaceA.switchportMode ?? 'access';
  const modeB = ifaceB.switchportMode ?? 'access';
  if (modeA !== modeB) {
    return `${a.hostname} está en modo ${modeA} y ${b.hostname} en modo ${modeB}.`;
  }
  if (modeA === 'access' && (ifaceA.accessVlan ?? 1) !== (ifaceB.accessVlan ?? 1)) {
    return `VLAN ${ifaceA.accessVlan ?? 1} contra VLAN ${ifaceB.accessVlan ?? 1} en el mismo cable.`;
  }
  return null;
}

/**
 * The interface rows the rail shows for one device.
 * @param {object} node
 * @returns {Array<{name: string, short: string, ip: string|null, up: boolean, vlan: number|null}>}
 */
export function interfaceRows(node) {
  return (node?.device?.interfaces ?? []).map((iface) => ({
    name: iface.name,
    short: shortPort(iface.name),
    ip: iface.ipAddress ?? null,
    up: Boolean(iface.enabled),
    vlan: iface.switchportMode === 'access' ? (iface.accessVlan ?? 1) : null,
  }));
}

/**
 * What the engine has learned about a node: ARP entries for a router or host,
 * MAC-table entries for a switch. Returns empty lists when nothing has been
 * sent yet, which is itself informative.
 * @param {import('./PacketEngine.js').PacketEngine|null} engine
 * @param {string} nodeId
 * @returns {{arp: Array<{ip: string, mac: string}>, mac: Array<{vlan: number, mac: string, port: string, type: string}>}}
 */
export function learnedTables(engine, nodeId) {
  if (!engine) return { arp: [], mac: [] };

  const arp = [...(engine.arpCaches?.get(nodeId)?.entries ?? new Map())].map(([ip, mac]) => ({
    ip,
    mac,
  }));
  const mac = [...(engine.macTables?.get(nodeId)?.entries ?? new Map())].map(([, entry]) => ({
    vlan: entry.vlan,
    mac: entry.mac,
    port: shortPort(entry.port),
    type: entry.type,
  }));
  return { arp, mac };
}

/**
 * The whole live picture in one object.
 * @param {import('../topology/Topology.js').Topology} topology
 * @param {import('./PacketEngine.js').PacketEngine|null} [engine]
 * @param {string|null} [focusNodeId] - device the rail is showing in detail.
 * @returns {object}
 */
export function buildTelemetry(topology, engine = null, focusNodeId = null) {
  const links = linkStates(topology);
  const focus = focusNodeId ? topology.getNode(focusNodeId) : null;

  return {
    links,
    summary: {
      devices: topology.getNodes().length,
      links: links.length,
      down: links.filter((l) => l.level === 'down').length,
      warn: links.filter((l) => l.level === 'warn').length,
    },
    focus: focus
      ? {
          nodeId: focus.id,
          hostname: focus.hostname,
          interfaces: interfaceRows(focus),
          ...learnedTables(engine, focus.id),
        }
      : null,
  };
}
