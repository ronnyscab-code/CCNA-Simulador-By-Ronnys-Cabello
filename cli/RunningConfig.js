/**
 * RunningConfig.js
 *
 * Renders a device's live configuration as IOS-style text — the source of
 * truth behind `show running-config`, `show startup-config` (a stored
 * snapshot of this), and `copy running-config startup-config`. Kept
 * separate from the command handlers because it is the single most
 * format-sensitive piece of output and benefits from being unit-tested on
 * its own.
 */

import { maskToPrefix } from '../devices/net-utils.js';

/**
 * @param {import('../devices/Device.js').Device} device
 * @returns {string}
 */
export function renderRunningConfig(device) {
  const lines = ['!'];
  lines.push(`hostname ${device.hostname}`);
  lines.push('!');

  // VLAN database (switches).
  const vlanIds = Object.keys(device.config.vlans)
    .map(Number)
    .sort((a, b) => a - b);
  for (const vlanId of vlanIds) {
    lines.push(`vlan ${vlanId}`);
    const name = device.config.vlans[vlanId]?.name;
    if (name) lines.push(` name ${name}`);
    lines.push('!');
  }

  // Interfaces.
  for (const iface of device.interfaces) {
    lines.push(`interface ${iface.name}`);
    if (iface.description) lines.push(` description ${iface.description}`);

    if (iface.switchportMode === 'access' && device.capabilities.switching) {
      lines.push(' switchport mode access');
      if (iface.accessVlan && iface.accessVlan !== 1) {
        lines.push(` switchport access vlan ${iface.accessVlan}`);
      }
    } else if (iface.switchportMode === 'trunk') {
      lines.push(' switchport mode trunk');
      if (Array.isArray(iface.trunkAllowedVlans) && iface.trunkAllowedVlans.length > 0) {
        lines.push(` switchport trunk allowed vlan ${iface.trunkAllowedVlans.join(',')}`);
      }
    }

    if (iface.dhcp) {
      lines.push(' ip address dhcp');
    } else if (iface.ipAddress && iface.subnetMask) {
      lines.push(` ip address ${iface.ipAddress} ${iface.subnetMask}`);
    } else if (!device.capabilities.switching) {
      lines.push(' no ip address');
    }

    if (iface.aclIn) lines.push(` ip access-group ${iface.aclIn} in`);
    if (iface.aclOut) lines.push(` ip access-group ${iface.aclOut} out`);

    lines.push(iface.enabled ? ' no shutdown' : ' shutdown');
    lines.push('!');
  }

  // OSPF process.
  const ospf = device.config.ospf;
  if (ospf) {
    lines.push(`router ospf ${ospf.processId}`);
    if (ospf.routerId) lines.push(` router-id ${ospf.routerId}`);
    for (const net of ospf.networks ?? []) {
      lines.push(` network ${net.address} ${net.wildcard} area ${net.area}`);
    }
    lines.push('!');
  }

  // Static routes.
  for (const route of device.config.staticRoutes) {
    lines.push(`ip route ${route.prefix} ${route.mask} ${route.nextHop}`);
  }
  if (device.config.staticRoutes.length > 0) lines.push('!');

  // DHCP server.
  for (const range of device.config.dhcpExcluded ?? []) {
    lines.push(`ip dhcp excluded-address ${range.lo} ${range.hi}`);
  }
  for (const [name, pool] of Object.entries(device.config.dhcpPools ?? {})) {
    lines.push(`ip dhcp pool ${name}`);
    if (pool.network && pool.mask) lines.push(` network ${pool.network} ${pool.mask}`);
    if (pool.defaultRouter) lines.push(` default-router ${pool.defaultRouter}`);
    if (pool.dnsServer) lines.push(` dns-server ${pool.dnsServer}`);
    lines.push('!');
  }

  // Access lists.
  for (const [id, acl] of Object.entries(device.config.acls ?? {})) {
    for (const ace of acl.entries) {
      const src =
        ace.srcWildcard === '255.255.255.255'
          ? 'any'
          : ace.srcWildcard === '0.0.0.0'
            ? `host ${ace.srcIp}`
            : `${ace.srcIp} ${ace.srcWildcard}`;
      lines.push(`access-list ${id} ${ace.action} ${src}`);
    }
  }

  lines.push('end');
  return lines.join('\n');
}

/**
 * `show ip interface brief` — the connectivity table CCNA students live in.
 * Protocol/line state is derived by the packet engine in later versions; for
 * now "up" means administratively enabled with the fields present.
 * @param {import('../devices/Device.js').Device} device
 * @returns {string}
 */
export function renderIpInterfaceBrief(device) {
  const header = 'Interface              IP-Address      OK? Method Status                Protocol';
  const rows = device.interfaces.map((iface) => {
    const ip = iface.ipAddress ?? 'unassigned';
    const method = iface.ipAddress ? 'manual' : 'unset';
    const status = iface.enabled ? 'up' : 'administratively down';
    const protocol = iface.enabled ? 'up' : 'down';
    return (
      pad(iface.name, 23) +
      pad(ip, 16) +
      pad('YES', 4) +
      pad(method, 7) +
      pad(status, 22) +
      protocol
    );
  });
  return [header, ...rows].join('\n');
}

/**
 * `show interfaces` — verbose per-interface block.
 * @param {import('../devices/Device.js').Device} device
 * @returns {string}
 */
export function renderInterfaces(device) {
  const blocks = device.interfaces.map((iface) => {
    const adminState = iface.enabled ? 'up' : 'administratively down';
    const protocol = iface.enabled ? 'up' : 'down';
    const lines = [
      `${iface.name} is ${adminState}, line protocol is ${protocol}`,
      `  Hardware is Ethernet, address is ${iface.mac}`,
    ];
    if (iface.description) lines.push(`  Description: ${iface.description}`);
    if (iface.ipAddress && iface.subnetMask) {
      lines.push(`  Internet address is ${iface.ipAddress}/${maskToPrefix(iface.subnetMask)}`);
    }
    lines.push('  MTU 1500 bytes, BW 1000000 Kbit/sec');
    return lines.join('\n');
  });
  return blocks.join('\n');
}

/**
 * `show vlan brief` — VLAN 1 always exists; access ports are listed under
 * their VLAN.
 * @param {import('../devices/Device.js').Device} device
 * @returns {string}
 */
export function renderVlanBrief(device) {
  const header = 'VLAN Name                             Status    Ports';
  const separator =
    '---- -------------------------------- --------- -------------------------------';

  /** @type {Map<number, {name: string, ports: string[]}>} */
  const vlans = new Map();
  vlans.set(1, { name: 'default', ports: [] });
  for (const [id, info] of Object.entries(device.config.vlans)) {
    vlans.set(Number(id), { name: info.name ?? `VLAN${id}`, ports: [] });
  }

  for (const iface of device.interfaces) {
    if (iface.switchportMode === 'access') {
      const vlanId = iface.accessVlan ?? 1;
      if (!vlans.has(vlanId)) vlans.set(vlanId, { name: `VLAN${vlanId}`, ports: [] });
      vlans.get(vlanId).ports.push(shortName(iface.name));
    }
  }

  const rows = [...vlans.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([id, info]) => {
      return pad(String(id), 5) + pad(info.name, 33) + pad('active', 10) + info.ports.join(', ');
    });

  return [header, separator, ...rows].join('\n');
}

/**
 * Abbreviates an interface name IOS-style for compact tables:
 * "GigabitEthernet0/1" → "Gi0/1", "FastEthernet0/1" → "Fa0/1".
 * @param {string} name
 * @returns {string}
 */
export function shortName(name) {
  const match = name.match(/^([A-Za-z]{2})[A-Za-z]*(.*)$/);
  return match ? `${match[1]}${match[2]}` : name;
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
