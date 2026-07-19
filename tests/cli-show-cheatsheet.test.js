import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Topology } from '../topology/Topology.js';
import { Node } from '../topology/Node.js';
import { Edge } from '../topology/Edge.js';
import { PacketEngine } from '../engine/PacketEngine.js';
import { CliSession } from '../cli/CliSession.js';

/**
 * The full "Mega Chuleta" `show` command list (Cisco IOS). Concrete example
 * parameters are used so the command tree exercises its `<param>` slots. These
 * are standard IOS command names (facts), not copied prose.
 */
const CHEATSHEET = [
  'show access-lists',
  'show aliases',
  'show archive',
  'show arp',
  'show authentication sessions',
  'show boot',
  'show buffers',
  'show calendar',
  'show cdp',
  'show cdp neighbors',
  'show cdp neighbors detail',
  'show clock',
  'show configuration',
  'show environment',
  'show environment all',
  'show errdisable recovery',
  'show etherchannel detail',
  'show etherchannel load-balance',
  'show etherchannel port-channel',
  'show etherchannel summary',
  'show file systems',
  'show flash:',
  'show history',
  'show interface FastEthernet0/1',
  'show interface FastEthernet0/1 counters',
  'show interface FastEthernet0/1 description',
  'show interface FastEthernet0/1 status',
  'show interface FastEthernet0/1 switchport',
  'show interfaces',
  'show interfaces accounting',
  'show interfaces capabilities',
  'show interfaces counters',
  'show interfaces counters errors',
  'show interfaces counters protocol',
  'show interfaces description',
  'show interfaces flowcontrol',
  'show interfaces link',
  'show interfaces mtu',
  'show interfaces queueing',
  'show interfaces rate-limit',
  'show interfaces stats',
  'show interfaces status',
  'show interfaces summary',
  'show interfaces switchport',
  'show interfaces transceiver',
  'show interfaces transceiver detail',
  'show interfaces transceiver properties',
  'show interfaces trunk',
  'show interfaces vlan',
  'show inventory',
  'show ip access-lists',
  'show ip arp',
  'show ip bgp',
  'show ip bgp summary',
  'show ip cef',
  'show ip dhcp binding',
  'show ip dhcp conflict',
  'show ip dhcp pool',
  'show ip dhcp server statistics',
  'show ip dhcp snooping',
  'show ip dhcp snooping binding',
  'show ip eigrp neighbors',
  'show ip eigrp topology',
  'show ip interface brief',
  'show ip ospf',
  'show ip ospf database',
  'show ip ospf neighbor',
  'show ip protocols',
  'show ip route',
  'show ip route summary',
  'show ip route vrf MGMT',
  'show ip ssh',
  'show lacp counters',
  'show lacp neighbor',
  'show license',
  'show license summary',
  'show lldp',
  'show lldp neighbors',
  'show lldp neighbors detail',
  'show logging',
  'show logging onboard',
  'show mac address-table',
  'show mac address-table dynamic',
  'show mac address-table interface FastEthernet0/1',
  'show mac address-table vlan 10',
  'show memory',
  'show memory statistics',
  'show pagp neighbor',
  'show parser statistics',
  'show platform',
  'show port-security',
  'show port-security interface FastEthernet0/1',
  'show power inline',
  'show privilege',
  'show processes cpu',
  'show processes cpu sorted',
  'show processes memory',
  'show processes memory sorted',
  'show redundancy',
  'show reload',
  'show running-config',
  'show spanning-tree',
  'show spanning-tree blockedports',
  'show spanning-tree bridge',
  'show spanning-tree detail',
  'show spanning-tree inconsistentports',
  'show spanning-tree interface FastEthernet0/1',
  'show spanning-tree mst',
  'show spanning-tree mst configuration',
  'show spanning-tree mst detail',
  'show spanning-tree root',
  'show spanning-tree statistics',
  'show spanning-tree summary',
  'show spanning-tree vlan 10',
  'show ssh',
  'show startup-config',
  'show switch',
  'show tech-support',
  'show users',
  'show version',
  'show vlan',
  'show vlan access-map',
  'show vlan brief',
  'show vlan filter',
  'show vlan id 10',
  'show vlan internal usage',
  'show vlan name USERS',
  'show vrf',
];

function switchSession() {
  const topology = new Topology();
  const sw = new Node({ id: 'sw', deviceType: 'switch', hostname: 'SW1' });
  const pc = new Node({ id: 'pc', deviceType: 'pc', hostname: 'PC1' });
  topology.addNode(sw);
  topology.addNode(pc);
  topology.addEdge(
    new Edge({
      id: 'e1',
      sourceNodeId: 'pc',
      targetNodeId: 'sw',
      sourcePort: 'FastEthernet0',
      targetPort: 'FastEthernet0/1',
    }),
  );
  const session = new CliSession({ node: sw, topology, packetEngine: new PacketEngine(topology) });
  session.execute('enable');
  return session;
}

describe('Cisco "Mega Chuleta" show commands are all recognized', () => {
  test('every listed show command returns output without an IOS error', () => {
    const s = switchSession();
    for (const cmd of CHEATSHEET) {
      const out = s.execute(cmd);
      assert.equal(typeof out, 'string', `${cmd} should return a string`);
      assert.doesNotMatch(
        out,
        /Invalid input|Incomplete command|Unknown command/,
        `"${cmd}" should be recognized`,
      );
    }
  });

  test('a couple render live device data', () => {
    const s = switchSession();
    s.execute('configure terminal');
    s.execute('interface FastEthernet0/1');
    s.execute('switchport access vlan 30');
    s.execute('end');
    assert.match(s.execute('show vlan id 30'), /30/);
    assert.match(s.execute('show interface FastEthernet0/1 switchport'), /Access Mode VLAN: 30/);
  });
});
