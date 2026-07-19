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
  renderRunningConfigInterface,
  renderIpInterfaceBrief,
  renderInterfaces,
  renderVlanBrief,
  shortName,
} from './RunningConfig.js';
import { maskToPrefix, networkAddress } from '../devices/net-utils.js';
import { renderAcl } from '../protocols/acl.js';
import { registerExtraShowCommands } from './showCommandsExtra.js';

/**
 * @param {import('./CommandTree.js').CommandTree} tree
 */
export function registerShowCommands(tree) {
  tree.add('show running-config', (session) => renderRunningConfig(session.device));

  tree.add('show running-config interface <name>', (session, args) =>
    renderRunningConfigInterface(session.device, args.name),
  );

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

  tree.add('show ip route', (session) => renderIpRoute(session));

  tree.add('show spanning-tree', (session) => renderSpanningTree(session));

  tree.add('show access-lists', (session) => renderAccessLists(session.device));

  tree.add('show ip nat translations', (session) => renderNatTranslations(session));

  tree.add('show ip ospf neighbor', (session) => renderOspfNeighbor(session));

  tree.add('show ip ospf interface', (session) => renderOspfInterface(session.device));

  tree.add('show version', (session) => renderVersion(session.device));

  // --- Additional `show` commands (switch/router breadth) --------------
  tree.add('show clock', () => '*00:00:00.000 UTC Mon Jan 1 2001');
  tree.add('show privilege', (s) => `Current privilege level is ${privilegeLevel(s)}`);
  tree.add('show history', (s) => (s.commandHistory ?? []).join('\n'));
  tree.add('show users', () =>
    [
      '    Line       User       Host(s)              Idle       Location',
      '*   0 con 0                idle                 00:00:00',
    ].join('\n'),
  );
  tree.add('show sessions', () => '% No connections open');
  tree.add('show logging', () =>
    ['Syslog logging: enabled (0 messages dropped)', '', 'Log Buffer (8192 bytes):'].join('\n'),
  );
  tree.add(
    'show terminal',
    () => 'Line 0, Location: "", Type: ""\nLength: 24 lines, Width: 80 columns',
  );
  tree.add('show ssh', () => '%No SSHv2 server connections running.');
  tree.add('show ntp status', () => 'Clock is unsynchronized, stratum 16, no reference clock');
  tree.add('show flash:', () => renderFlash());
  tree.add('show flash', () => renderFlash());
  tree.add('show boot', () => 'BOOT variable = flash:\nManual boot = no');
  tree.add('show port-security', (s) => renderPortSecurity(s.device));
  tree.add('show vtp status', () => renderVtpStatus());
  tree.add('show etherchannel summary', () => renderEtherchannelSummary());
  tree.add('show interfaces status', (s) => renderInterfacesStatus(s));
  tree.add('show mac-address-table', (s) => renderMacAddressTable(s));
  tree.add('show ip protocols', (s) => renderIpProtocols(s));
  tree.add('show ip dhcp binding', () => 'Bindings from all pools not associated with VRF:');
  tree.add('show cdp neighbors detail', (s) => renderCdpNeighbors(s));
  tree.add(
    'show lldp neighbors',
    () => 'Capability codes:\n    (R) Router, (B) Bridge, (T) Telephone, (S) Switch',
  );
  tree.add('show aaa sessions', () => 'Total sessions since last reload: 0');
  tree.add(
    'show dtp',
    () => 'Global DTP information\n  Sending DTP Hello packets every 30 seconds',
  );
  tree.add('show snmp', () => 'Chassis: 0\n0 SNMP packets input\n0 SNMP packets output');
  tree.add(
    'show storm-control',
    () => 'Interface  Filter State   Upper        Lower        Current',
  );
  tree.add('show tcp', () => '% No TCP connections');
  tree.add(
    'show tcp brief',
    () => 'TCB       Local Address           Foreign Address        (state)',
  );

  // The broad "cheat-sheet" set (interfaces/vlan/spanning-tree/ip/etc.).
  registerExtraShowCommands(tree);

  // --- Contextual `?` help descriptions --------------------------------
  const d = (kw, text) => tree.describe(`show ${kw}`, text);
  d('aaa', 'Show AAA values');
  d('access-lists', 'List access lists');
  d('arp', 'ARP table');
  d('boot', 'Show boot attributes');
  d('cdp', 'CDP information');
  d('clock', 'Display the system clock');
  d('dhcp', 'DHCP status');
  d('dtp', 'DTP information');
  d('etherchannel', 'EtherChannel information');
  d('flash:', 'Flash file system');
  d('history', 'Session command history');
  d('interfaces', 'Interface status and configuration');
  d('ip', 'IP information');
  d('lldp', 'LLDP information');
  d('logging', 'Show the contents of logging buffers');
  d('mac', 'MAC configuration');
  d('mac-address-table', 'MAC forwarding table');
  d('ntp', 'Network time protocol');
  d('port-security', 'Show secure port information');
  d('privilege', 'Show current privilege level');
  d('running-config', 'Current operating configuration');
  d('sessions', 'Information about Telnet connections');
  d('snmp', 'SNMP statistics');
  d('spanning-tree', 'Spanning tree topology');
  d('ssh', 'Status of SSH server connections');
  d('startup-config', 'Contents of startup configuration');
  d('storm-control', 'Show storm control configuration');
  d('tcp', 'Status of TCP connections');
  d('terminal', 'Display terminal configuration parameters');
  d('users', 'Display information about terminal lines');
  d('version', 'System hardware and software status');
  d('vlan', 'VLAN status');
  d('vtp', 'VTP information');
  // second-level help under `show ip ?` and `show vlan ?`
  tree.describe('show running-config interface', 'Show interface configuration');
  tree.describe('show ip route', 'IP routing table');
  tree.describe('show ip interface', 'IP interface status and configuration');
  tree.describe('show ip ospf', 'OSPF information');
  tree.describe('show ip nat', 'IP NAT information');
  tree.describe('show ip protocols', 'IP routing protocol process parameters');
  tree.describe('show vlan brief', 'VTP all VLAN status in brief');
  tree.describe('show cdp neighbors', 'CDP neighbor entries');
}

/**
 * The switch's learned CAM table, read from the packet engine's runtime.
 * @param {import('./CliSession.js').CliSession} session
 * @returns {string}
 */
export function renderMacAddressTable(session) {
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
export function renderCdpNeighbors(session) {
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
 * @param {import('./CliSession.js').CliSession} session
 * @returns {string}
 */
export function renderIpRoute(session) {
  const { device, node } = session;
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
    seen.add(`${networkAddress(route.prefix, route.mask)}/${prefix}`);
    routes.push(`S    ${route.prefix}/${prefix} [1/0] via ${route.nextHop}`);
  }

  // OSPF-learned routes from the engine's converged SPF result.
  const engine = session.packetEngine;
  if (engine) {
    const ospfRoutes = engine.ospf().routes.get(node.id) ?? [];
    for (const route of ospfRoutes) {
      const key = `${route.network}/${route.prefix}`;
      if (seen.has(key)) continue;
      seen.add(key);
      routes.push(`O    ${key} [110/${route.metric}] via ${route.nextHop}`);
    }
  }

  if (routes.length === 0) {
    return [...legend, '% No routes. Configure and enable an interface with an IP address.'].join(
      '\n',
    );
  }
  return [...legend, ...routes].join('\n');
}

/**
 * `show access-lists` — the device's configured ACLs.
 * @param {import('../devices/Device.js').Device} device
 * @returns {string}
 */
export function renderAccessLists(device) {
  const acls = device.config.acls ?? {};
  const ids = Object.keys(acls);
  if (ids.length === 0) return '';
  return ids.flatMap((id) => renderAcl(id, acls[id])).join('\n');
}

/**
 * `show ip nat translations` — active translations recorded by the engine.
 * @param {import('./CliSession.js').CliSession} session
 * @returns {string}
 */
function renderNatTranslations(session) {
  const header = 'Pro Inside global     Inside local      Outside local     Outside global';
  const engine = session.packetEngine;
  if (!engine) return header;
  const rows = engine
    .natTableFor(session.node.id)
    .map(
      (t) =>
        `${pad(t.protocol, 4)}${pad(t.insideGlobal, 18)}${pad(t.insideLocal, 18)}${pad(
          t.outsideLocal,
          18,
        )}${t.outsideGlobal}`,
    );
  return [header, ...rows].join('\n');
}

/**
 * `show ip ospf neighbor` — the router's OSPF adjacencies from the engine.
 * @param {import('./CliSession.js').CliSession} session
 * @returns {string}
 */
function renderOspfNeighbor(session) {
  if (!session.device.config.ospf) return '';
  const header = 'Neighbor ID     Pri   State           Dead Time   Address         Interface';
  const engine = session.packetEngine;
  if (!engine) return header;

  const neighbors = engine.ospf().neighbors.get(session.node.id) ?? [];
  const rows = neighbors.map(
    (n) =>
      `${pad(n.routerId, 16)}${pad(String(n.priority), 6)}${pad(n.state, 16)}${pad(
        '00:00:38',
        12,
      )}${pad(n.address, 16)}${shortName(n.localIface)}`,
  );
  return [header, ...rows].join('\n');
}

/**
 * `show spanning-tree` — reflects the engine's computed tree: whether this
 * bridge is root, and the role/state of each inter-switch port.
 * @param {import('./CliSession.js').CliSession} session
 * @returns {string}
 */
export function renderSpanningTree(session) {
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
 * @param {import('./CliSession.js').CliSession} session
 * @returns {number}
 */
function privilegeLevel(session) {
  const mode = session.currentMode ?? '';
  return mode.startsWith('user') ? 1 : 15;
}

/**
 * @returns {string}
 */
function renderFlash() {
  return [
    'Directory of flash:/',
    '',
    '    1  -rw-    16384000   <no date>  ios.bin',
    '    2  -rw-        1024   <no date>  config.text',
    '',
    '64016384 bytes total (47632384 bytes free)',
  ].join('\n');
}

/**
 * @returns {string}
 */
function renderVtpStatus() {
  return [
    'VTP Version capable             : 1 to 3',
    'VTP Version running             : 1',
    'VTP Domain Name                 :',
    'VTP Pruning Mode                : Disabled',
    'VTP Traps Generation            : Disabled',
    'Configuration Revision          : 0',
  ].join('\n');
}

/**
 * @returns {string}
 */
function renderEtherchannelSummary() {
  return [
    'Flags:  D - down        P - bundled in port-channel',
    '        I - stand-alone s - suspended',
    '',
    'Number of channel-groups in use: 0',
    'Number of aggregators:           0',
    '',
    'Group  Port-channel  Protocol    Ports',
    '------+-------------+-----------+-----------------------------------------',
  ].join('\n');
}

/**
 * `show port-security` — per-interface secure-port summary (feature not yet
 * enforced by the engine, but the command is available for study).
 * @param {import('../devices/Device.js').Device} device
 * @returns {string}
 */
function renderPortSecurity(device) {
  if (!device.capabilities.switching) {
    return '% Port security is only available on switches.';
  }
  return [
    'Secure Port  MaxSecureAddr  CurrentAddr  SecurityViolation  Security Action',
    '                (Count)       (Count)          (Count)',
    '---------------------------------------------------------------------------',
    '---------------------------------------------------------------------------',
    'Total Addresses in System (excluding one mac per port)     : 0',
    'Max Addresses limit in System (excluding one mac per port) : 4096',
  ].join('\n');
}

/**
 * `show interfaces status` — the switch port table.
 * @param {import('./CliSession.js').CliSession} session
 * @returns {string}
 */
function renderInterfacesStatus(session) {
  const { device, topology, node } = session;
  const usedPorts = new Set();
  for (const edge of topology.getEdgesForNode(node.id)) {
    const port = topology.portForNode(edge, node.id);
    if (port) usedPorts.add(port);
  }

  const header = 'Port      Name               Status       Vlan       Duplex  Speed Type';
  const rows = device.interfaces.map((iface) => {
    const status = usedPorts.has(iface.name)
      ? iface.enabled
        ? 'connected'
        : 'disabled'
      : 'notconnect';
    const vlan = iface.switchportMode === 'trunk' ? 'trunk' : String(iface.accessVlan ?? 1);
    return `${pad(shortName(iface.name), 10)}${pad('', 19)}${pad(status, 13)}${pad(vlan, 11)}${pad('auto', 8)}${pad('auto', 6)}10/100BaseTX`;
  });
  return [header, ...rows].join('\n');
}

/**
 * `show ip protocols` — a compact view of running routing protocols.
 * @param {import('./CliSession.js').CliSession} session
 * @returns {string}
 */
function renderIpProtocols(session) {
  const ospf = session.device.config.ospf;
  if (!ospf) return '';
  const lines = [`Routing Protocol is "ospf ${ospf.processId}"`];
  if (ospf.routerId) lines.push(`  Router ID ${ospf.routerId}`);
  lines.push('  Routing for Networks:');
  for (const net of ospf.networks ?? []) {
    lines.push(`    ${net.address} ${net.wildcard} area ${net.area}`);
  }
  return lines.join('\n');
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
export function pad(text, width) {
  const str = String(text);
  return str.length >= width ? `${str} ` : str.padEnd(width, ' ');
}
