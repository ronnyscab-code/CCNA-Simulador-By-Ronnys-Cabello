import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Topology } from '../topology/Topology.js';
import { Node } from '../topology/Node.js';
import { Edge } from '../topology/Edge.js';
import { PacketEngine } from '../engine/PacketEngine.js';
import { CliSession } from '../cli/CliSession.js';

function switchSession() {
  const topology = new Topology();
  const sw = new Node({ id: 'sw', deviceType: 'switch', hostname: 'Switch' });
  const pc = new Node({ id: 'pc', deviceType: 'pc', hostname: 'PC' });
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

describe('CLI contextual help (?)', () => {
  test('`show ?` lists many keywords with descriptions', () => {
    const s = switchSession();
    const help = s.complete('show ');
    assert.ok(
      help.completions.length >= 30,
      `expected many show subcommands, got ${help.completions.length}`,
    );
    assert.ok(help.descriptions, 'expected descriptions map');
    assert.equal(help.descriptions.clock, 'Display the system clock');
    assert.equal(help.descriptions.arp, 'ARP table');
    assert.ok(help.completions.includes('spanning-tree'));
    assert.ok(help.completions.includes('port-security'));
  });

  test('`show ip ?` lists ip sub-help with descriptions', () => {
    const s = switchSession();
    const help = s.complete('show ip ');
    assert.ok(help.completions.includes('route'));
    assert.ok(help.completions.includes('interface'));
    assert.equal(help.descriptions.route, 'IP routing table');
  });
});

describe('CLI show command breadth', () => {
  const CMDS = [
    'show clock',
    'show version',
    'show privilege',
    'show history',
    'show users',
    'show logging',
    'show vtp status',
    'show port-security',
    'show interfaces status',
    'show etherchannel summary',
    'show flash:',
    'show mac address-table',
    'show mac-address-table',
    'show spanning-tree',
    'show vlan brief',
    'show running-config',
    'show snmp',
    'show tcp',
    'show dtp',
  ];

  test('every listed show command returns output without an IOS error', () => {
    const s = switchSession();
    for (const cmd of CMDS) {
      const out = s.execute(cmd);
      assert.ok(typeof out === 'string', `${cmd} should return a string`);
      assert.doesNotMatch(out, /Invalid input|Incomplete command/, `${cmd} should be recognized`);
    }
  });

  test('privilege level reflects the mode', () => {
    const s = switchSession();
    assert.match(s.execute('show privilege'), /level is 15/);
  });

  test('`show running-config interface <name>` shows just that interface', () => {
    const s = switchSession();
    // Configure an access port so the block has recognizable content.
    s.execute('configure terminal');
    s.execute('interface FastEthernet0/1');
    s.execute('switchport access vlan 20');
    s.execute('end');

    const full = s.execute('show running-config interface FastEthernet0/1');
    assert.doesNotMatch(full, /Invalid input|Incomplete command/);
    assert.match(full, /interface FastEthernet0\/1/);
    assert.match(full, /switchport access vlan 20/);
    // It must NOT include other interfaces.
    assert.doesNotMatch(full, /interface FastEthernet0\/2/);

    // Abbreviations resolve to the canonical interface.
    assert.match(s.execute('sh run int fa0/1'), /interface FastEthernet0\/1/);
    // Unknown interface is reported, not crashed.
    assert.match(s.execute('show running-config interface Gi9/9'), /Invalid interface/);
  });
});
