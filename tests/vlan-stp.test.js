import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Topology } from '../topology/Topology.js';
import { Node } from '../topology/Node.js';
import { Edge } from '../topology/Edge.js';
import { PacketEngine, PingReason } from '../engine/PacketEngine.js';
import { computeSpanningTree } from '../engine/SpanningTree.js';

function ip(node, ifaceName, addr) {
  const iface = node.device.getInterface(ifaceName);
  iface.setIp(addr, '255.255.255.0');
  iface.enabled = true;
}

/**
 * PC1(v10) — SW1 ===trunk=== SW2 — PC2(v10) and PC3(v20), all one subnet.
 */
function buildTrunkedLan({ trunkAllowed = null } = {}) {
  const topology = new Topology();
  const pc1 = new Node({ id: 'pc1', deviceType: 'pc', hostname: 'PC1' });
  const sw1 = new Node({ id: 'sw1', deviceType: 'switch', hostname: 'SW1' });
  const sw2 = new Node({ id: 'sw2', deviceType: 'switch', hostname: 'SW2' });
  const pc2 = new Node({ id: 'pc2', deviceType: 'pc', hostname: 'PC2' });
  const pc3 = new Node({ id: 'pc3', deviceType: 'pc', hostname: 'PC3' });
  [pc1, sw1, sw2, pc2, pc3].forEach((n) => topology.addNode(n));

  topology.addEdge(
    new Edge({
      id: 'a',
      sourceNodeId: 'pc1',
      targetNodeId: 'sw1',
      sourcePort: 'FastEthernet0',
      targetPort: 'FastEthernet0/1',
    }),
  );
  topology.addEdge(
    new Edge({
      id: 'b',
      sourceNodeId: 'sw1',
      targetNodeId: 'sw2',
      sourcePort: 'GigabitEthernet0/1',
      targetPort: 'GigabitEthernet0/1',
    }),
  );
  topology.addEdge(
    new Edge({
      id: 'c',
      sourceNodeId: 'sw2',
      targetNodeId: 'pc2',
      sourcePort: 'FastEthernet0/1',
      targetPort: 'FastEthernet0',
    }),
  );
  topology.addEdge(
    new Edge({
      id: 'd',
      sourceNodeId: 'sw2',
      targetNodeId: 'pc3',
      sourcePort: 'FastEthernet0/2',
      targetPort: 'FastEthernet0',
    }),
  );

  sw1.device.getInterface('FastEthernet0/1').accessVlan = 10;
  sw2.device.getInterface('FastEthernet0/1').accessVlan = 10;
  sw2.device.getInterface('FastEthernet0/2').accessVlan = 20;

  for (const sw of [sw1, sw2]) {
    const trunk = sw.device.getInterface('GigabitEthernet0/1');
    trunk.switchportMode = 'trunk';
    trunk.trunkAllowedVlans = trunkAllowed;
  }

  ip(pc1, 'FastEthernet0', '192.168.1.10');
  ip(pc2, 'FastEthernet0', '192.168.1.20');
  ip(pc3, 'FastEthernet0', '192.168.1.30');

  return { topology };
}

describe('VLAN trunking', () => {
  test('same-VLAN hosts reach each other across a trunk', () => {
    const { topology } = buildTrunkedLan();
    const engine = new PacketEngine(topology);
    const result = engine.ping('pc1', '192.168.1.20');
    assert.equal(result.success, true);
    assert.deepEqual(result.events.find((e) => e.kind === 'icmp-request').path, [
      'pc1',
      'sw1',
      'sw2',
      'pc2',
    ]);
  });

  test('different-VLAN hosts on the same subnet cannot reach each other', () => {
    const { topology } = buildTrunkedLan();
    const engine = new PacketEngine(topology);
    assert.equal(engine.ping('pc1', '192.168.1.30').reason, PingReason.DIFFERENT_VLAN);
  });

  test('a trunk that prunes the VLAN breaks connectivity', () => {
    const { topology } = buildTrunkedLan({ trunkAllowed: [20] });
    const engine = new PacketEngine(topology);
    assert.equal(engine.ping('pc1', '192.168.1.20').reason, PingReason.NOT_CONNECTED);
  });

  test('a trunk explicitly allowing the VLAN carries it', () => {
    const { topology } = buildTrunkedLan({ trunkAllowed: [10, 20] });
    const engine = new PacketEngine(topology);
    assert.equal(engine.ping('pc1', '192.168.1.20').success, true);
  });
});

describe('spanning tree', () => {
  function triangle() {
    const topology = new Topology();
    const s1 = new Node({ id: 's1', deviceType: 'switch', hostname: 'S1' });
    const s2 = new Node({ id: 's2', deviceType: 'switch', hostname: 'S2' });
    const s3 = new Node({ id: 's3', deviceType: 'switch', hostname: 'S3' });
    [s1, s2, s3].forEach((n) => topology.addNode(n));
    topology.addEdge(
      new Edge({
        id: 'x',
        sourceNodeId: 's1',
        targetNodeId: 's2',
        sourcePort: 'GigabitEthernet0/1',
        targetPort: 'GigabitEthernet0/1',
      }),
    );
    topology.addEdge(
      new Edge({
        id: 'y',
        sourceNodeId: 's2',
        targetNodeId: 's3',
        sourcePort: 'GigabitEthernet0/2',
        targetPort: 'GigabitEthernet0/1',
      }),
    );
    topology.addEdge(
      new Edge({
        id: 'z',
        sourceNodeId: 's3',
        targetNodeId: 's1',
        sourcePort: 'GigabitEthernet0/2',
        targetPort: 'GigabitEthernet0/2',
      }),
    );
    return topology;
  }

  test('elects exactly one root bridge', () => {
    const tree = computeSpanningTree(triangle());
    assert.ok(['s1', 's2', 's3'].includes(tree.rootId));
    assert.equal(tree.dist.get(tree.rootId), 0);
  });

  test('blocks exactly one port to break the loop', () => {
    const tree = computeSpanningTree(triangle());
    assert.equal(tree.blockedPorts.size, 1);
  });

  test('the root bridge has no blocked ports', () => {
    const tree = computeSpanningTree(triangle());
    for (const key of tree.blockedPorts) {
      assert.notEqual(key.split('|')[0], tree.rootId);
    }
  });

  test('a loop-free topology blocks nothing', () => {
    const { topology } = buildTrunkedLan();
    const tree = computeSpanningTree(topology);
    assert.equal(tree.blockedPorts.size, 0);
  });
});
