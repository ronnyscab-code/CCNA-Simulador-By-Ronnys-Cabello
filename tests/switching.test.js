import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Topology } from '../topology/Topology.js';
import { Node } from '../topology/Node.js';
import { Edge } from '../topology/Edge.js';
import { PacketEngine, PingReason } from '../engine/PacketEngine.js';
import { MacTable } from '../engine/MacTable.js';

/**
 * PC1 — Fa0/1 [SW] Fa0/2 — PC2, both in the same subnet.
 */
function buildSwitchedLan({ vlan1 = 1, vlan2 = 1 } = {}) {
  const topology = new Topology();
  const pc1 = new Node({ id: 'pc1', deviceType: 'pc', hostname: 'PC1' });
  const sw = new Node({ id: 'sw', deviceType: 'switch', hostname: 'SW1' });
  const pc2 = new Node({ id: 'pc2', deviceType: 'pc', hostname: 'PC2' });
  [pc1, sw, pc2].forEach((n) => topology.addNode(n));
  topology.addEdge(
    new Edge({
      id: 'e1',
      sourceNodeId: 'pc1',
      targetNodeId: 'sw',
      sourcePort: 'FastEthernet0',
      targetPort: 'FastEthernet0/1',
    }),
  );
  topology.addEdge(
    new Edge({
      id: 'e2',
      sourceNodeId: 'pc2',
      targetNodeId: 'sw',
      sourcePort: 'FastEthernet0',
      targetPort: 'FastEthernet0/2',
    }),
  );

  pc1.device.getInterface('FastEthernet0').setIp('192.168.1.10', '255.255.255.0');
  pc1.device.getInterface('FastEthernet0').enabled = true;
  pc2.device.getInterface('FastEthernet0').setIp('192.168.1.20', '255.255.255.0');
  pc2.device.getInterface('FastEthernet0').enabled = true;

  sw.device.getInterface('FastEthernet0/1').accessVlan = vlan1;
  sw.device.getInterface('FastEthernet0/2').accessVlan = vlan2;

  return { topology, pc1, sw, pc2 };
}

describe('MacTable', () => {
  test('learns and looks up per VLAN', () => {
    const table = new MacTable();
    table.learn(1, 'AA:BB:CC:00:00:01', 'Fa0/1');
    assert.equal(table.lookup(1, 'aa:bb:cc:00:00:01'), 'Fa0/1');
    assert.equal(table.lookup(2, 'aa:bb:cc:00:00:01'), null);
  });

  test('refreshes the port when a MAC moves', () => {
    const table = new MacTable();
    table.learn(1, 'AA:BB:CC:00:00:01', 'Fa0/1');
    table.learn(1, 'AA:BB:CC:00:00:01', 'Fa0/3');
    assert.equal(table.lookup(1, 'aa:bb:cc:00:00:01'), 'Fa0/3');
    assert.equal(table.size(), 1);
  });
});

describe('Switch MAC learning', () => {
  test('a successful ping populates the switch CAM table with both MACs', () => {
    const { topology, pc1, pc2 } = buildSwitchedLan();
    const engine = new PacketEngine(topology);
    engine.ping('pc1', '192.168.1.20');

    const table = engine.macTableFor('sw');
    const pc1Mac = pc1.device.getInterface('FastEthernet0').mac;
    const pc2Mac = pc2.device.getInterface('FastEthernet0').mac;

    assert.equal(table.lookup(1, pc1Mac), 'FastEthernet0/1');
    assert.equal(table.lookup(1, pc2Mac), 'FastEthernet0/2');
  });

  test('reset clears the MAC table', () => {
    const { topology } = buildSwitchedLan();
    const engine = new PacketEngine(topology);
    engine.ping('pc1', '192.168.1.20');
    assert.ok(engine.macTableFor('sw').size() > 0);
    engine.reset();
    assert.equal(engine.macTableFor('sw').size(), 0);
  });
});

describe('VLAN segregation', () => {
  test('hosts in the same access VLAN can reach each other', () => {
    const { topology } = buildSwitchedLan({ vlan1: 10, vlan2: 10 });
    const engine = new PacketEngine(topology);
    assert.equal(engine.ping('pc1', '192.168.1.20').reason, PingReason.OK);
  });

  test('hosts in different access VLANs cannot', () => {
    const { topology } = buildSwitchedLan({ vlan1: 10, vlan2: 20 });
    const engine = new PacketEngine(topology);
    const result = engine.ping('pc1', '192.168.1.20');
    assert.equal(result.success, false);
    assert.equal(result.reason, PingReason.DIFFERENT_VLAN);
  });

  test('learned entries carry the access VLAN', () => {
    const { topology, pc1 } = buildSwitchedLan({ vlan1: 30, vlan2: 30 });
    const engine = new PacketEngine(topology);
    engine.ping('pc1', '192.168.1.20');
    const pc1Mac = pc1.device.getInterface('FastEthernet0').mac;
    assert.equal(engine.macTableFor('sw').lookup(30, pc1Mac), 'FastEthernet0/1');
  });
});
