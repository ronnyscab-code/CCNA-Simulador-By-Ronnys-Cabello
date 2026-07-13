/**
 * commands.js
 *
 * Builds the command tree for each CLI mode and registers every handler.
 * Handlers are `(session, args) => string | void`; they mutate the device
 * model and call `session.notifyConfigChanged()` when they change config,
 * then the host app persists/redraws. Mode-changing commands (`enable`,
 * `configure terminal`, `interface`, `exit`, `end`, ...) call the
 * corresponding `session` transition method.
 *
 * `show` commands are registered by `registerShowCommands` (see
 * showCommands.js) on the two EXEC trees.
 */

import { CommandTree } from './CommandTree.js';
import { Mode } from './modes.js';
import { registerShowCommands } from './showCommands.js';
import { renderRunningConfig } from './RunningConfig.js';
import { isValidIpv4, isValidSubnetMask } from '../devices/net-utils.js';

/**
 * @returns {Map<string, CommandTree>}
 */
export function buildCommandTrees() {
  const trees = new Map();
  trees.set(Mode.USER_EXEC, buildUserExec());
  trees.set(Mode.PRIVILEGED_EXEC, buildPrivilegedExec());
  trees.set(Mode.GLOBAL_CONFIG, buildGlobalConfig());
  trees.set(Mode.INTERFACE_CONFIG, buildInterfaceConfig());
  trees.set(Mode.VLAN_CONFIG, buildVlanConfig());
  trees.set(Mode.LINE_CONFIG, buildLineConfig());
  trees.set(Mode.ROUTER_CONFIG, buildRouterConfig());
  return trees;
}

// --- User EXEC ---------------------------------------------------------

function buildUserExec() {
  const tree = new CommandTree();
  tree.add('enable', (session) => {
    session.enterPrivileged();
  });
  tree.add('ping <target>', (session, args) => pingCommand(session, args.target));
  tree.add('traceroute <target>', (session, args) => tracerouteCommand(session, args.target));
  tree.add('exit', () => '');
  tree.add('logout', () => '');
  registerShowCommands(tree);
  return tree;
}

// --- Privileged EXEC ---------------------------------------------------

function buildPrivilegedExec() {
  const tree = new CommandTree();
  tree.add('disable', (session) => {
    session.enterUser();
  });
  tree.add('configure terminal', (session) => {
    session.enterGlobalConfig();
    return 'Enter configuration commands, one per line. End with CNTL/Z.';
  });
  tree.add('copy running-config startup-config', (session) => saveConfig(session));
  tree.add('write memory', (session) => saveConfig(session));
  tree.add('write', (session) => saveConfig(session));
  tree.add('erase startup-config', (session) => {
    session.device.startupConfig = null;
    session.notifyConfigChanged();
    return 'Erasing the nvram filesystem...\n[OK]';
  });
  tree.add('reload', () => 'System configuration reloaded. (Dynamic tables cleared.)');
  tree.add('ping <target>', (session, args) => pingCommand(session, args.target));
  tree.add('traceroute <target>', (session, args) => tracerouteCommand(session, args.target));
  tree.add('exit', (session) => {
    session.enterUser();
  });
  registerShowCommands(tree);
  return tree;
}

function saveConfig(session) {
  session.device.startupConfig = renderRunningConfig(session.device);
  session.notifyConfigChanged();
  return 'Building configuration...\n[OK]';
}

// --- Global config -----------------------------------------------------

function buildGlobalConfig() {
  const tree = new CommandTree();

  tree.add('hostname <name>', (session, args) => {
    session.device.hostname = args.name;
    session.notifyConfigChanged();
  });

  tree.add('interface <name>', (session, args) => {
    const iface = session.device.resolveInterface(args.name);
    if (!iface) return `% Invalid interface ${args.name}`;
    session.enterInterface(iface);
  });

  tree.add('vlan <id>', (session, args) => {
    const id = Number(args.id);
    if (!Number.isInteger(id) || id < 1 || id > 4094) return '% Invalid VLAN id (1-4094).';
    if (!session.device.config.vlans[id]) session.device.config.vlans[id] = { name: null };
    session.enterVlan(id);
    session.notifyConfigChanged();
  });
  tree.add('no vlan <id>', (session, args) => {
    delete session.device.config.vlans[Number(args.id)];
    session.notifyConfigChanged();
  });

  tree.add('line <type> <range...>', (session, args) => {
    session.enterLine(`${args.type} ${args.range}`.trim());
  });

  tree.add('router ospf <pid>', (session, args) => {
    const processId = Number(args.pid);
    if (!session.device.config.ospf) {
      session.device.config.ospf = { processId, routerId: null, networks: [] };
    } else {
      session.device.config.ospf.processId = processId;
    }
    session.enterRouter({ protocol: 'ospf', id: processId });
    session.notifyConfigChanged();
  });

  tree.add('ip route <prefix> <mask> <nexthop>', (session, args) => {
    if (!isValidIpv4(args.prefix) || !isValidSubnetMask(args.mask) || !isValidIpv4(args.nexthop)) {
      return '% Invalid input detected.';
    }
    session.device.config.staticRoutes.push({
      prefix: args.prefix,
      mask: args.mask,
      nextHop: args.nexthop,
    });
    session.notifyConfigChanged();
  });
  tree.add('no ip route <prefix> <mask> <nexthop>', (session, args) => {
    session.device.config.staticRoutes = session.device.config.staticRoutes.filter(
      (r) => !(r.prefix === args.prefix && r.mask === args.mask && r.nextHop === args.nexthop),
    );
    session.notifyConfigChanged();
  });

  addExitEnd(tree);
  return tree;
}

// --- Interface config --------------------------------------------------

function buildInterfaceConfig() {
  const tree = new CommandTree();

  tree.add('ip address <ip> <mask>', (session, args) => {
    try {
      session.currentInterface.setIp(args.ip, args.mask);
      session.notifyConfigChanged();
    } catch {
      return "% Invalid input detected at '^' marker.";
    }
  });
  tree.add('no ip address', (session) => {
    session.currentInterface.clearIp();
    session.notifyConfigChanged();
  });

  tree.add('description <text...>', (session, args) => {
    session.currentInterface.description = args.text;
    session.notifyConfigChanged();
  });
  tree.add('no description', (session) => {
    session.currentInterface.description = '';
    session.notifyConfigChanged();
  });

  tree.add('shutdown', (session) => {
    session.currentInterface.enabled = false;
    session.notifyConfigChanged();
  });
  tree.add('no shutdown', (session) => {
    session.currentInterface.enabled = true;
    session.notifyConfigChanged();
  });

  tree.add('switchport mode access', (session) => {
    session.currentInterface.switchportMode = 'access';
    session.notifyConfigChanged();
  });
  tree.add('switchport mode trunk', (session) => {
    session.currentInterface.switchportMode = 'trunk';
    session.notifyConfigChanged();
  });
  tree.add('switchport access vlan <id>', (session, args) => {
    session.currentInterface.accessVlan = Number(args.id);
    session.notifyConfigChanged();
  });
  tree.add('switchport trunk allowed vlan <list>', (session, args) => {
    session.currentInterface.trunkAllowedVlans = parseVlanList(args.list);
    session.notifyConfigChanged();
  });

  addExitEnd(tree);
  return tree;
}

// --- VLAN config -------------------------------------------------------

function buildVlanConfig() {
  const tree = new CommandTree();
  tree.add('name <name>', (session, args) => {
    const vlan = session.device.config.vlans[session.currentVlanId];
    if (vlan) vlan.name = args.name;
    session.notifyConfigChanged();
  });
  addExitEnd(tree);
  return tree;
}

// --- Line config -------------------------------------------------------

function buildLineConfig() {
  const tree = new CommandTree();
  tree.add('password <password>', (session, args) => {
    session.device.config.lines[session.currentLine] = {
      ...(session.device.config.lines[session.currentLine] ?? {}),
      password: args.password,
    };
    session.notifyConfigChanged();
  });
  tree.add('login', (session) => {
    session.device.config.lines[session.currentLine] = {
      ...(session.device.config.lines[session.currentLine] ?? {}),
      login: true,
    };
    session.notifyConfigChanged();
  });
  addExitEnd(tree);
  return tree;
}

// --- Router (OSPF) config ---------------------------------------------

function buildRouterConfig() {
  const tree = new CommandTree();
  tree.add('network <address> <wildcard> area <area>', (session, args) => {
    session.device.config.ospf.networks.push({
      address: args.address,
      wildcard: args.wildcard,
      area: Number(args.area),
    });
    session.notifyConfigChanged();
  });
  tree.add('router-id <id>', (session, args) => {
    session.device.config.ospf.routerId = args.id;
    session.notifyConfigChanged();
  });
  addExitEnd(tree);
  return tree;
}

// --- Shared helpers ----------------------------------------------------

/**
 * Adds `exit` (pop one level) and `end` (jump to privileged EXEC) to a
 * configuration-mode tree.
 * @param {CommandTree} tree
 */
function addExitEnd(tree) {
  tree.add('exit', (session) => {
    session.exitMode();
  });
  tree.add('end', (session) => {
    session.endToPrivileged();
  });
}

/**
 * Parses an IOS VLAN list like "10,20,30" or "10-12,20" into a sorted array.
 * @param {string} list
 * @returns {number[]}
 */
function parseVlanList(list) {
  const result = new Set();
  for (const part of list.split(',')) {
    const range = part.split('-').map((n) => Number(n.trim()));
    if (range.length === 2) {
      for (let i = range[0]; i <= range[1]; i += 1) result.add(i);
    } else if (Number.isInteger(range[0])) {
      result.add(range[0]);
    }
  }
  return [...result].sort((a, b) => a - b);
}

/**
 * Naive reachability check for v0.3: succeeds if the target IP is configured
 * on any enabled interface anywhere in the topology and this device has a
 * source IP. Real hop-by-hop ICMP simulation (ARP, routing, TTL) arrives
 * with the packet engine in v0.4.
 * @param {import('./CliSession.js').CliSession} session
 * @param {string} target
 * @returns {string}
 */
function pingCommand(session, target) {
  if (!isValidIpv4(target)) return `% Invalid IP address: ${target}`;
  const sourceIp = firstConfiguredIp(session.device);
  if (!sourceIp) return '% No source IP address configured on this device.';

  const reachable = topologyHasEnabledIp(session.topology, target);
  const marks = reachable ? '!!!!!' : '.....';
  const rate = reachable ? '100 percent (5/5)' : '0 percent (0/5)';
  const timing = reachable ? ', round-trip min/avg/max = 1/1/2 ms' : '';
  return [
    'Type escape sequence to abort.',
    `Sending 5, 100-byte ICMP Echos to ${target}, timeout is 2 seconds:`,
    marks,
    `Success rate is ${rate}${timing}`,
  ].join('\n');
}

/**
 * @param {import('./CliSession.js').CliSession} session
 * @param {string} target
 * @returns {string}
 */
function tracerouteCommand(session, target) {
  if (!isValidIpv4(target)) return `% Invalid IP address: ${target}`;
  const reachable = topologyHasEnabledIp(session.topology, target);
  const lines = [`Tracing the route to ${target}`, ''];
  if (reachable) {
    lines.push(`  1 ${target}  1 ms  1 ms  1 ms`);
  } else {
    lines.push('  1  *  *  *', '  (destination unreachable)');
  }
  return lines.join('\n');
}

/**
 * @param {import('../devices/Device.js').Device} device
 * @returns {string|null}
 */
function firstConfiguredIp(device) {
  const iface = device.interfaces.find((i) => i.enabled && i.ipAddress);
  return iface ? iface.ipAddress : null;
}

/**
 * @param {import('../topology/Topology.js').Topology} topology
 * @param {string} ip
 * @returns {boolean}
 */
function topologyHasEnabledIp(topology, ip) {
  return topology.getNodes().some((node) => {
    if (!node.device) return false;
    return node.device.interfaces.some((iface) => iface.enabled && iface.ipAddress === ip);
  });
}
