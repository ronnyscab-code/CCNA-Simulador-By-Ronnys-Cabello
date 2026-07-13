/**
 * showCommands.js
 *
 * Registers every `show ...` command onto a mode's command tree. Split out
 * of `commands.js` because there are many of them and they are mostly pure
 * renderers.
 *
 * Some show commands surface data that only exists once later versions land
 * (dynamic MAC learning in v0.5, ARP/routing in v0.4/v0.6, OSPF in v0.8).
 * Those render a correct, empty-but-well-formed table today and get richer
 * as the engine grows — never an error, so the CLI is always usable.
 */

import {
  renderRunningConfig,
  renderIpInterfaceBrief,
  renderInterfaces,
  renderVlanBrief,
  shortName,
} from './RunningConfig.js';
import { maskToPrefix, networkAddress } from '../devices/net-utils.js';

/**
 * @param {import('./CommandTree.js').CommandTree} tree
 */
export function registerShowCommands(tree) {
  tree.add('show running-config', (session) => renderRunningConfig(session.device));

  tree.add('show startup-config', (session) =>
    session.device.startupConfig
      ? session.device.startupConfig
      : '% Startup config not present, use `copy running-config startup-config` to save it.',
  );

  tree.add('show interfaces', (session) => renderInterfaces(session.device));

  tree.add('show ip interface brief', (session) => renderIpInterfaceBrief(session.device));

  tree.add('show vlan brief', (session) => renderVlanBrief(session.device));

  tree.add('show mac address-table', (session) => renderMacAddressTable(session));

  tree.add(
    'show arp',
    () => 'Protocol  Address          Age (min)  Hardware Addr   Type   Interface',
  );

  tree.add('show cdp neighbors', (session) => renderCdpNeighbors(session));

  tree.add('show ip route', (session) => renderIpRoute(session.device));

  tree.add('show spanning-tree', (session) => renderSpanningTree(session));

  tree.add('show access-lists', () => '');

  tree.add('show ip ospf neighbor', (session) =>
    session.device.config.ospf
      ? 'Neighbor ID     Pri   State           Dead Time   Address         Interface'
      : '',
  );

  tree.add('show ip ospf interface', (session) => renderOspfInterface(session.device));

  tree.add('show version', (session) => renderVersion(session.device));
}

/**
 * The switch's learned CAM table, read from the packet engine's runtime.
 * @param {import('./CliSession.js').CliSession} session
 * @returns {string}
 */
function renderMacAddressTable(session) {
  const header = [
    '          Mac Address Table',
    '-------------------------------------------',
    '',
    'Vlan    Mac Address       Type        Ports',
    '----    -----------       --------    -----',
  ];

  if (!session.device.capabilities.switching) {
    return '% MAC address table is only maintained on switches.';
  }
  const engine = session.packetEngine;
  if (!engine) return header.join('\n');

  const rows = engine
    .macTableFor(session.node.id)
    .toArray()
    .map(
      (entry) =>
        `${pad(String(entry.vlan), 8)}${pad(entry.mac, 18)}${pad(entry.type, 12)}${shortName(
          entry.port,
        )}`,
    );

  return [...header, ...rows].join('\n');
}

/**
 * Directly-connected neighbors, derived from the topology cabling.
 * @param {import('./CliSession.js').CliSession} session
 * @returns {string}
 */
function renderCdpNeighbors(session) {
  const { topology, node } = session;
  const header = [
    'Capability Codes: R - Router, T - Trans Bridge, B - Source Route Bridge',
    '                  S - Switch, H - Host, I - IGMP, r - Repeater, P - Phone',
    '',
    'Device ID        Local Intrfce     Holdtme    Capability  Platform  Port ID',
  ];

  const rows = [];
  for (const edge of topology.getEdgesForNode(node.id)) {
    const otherId = edge.otherNodeId(node.id);
    const other = topology.getNode(otherId);
    if (!other) continue;
    const localPort = topology.portForNode(edge, node.id) ?? '';
    const remotePort = topology.portForNode(edge, otherId) ?? '';
    rows.push(
      `${pad(other.hostname, 17)}${pad(shortName(localPort), 18)}${pad('150', 11)}${pad(
        capabilityCode(other.device),
        12,
      )}${pad('OpenCCNA', 10)}${shortName(remotePort)}`,
    );
  }

  return [...header, ...rows].join('\n');
}

/**
 * @param {import('../devices/Device.js').Device} device
 * @returns {string}
 */
function renderIpRoute(device) {
  const legend = ['Codes: C - connected, S - static, O - OSPF', ''];

  const routes = [];
  const seen = new Set();
  for (const iface of device.interfaces) {
    if (!iface.enabled || !iface.ipAddress || !iface.subnetMask) continue;
    const network = networkAddress(iface.ipAddress, iface.subnetMask);
    const prefix = maskToPrefix(iface.subnetMask);
    const key = `${network}/${prefix}`;
    if (seen.has(key)) continue;
    seen.add(key);
    routes.push(`C    ${key} is directly connected, ${iface.name}`);
  }

  for (const route of device.config.staticRoutes) {
    const prefix = maskToPrefix(route.mask);
    routes.push(`S    ${route.prefix}/${prefix} [1/0] via ${route.nextHop}`);
  }

  if (routes.length === 0) {
    return [...legend, '% No routes. Configure and enable an interface with an IP address.'].join(
      '\n',
    );
  }
  return [...legend, ...routes].join('\n');
}

/**
 * `show spanning-tree` — reflects the engine's computed tree: whether this
 * bridge is root, and the role/state of each inter-switch port.
 * @param {import('./CliSession.js').CliSession} session
 * @returns {string}
 */
function renderSpanningTree(session) {
  const { device, node } = session;
  if (!device.capabilities.switching) {
    return '% Spanning tree is only relevant on switches.';
  }

  const header = ['VLAN0001', '  Spanning tree enabled protocol rstp'];
  const columns = [
    '',
    'Interface           Role Sts Cost      Prio.Nbr Type',
    '------------------- ---- --- --------- -------- --------------------------------',
  ];

  const engine = session.packetEngine;
  if (!engine) return [...header, ...columns].join('\n');

  const tree = engine.spanningTree();
  const isRoot = tree.rootId === node.id;
  const priority = device.config.bridgePriority ?? 32768;
  header.push(
    `  Root ID    Priority    ${isRoot ? priority : priority}`,
    isRoot ? '             This bridge is the root' : '',
    `  Bridge ID  Priority    ${priority}`,
  );

  const rows = [];
  for (const iface of device.interfaces) {
    const entry = tree.portStates.get(`${node.id}|${iface.name}`);
    if (!entry) continue;
    rows.push(
      `${pad(shortName(iface.name), 20)}${pad(entry.role, 5)}${pad(entry.state, 4)}${pad(
        String(entry.cost),
        10,
      )}128.1     P2p`,
    );
  }

  return [...header.filter(Boolean), ...columns, ...rows].join('\n');
}

/**
 * @param {import('../devices/Device.js').Device} device
 * @returns {string}
 */
function renderOspfInterface(device) {
  if (!device.config.ospf) return '';
  const lines = [];
  for (const iface of device.interfaces) {
    if (iface.ipAddress) {
      lines.push(
        `${iface.name} is up, line protocol is up`,
        `  Internet Address ${iface.ipAddress}/${maskToPrefix(iface.subnetMask)}, Area ${
          device.config.ospf.networks?.[0]?.area ?? 0
        }`,
      );
    }
  }
  return lines.join('\n');
}

/**
 * @param {import('../devices/Device.js').Device} device
 * @returns {string}
 */
function renderVersion(device) {
  return [
    'OpenCCNA Simulator IOS-like Software, Educational Edition',
    `Device type: ${device.type}`,
    `${device.interfaces.length} interfaces`,
    '',
    `${device.hostname} uptime is 0 minutes`,
  ].join('\n');
}

/**
 * @param {import('../devices/Device.js').Device|null} device
 * @returns {string}
 */
function capabilityCode(device) {
  if (!device) return '';
  if (device.capabilities.routing) return 'R';
  if (device.capabilities.switching) return 'S';
  if (device.capabilities.endpoint) return 'H';
  return '';
}

/**
 * @param {string} text
 * @param {number} width
 * @returns {string}
 */
function pad(text, width) {
  const str = String(text);
  return str.length >= width ? `${str} ` : str.padEnd(width, ' ');
}
