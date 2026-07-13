import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Topology } from '../topology/Topology.js';
import { Node } from '../topology/Node.js';
import { Edge } from '../topology/Edge.js';
import { PacketEngine, PingReason } from '../engine/PacketEngine.js';
import { L2Fabric } from '../engine/L2Fabric.js';
import { IPv4Packet } from '../protocols/ipv4.js';
import { IcmpMessage, IcmpType } from '../protocols/icmp.js';

/**
 * Builds: PC1 — SW — PC2 (same subnet), plus an isolated PC3.
 */
function buildTopology() {
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

  return { topology, pc1, sw, pc2 };
}

describe('protocol models', () => {
  test('IPv4Packet decrements TTL and expires at zero', () => {
    const pkt = new IPv4Packet({
      srcIp: '1.1.1.1',
      dstIp: '2.2.2.2',
      protocol: 'icmp',
      payload: {},
      ttl: 2,
    });
    const next = pkt.decrementTtl();
    assert.equal(next.ttl, 1);
    assert.equal(next.decrementTtl(), null);
  });

  test('ICMP echo request builds a matching reply', () => {
    const req = new IcmpMessage({ type: IcmpType.ECHO_REQUEST, id: 7, seq: 3 });
    const reply = req.toReply();
    assert.equal(reply.type, IcmpType.ECHO_REPLY);
    assert.equal(reply.id, 7);
    assert.equal(reply.seq, 3);
  });
});

describe('L2Fabric', () => {
  test('finds a path through a transparent switch', () => {
    const { topology } = buildTopology();
    const fabric = new L2Fabric(topology);
    assert.deepEqual(fabric.findPath('pc1', 'pc2'), ['pc1', 'sw', 'pc2']);
  });

  test('returns null when hosts are not in the same L2 domain', () => {
    const { topology } = buildTopology();
    topology.addNode(new Node({ id: 'pc3', deviceType: 'pc', hostname: 'PC3' }));
    const fabric = new L2Fabric(topology);
    assert.equal(fabric.findPath('pc1', 'pc3'), null);
  });

  test('does not relay through an endpoint/router', () => {
    // PC1 — PC2 — PC3 (PC2 is an endpoint, must not bridge)
    const topology = new Topology();
    ['pc1', 'pc2', 'pc3'].forEach((id) =>
      topology.addNode(new Node({ id, deviceType: 'pc', hostname: id })),
    );
    topology.addEdge(new Edge({ id: 'a', sourceNodeId: 'pc1', targetNodeId: 'pc2' }));
    topology.addEdge(new Edge({ id: 'b', sourceNodeId: 'pc2', targetNodeId: 'pc3' }));
    const fabric = new L2Fabric(topology);
    assert.equal(fabric.findPath('pc1', 'pc3'), null);
    assert.deepEqual(fabric.findPath('pc1', 'pc2'), ['pc1', 'pc2']);
  });
});

describe('PacketEngine.ping', () => {
  test('succeeds through a switch with ARP then ICMP events', () => {
    const { topology } = buildTopology();
    const engine = new PacketEngine(topology);
    const result = engine.ping('pc1', '192.168.1.20');

    assert.equal(result.success, true);
    assert.equal(result.reason, PingReason.OK);
    assert.deepEqual(
      result.events.map((e) => e.kind),
      ['arp-request', 'arp-reply', 'icmp-request', 'icmp-reply'],
    );
    assert.deepEqual(result.events[0].path, ['pc1', 'sw', 'pc2']);
    assert.deepEqual(result.events[1].path, ['pc2', 'sw', 'pc1']);
  });

  test('caches ARP so a second ping skips resolution', () => {
    const { topology } = buildTopology();
    const engine = new PacketEngine(topology);
    engine.ping('pc1', '192.168.1.20');
    const second = engine.ping('pc1', '192.168.1.20');
    assert.deepEqual(
      second.events.map((e) => e.kind),
      ['icmp-request', 'icmp-reply'],
    );
  });

  test('reports no-source-ip when the sender is unaddressed', () => {
    const { topology } = buildTopology();
    const engine = new PacketEngine(topology);
    assert.equal(engine.ping('sw', '192.168.1.20').reason, PingReason.NO_SOURCE_IP);
  });

  test('reports different-subnet when no local interface matches', () => {
    const { topology } = buildTopology();
    const engine = new PacketEngine(topology);
    assert.equal(engine.ping('pc1', '10.0.0.1').reason, PingReason.DIFFERENT_SUBNET);
  });

  test('reports unreachable-arp for an absent host in-subnet', () => {
    const { topology } = buildTopology();
    const engine = new PacketEngine(topology);
    assert.equal(engine.ping('pc1', '192.168.1.99').reason, PingReason.UNREACHABLE_ARP);
  });

  test('reset clears ARP caches', () => {
    const { topology } = buildTopology();
    const engine = new PacketEngine(topology);
    engine.ping('pc1', '192.168.1.20');
    engine.reset();
    const after = engine.ping('pc1', '192.168.1.20');
    assert.equal(after.events[0].kind, 'arp-request');
  });
});
