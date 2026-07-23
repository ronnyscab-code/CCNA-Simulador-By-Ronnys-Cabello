/**
 * showCommandsExtra.js
 *
 * The "cheat-sheet" breadth of `show ...` commands — the long tail a CCNA
 * learner reaches for (interfaces/vlan/spanning-tree/ip/etherchannel/...).
 * Split out of `showCommands.js` to keep each file under control.
 *
 * Commands backed by real simulated state (ARP, neighbors, VLANs, single
 * interface, OSPF, DHCP pools, spanning-tree filters, MAC-table filters,
 * port-security) render live data. Device-health commands the simulator does
 * not model (processes/memory/environment/inventory/…) return a plausible,
 * well-formed stub so the CLI is always usable and never errors — matching
 * the rest of the `show` surface.
 */

import {
  renderInterfaces,
  renderVlanBrief,
  renderIpInterfaceBrief,
  shortName,
} from './RunningConfig.js';
import {
  renderMacAddressTable,
  renderCdpNeighbors,
  renderSpanningTree,
  renderIpRoute,
  renderAccessLists,
  pad,
} from './showCommands.js';

/**
 * Registers the extended `show` set onto a command tree.
 * @param {import('./CommandTree.js').CommandTree} tree
 */
export function registerExtraShowCommands(tree) {
  const add = (path, fn) => tree.add(path, fn);

  // --- ARP -------------------------------------------------------------
  add('show ip arp', renderArp);
  add('show arp', renderArp); // richer than the placeholder header in showCommands

  // --- CDP / LLDP neighbors -------------------------------------------
  add('show cdp', () => 'Global CDP information:\n  Sending CDP packets every 60 seconds');
  add('show lldp', () => 'Global LLDP Information:\n  Status: ACTIVE');
  add('show lldp neighbors detail', (s) => renderNeighbors(s, 'lldp'));

  // --- VLANs -----------------------------------------------------------
  add('show vlan', (s) => renderVlanBrief(s.device));
  add('show vlan id <n>', (s, a) => renderVlanFiltered(s.device, { id: Number(a.n) }));
  add('show vlan name <name>', (s, a) => renderVlanFiltered(s.device, { name: a.name }));
  add('show vlan internal usage', () => 'VLAN Usage\n---- --------------------');
  add('show vlan access-map', () => 'Vlan access-map is not configured');
  add('show vlan filter', () => 'VLAN Map has no filters configured');

  // --- Interfaces (verbose + facets) ----------------------------------
  // Per-interface forms hang off the same `interfaces` node as the global
  // ones, and `interface` is registered below as an alias of it — otherwise
  // `sh int status` would be ambiguous, which real IOS never reports.
  add('show interfaces <name>', (s, a) => renderOneInterface(s.device, a.name));
  add('show interfaces <name> status', (s, a) => renderIfStatusOne(s, a.name));
  add('show interfaces <name> switchport', (s, a) => renderSwitchportOne(s.device, a.name));
  add('show interfaces <name> description', (s, a) => renderIfDescription(s.device, a.name));
  add('show interfaces <name> counters', (s, a) => renderIfCounters(s.device, a.name));

  add('show interfaces description', (s) => renderIfDescription(s.device));
  add('show interfaces switchport', (s) => renderSwitchportAll(s.device));
  add('show interfaces trunk', (s) => renderTrunk(s.device));
  add('show interfaces counters', (s) => renderIfCounters(s.device));
  add('show interfaces counters errors', (s) => renderIfCounters(s.device, null, 'errors'));
  add('show interfaces counters protocol', (s) => renderIfCounters(s.device, null, 'protocol'));
  add('show interfaces summary', (s) => renderIfSummary(s.device));
  add('show interfaces vlan', (s) => renderVlanBrief(s.device));
  // Health/optics facets: recognized, empty-but-plausible.
  for (const facet of [
    'accounting',
    'capabilities',
    'flowcontrol',
    'link',
    'mtu',
    'queueing',
    'rate-limit',
    'stats',
    'transceiver',
    'transceiver detail',
    'transceiver properties',
  ]) {
    add(
      `show interfaces ${facet}`,
      () => `% Interface ${facet} data not modeled in the simulator.`,
    );
  }

  // --- IP --------------------------------------------------------------
  add('show ip access-lists', (s) => renderAccessLists(s.device));
  add('show ip route summary', (s) => renderIpRouteSummary(s));
  add('show ip route vrf <name>', (s) => renderIpRoute(s));
  add('show ip ospf', (s) => renderOspf(s.device));
  add('show ip ospf database', (s) => renderOspfDatabase(s.device));
  add('show ip ssh', () => 'SSH Enabled - version 2.0\nAuthentication timeout: 120 secs');
  add('show ip cef', () => 'Prefix              Next Hop             Interface');
  add('show ip bgp', () => '% BGP not active');
  add('show ip bgp summary', () => '% BGP not active');
  add('show ip eigrp neighbors', () => 'EIGRP-IPv4 Neighbors for AS(0)');
  add('show ip eigrp topology', () => 'EIGRP-IPv4 Topology Table for AS(0)/ID(0.0.0.0)');
  add('show ip dhcp pool', (s) => renderDhcpPools(s.device));
  add('show ip dhcp conflict', () => 'IP address        Detection method   Detection time');
  add(
    'show ip dhcp server statistics',
    () =>
      'Memory usage         0\nAddress pools        0\nOffer                0\nAck                  0',
  );
  add('show ip dhcp snooping', () => 'Switch DHCP snooping is disabled');
  add(
    'show ip dhcp snooping binding',
    () => 'MacAddress          IpAddress        Lease(sec)  Type',
  );

  // --- Spanning tree ---------------------------------------------------
  add('show spanning-tree summary', (s) => renderStpSummary(s));
  add('show spanning-tree detail', (s) => renderSpanningTree(s));
  add('show spanning-tree root', (s) => renderStpRoot(s));
  add('show spanning-tree bridge', (s) => renderStpBridge(s));
  add(
    'show spanning-tree blockedports',
    () => 'Number of blocked ports (segments) in the system : 0',
  );
  add(
    'show spanning-tree inconsistentports',
    () => 'Number of inconsistent ports (segments) in the system : 0',
  );
  add('show spanning-tree statistics', () => 'BPDU statistics not modeled in the simulator.');
  add('show spanning-tree vlan <n>', (s) => renderSpanningTree(s));
  add('show spanning-tree interface <name>', (s) => renderSpanningTree(s));
  add('show spanning-tree mst', () => '% Switch is not in mst mode');
  add('show spanning-tree mst configuration', () =>
    [
      'Name      [ ]',
      'Revision  0     Instances configured 1',
      '',
      'Instance  Vlans mapped',
      '-------- ---------------------',
      '0        1-4094',
    ].join('\n'),
  );
  add('show spanning-tree mst detail', () => '% Switch is not in mst mode');

  // --- MAC address-table facets ---------------------------------------
  add('show mac address-table dynamic', (s) => renderMacAddressTable(s));
  add('show mac address-table vlan <n>', (s) => renderMacAddressTable(s));
  add('show mac address-table interface <name>', (s) => renderMacAddressTable(s));

  // --- Port security ---------------------------------------------------
  add('show port-security interface <name>', (s, a) => renderPortSecurityIface(s.device, a.name));

  // --- EtherChannel / LACP / PAgP -------------------------------------
  add('show etherchannel detail', () => 'Group  Port-channel  Protocol    Ports');
  add(
    'show etherchannel load-balance',
    () => 'EtherChannel Load-Balancing Configuration:\n  src-dst-ip',
  );
  add('show etherchannel port-channel', () => 'Channel-group listing:');
  add('show lacp counters', () => 'LACPDUs         Marker      Marker Response   LACPDUs');
  add('show lacp neighbor', () => 'Flags:  S - Device is requesting Slow LACPDUs');
  add('show pagp neighbor', () => 'Flags:  S - Device is sending Slow hello.');

  // --- Device health / platform (recognized stubs) --------------------
  add('show configuration', (s) => s.device.startupConfig ?? '% Startup config not present.');
  add('show calendar', () => 'Mon Jan  1 00:00:00 UTC 2001');
  add(
    'show aliases',
    () => 'exec mode aliases:\n  h        help\n  p        ping\n  s        show',
  );
  add('show archive', () => 'The maximum archive configurations allowed is 10.');
  add('show authentication sessions', () => 'No sessions currently exist');
  add(
    'show errdisable recovery',
    () => 'ErrDisable Reason     Timer Status\n-----------------     --------------',
  );
  add('show file systems', () => renderFileSystems());
  add('show inventory', (s) => renderInventory(s.device));
  add('show environment', () => 'SYSTEM: OK');
  add('show environment all', () => 'SYSTEM: OK\nFANS: OK\nTEMPERATURE: OK\nPOWER: OK');
  add('show buffers', () => 'Buffer elements: 0 in free list');
  add('show memory', () => 'Head    Total(b)     Used(b)     Free(b)');
  add('show memory statistics', () => 'Head    Total(b)     Used(b)     Free(b)');
  add(
    'show processes cpu',
    () => 'CPU utilization for five seconds: 0%/0%; one minute: 0%; five minutes: 0%',
  );
  add(
    'show processes cpu sorted',
    () => 'CPU utilization for five seconds: 0%/0%; one minute: 0%; five minutes: 0%',
  );
  add('show processes memory', () => 'Total: 0, Used: 0, Free: 0');
  add('show processes memory sorted', () => 'Total: 0, Used: 0, Free: 0');
  add('show platform', () => '% Platform data not modeled in the simulator.');
  add('show switch', () => renderSwitchStack(tree));
  add(
    'show redundancy',
    () => 'Redundant System Information:\n  Available system uptime = 0 minutes',
  );
  add('show reload', () => 'No reload is scheduled.');
  add('show license', () => 'Smart Licensing is DISABLED');
  add('show license summary', () => 'Smart Licensing is DISABLED');
  add('show power inline', () => 'Module   Available(W)   Used(W)   Remaining(W)');
  add('show parser statistics', () => 'Last configuration file parsed: 0 lines');
  add('show logging onboard', () => 'OnBoard Failure Logging not supported / no data.');
  add(
    'show vrf',
    () => '  Name                             Default RD          Protocols   Interfaces',
  );
  add(
    'show tech-support',
    (s) =>
      `------------------ show version ------------------\n(see 'show version' — full tech-support is not modeled)\n\nHostname: ${s.device.hostname}`,
  );

  // IOS accepts both spellings as one keyword, so `sh int`, `sh inter` and
  // `sh interface Gi0/0` all land on the `show interfaces` subtree.
  tree.alias('show interfaces', 'interface');
}

// --- real renderers ------------------------------------------------------

/**
 * @param {import('./CliSession.js').CliSession} session
 * @returns {string}
 */
function renderArp(session) {
  const header = 'Protocol  Address          Age (min)  Hardware Addr   Type   Interface';
  const rows = [];
  for (const iface of session.device.interfaces) {
    if (iface.ipAddress) {
      rows.push(arpRow(iface.ipAddress, '-', iface.mac, shortName(iface.name)));
    }
  }
  const cache = session.packetEngine?.arpCacheFor(session.node.id);
  if (cache) {
    for (const { ip, mac } of cache.toArray()) rows.push(arpRow(ip, '0', mac, ''));
  }
  return [header, ...rows].join('\n');
}

function arpRow(ip, age, mac, iface) {
  return `Internet  ${pad(ip, 17)}${pad(age, 11)}${pad(mac, 16)}ARPA   ${iface}`;
}

/**
 * @param {import('./CliSession.js').CliSession} session
 * @param {'cdp'|'lldp'} kind
 * @returns {string}
 */
function renderNeighbors(session, kind) {
  if (kind === 'cdp') return renderCdpNeighbors(session);
  const topology = session.topology;
  const id = session.node?.id;
  if (!topology || !id) return 'No neighbors.';
  const blocks = [];
  for (const edge of topology.getEdgesForNode(id)) {
    const otherId = edge.otherNodeId(id);
    const other = topology.getNode(otherId);
    if (!other) continue;
    blocks.push(
      [
        '------------------------------------------------',
        `Local Intf: ${shortName(topology.portForNode(edge, id))}`,
        `Chassis id: ${other.hostname}`,
        `Port id: ${shortName(topology.portForNode(edge, otherId))}`,
        `System Name: ${other.hostname}`,
      ].join('\n'),
    );
  }
  return blocks.length ? blocks.join('\n') : 'No neighbors.';
}

function renderVlanFiltered(device, { id = null, name = null }) {
  const full = renderVlanBrief(device).split('\n');
  const header = full.slice(0, 2);
  const rows = full.slice(2).filter((line) => {
    if (id !== null) return line.trimStart().startsWith(`${id} `);
    if (name !== null) return line.toLowerCase().includes(name.toLowerCase());
    return true;
  });
  return rows.length ? [...header, ...rows].join('\n') : `% VLAN not found`;
}

function renderOneInterface(device, name) {
  const iface = device.resolveInterface(name);
  if (!iface) return `% Invalid interface ${name}`;
  return renderInterfaces({ interfaces: [iface] });
}

function renderIfStatusOne(session, name) {
  const iface = session.device.resolveInterface(name);
  if (!iface) return `% Invalid interface ${name}`;
  const brief = renderIpInterfaceBrief(session.device).split('\n');
  const row = brief.find((l) => l.startsWith(iface.name));
  return [brief[0], row ?? ''].join('\n');
}

function renderSwitchportOne(device, name) {
  const iface = device.resolveInterface(name);
  if (!iface) return `% Invalid interface ${name}`;
  return switchportBlock(iface);
}

function renderSwitchportAll(device) {
  if (!device.capabilities.switching) return '';
  return device.interfaces.map(switchportBlock).join('\n');
}

function switchportBlock(iface) {
  const mode = iface.switchportMode === 'trunk' ? 'trunk' : 'static access';
  return [
    `Name: ${shortName(iface.name)}`,
    `Switchport: Enabled`,
    `Administrative Mode: ${mode}`,
    `Operational Mode: ${mode}`,
    `Access Mode VLAN: ${iface.accessVlan ?? 1}`,
    '',
  ].join('\n');
}

function renderTrunk(device) {
  const header = 'Port        Mode         Encapsulation  Status        Native vlan';
  const rows = device.interfaces
    .filter((i) => i.switchportMode === 'trunk')
    .map(
      (i) =>
        `${pad(shortName(i.name), 12)}${pad('on', 13)}${pad('802.1q', 15)}${pad('trunking', 14)}1`,
    );
  return [header, ...rows].join('\n');
}

function renderIfDescription(device, name = null) {
  const header = 'Interface              Status         Protocol Description';
  const list = name ? [device.resolveInterface(name)].filter(Boolean) : device.interfaces;
  if (name && list.length === 0) return `% Invalid interface ${name}`;
  const rows = list.map((i) => {
    const status = i.enabled ? 'up' : 'admin down';
    const proto = i.enabled ? 'up' : 'down';
    return `${pad(i.name, 23)}${pad(status, 15)}${pad(proto, 9)}${i.description ?? ''}`;
  });
  return [header, ...rows].join('\n');
}

function renderIfCounters(device, name = null, variant = null) {
  const list = name ? [device.resolveInterface(name)].filter(Boolean) : device.interfaces;
  if (name && list.length === 0) return `% Invalid interface ${name}`;
  const header =
    variant === 'errors'
      ? 'Port         Align-Err  FCS-Err  Xmit-Err  Rcv-Err  UnderSize'
      : 'Port            InOctets   InUcastPkts   OutOctets   OutUcastPkts';
  const rows = list.map((i) =>
    variant === 'errors'
      ? `${pad(shortName(i.name), 13)}${pad('0', 11)}${pad('0', 9)}${pad('0', 10)}${pad('0', 9)}0`
      : `${pad(shortName(i.name), 16)}${pad('0', 11)}${pad('0', 14)}${pad('0', 12)}0`,
  );
  return [header, ...rows].join('\n');
}

function renderIfSummary(device) {
  const header = ' Interface               IHQ   IQD  OHQ   OQD  RXBS RXPS TXBS TXPS  TRTL';
  const rows = device.interfaces.map(
    (i) => `* ${pad(i.name, 22)} 0     0    0     0     0    0    0    0     0`,
  );
  return [header, ...rows].join('\n');
}

function renderOspf(device) {
  const ospf = device.config.ospf;
  if (!ospf) return '% OSPF is not running';
  return [
    ` Routing Process "ospf ${ospf.processId}" with ID ${ospf.routerId ?? '0.0.0.0'}`,
    ' Supports only single TOS(TOS0) routes',
    ' Number of areas in this router is 1',
  ].join('\n');
}

function renderOspfDatabase(device) {
  const ospf = device.config.ospf;
  if (!ospf) return '% OSPF is not running';
  return [
    `            OSPF Router with ID (${ospf.routerId ?? '0.0.0.0'}) (Process ID ${ospf.processId})`,
    '',
    '                Router Link States (Area 0)',
    '',
    'Link ID         ADV Router      Age         Seq#       Checksum Link count',
  ].join('\n');
}

function renderDhcpPools(device) {
  const pools = Object.entries(device.config.dhcpPools ?? {});
  if (pools.length === 0) return '% No DHCP pools configured.';
  return pools
    .map(([name, pool]) =>
      [
        `Pool ${name} :`,
        ` Utilization mark (high/low)    : 100 / 0`,
        ` Subnet size (first/next)       : 0 / 0`,
        ` Total addresses                : 254`,
        ` Network                        : ${pool.network ?? '0.0.0.0'} ${pool.mask ?? ''}`.trim(),
      ].join('\n'),
    )
    .join('\n');
}

function renderIpRouteSummary() {
  return [
    'IP routing table name is default (0x0)',
    'Route Source    Networks    Subnets     Overhead    Memory (bytes)',
    'connected       0           0           0           0',
    'static          0           0           0           0',
    'Total           0           0           0           0',
  ].join('\n');
}

function renderStpSummary(session) {
  const root = session.device.capabilities.switching
    ? 'is executing the ieee compatible Spanning Tree protocol'
    : '';
  return [
    `Switch ${root}`.trim(),
    'Root bridge for: none',
    'Extended system ID           is enabled',
    '',
    'Name                   Blocking Listening Learning Forwarding STP Active',
    '---------------------- -------- --------- -------- ---------- ----------',
  ].join('\n');
}

function renderStpRoot(session) {
  if (!session.device.capabilities.switching) return 'Spanning tree runs on switches.';
  return [
    'Vlan                   Root ID          Cost    Time  Age  Dly  Root Port',
    '---------------- -------------------- ------- ----- ---- ---- ------------',
    'VLAN0001         32769 aabb.ccdd.eeff        0    2   20   15',
  ].join('\n');
}

function renderStpBridge(session) {
  if (!session.device.capabilities.switching) return 'Spanning tree runs on switches.';
  return [
    '                                                   Hello  Max  Fwd',
    'Vlan                Bridge ID              Time  Age  Dly  Protocol',
    '---------------- -------------------- ----- ---- ---- --------',
    'VLAN0001         32769 aabb.ccdd.eeff      2   20   15  ieee',
  ].join('\n');
}

function renderPortSecurityIface(device, name) {
  const iface = device.resolveInterface(name);
  if (!iface) return `% Invalid interface ${name}`;
  return [
    `Port Security              : Disabled`,
    `Port Status                : Secure-down`,
    `Violation Mode             : Shutdown`,
    `Maximum MAC Addresses      : 1`,
    `Total MAC Addresses        : 0`,
    `Sticky MAC Addresses       : 0`,
    `Security Violation Count   : 0`,
  ].join('\n');
}

function renderFileSystems() {
  return [
    'File Systems:',
    '',
    '     Size(b)     Free(b)      Type  Flags  Prefixes',
    '*   256000000   200000000     disk  rw     flash:',
    '           -           -    opaque  rw     system:',
    '           -           -    nvram   rw     nvram:',
  ].join('\n');
}

function renderInventory(device) {
  return [
    `NAME: "${device.hostname}", DESCR: "${device.model ?? device.type}"`,
    'PID: OPENCCNA-SIM     , VID: V01, SN: SIM0000000',
  ].join('\n');
}

function renderSwitchStack(tree) {
  void tree;
  return [
    'Switch/Stack Mac Address : aabb.ccdd.eeff',
    '                                           H/W   Current',
    'Switch#   Role    Mac Address     Priority Version  State',
    '*1       Active   aabb.ccdd.eeff   1        V01      Ready',
  ].join('\n');
}
