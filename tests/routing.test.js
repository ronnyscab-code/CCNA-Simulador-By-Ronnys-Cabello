import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Topology } from '../topology/Topology.js';
import { Node } from '../topology/Node.js';
import { Edge } from '../topology/Edge.js';
import { PacketEngine, PingReason } from '../engine/PacketEngine.js';
import { routeLookup, buildRoutes, RouteType } from '../protocols/routing.js';

function setIp(node, ifaceName, ip, mask) {
  const iface = node.device.getInterface(ifaceName);
  iface.setIp(ip, mask);
  iface.enabled = true;
}

/**
 * PC1 — R1 — R2 — PC2, three subnets:
 *   PC1 192.168.1.10/24  (gw .1)
 *   R1  g0/0 192.168.1.1/24, g0/1 10.0.0.1/30
 *   R2  g0/0 10.0.0.2/30,    g0/1 192.168.2.1/24
 *   PC2 192.168.2.10/24  (gw .1)
 */
function buildRoutedNetwork({ staticRoutes = true } = {}) {
  const topology = new Topology();
  const pc1 = new Node({ id: 'pc1', deviceType: 'pc', hostname: 'PC1' });
  const r1 = new Node({ id: 'r1', deviceType: 'router', hostname: 'R1' });
  const r2 = new Node({ id: 'r2', deviceType: 'router', hostname: 'R2' });
  const pc2 = new Node({ id: 'pc2', deviceType: 'pc', hostname: 'PC2' });
  [pc1, r1, r2, pc2].forEach((n) => topology.addNode(n));

  topology.addEdge(
    new Edge({
      id: 'e1',
      sourceNodeId: 'pc1',
      targetNodeId: 'r1',
      sourcePort: 'FastEthernet0',
      targetPort: 'GigabitEthernet0/0',
    }),
  );
  topology.addEdge(
    new Edge({
      id: 'e2',
      sourceNodeId: 'r1',
      targetNodeId: 'r2',
      sourcePort: 'GigabitEthernet0/1',
      targetPort: 'GigabitEthernet0/0',
    }),
  );
  topology.addEdge(
    new Edge({
      id: 'e3',
      sourceNodeId: 'r2',
      targetNodeId: 'pc2',
      sourcePort: 'GigabitEthernet0/1',
      targetPort: 'FastEthernet0',
    }),
  );

  setIp(pc1, 'FastEthernet0', '192.168.1.10', '255.255.255.0');
  pc1.device.defaultGateway = '192.168.1.1';
  setIp(r1, 'GigabitEthernet0/0', '192.168.1.1', '255.255.255.0');
  setIp(r1, 'GigabitEthernet0/1', '10.0.0.1', '255.255.255.252');
  setIp(r2, 'GigabitEthernet0/0', '10.0.0.2', '255.255.255.252');
  setIp(r2, 'GigabitEthernet0/1', '192.168.2.1', '255.255.255.0');
  setIp(pc2, 'FastEthernet0', '192.168.2.10', '255.255.255.0');
  pc2.device.defaultGateway = '192.168.2.1';

  if (staticRoutes) {
    r1.device.config.staticRoutes.push({
      prefix: '192.168.2.0',
      mask: '255.255.255.0',
      nextHop: '10.0.0.2',
    });
    r2.device.config.staticRoutes.push({
      prefix: '192.168.1.0',
      mask: '255.255.255.0',
      nextHop: '10.0.0.1',
    });
  }

  return { topology, pc1, r1, r2, pc2 };
}

describe('routing table', () => {
  test('buildRoutes includes connected subnets and static routes', () => {
    const { r1 } = buildRoutedNetwork();
    const routes = buildRoutes(r1.device);
    const connected = routes.filter((r) => r.type === RouteType.CONNECTED);
    const statics = routes.filter((r) => r.type === RouteType.STATIC);
    assert.equal(connected.length, 2);
    assert.equal(statics.length, 1);
    assert.equal(statics[0].network, '192.168.2.0');
  });

  test('routeLookup prefers a connected route (next hop = destination)', () => {
    const { r1 } = buildRoutedNetwork();
    const decision = routeLookup(r1.device, '192.168.1.50');
    assert.equal(decision.type, RouteType.CONNECTED);
    assert.equal(decision.nextHopIp, '192.168.1.50');
    assert.equal(decision.egressIface.name, 'GigabitEthernet0/0');
  });

  test('routeLookup follows a static route via its next hop', () => {
    const { r1 } = buildRoutedNetwork();
    const decision = routeLookup(r1.device, '192.168.2.10');
    assert.equal(decision.type, RouteType.STATIC);
    assert.equal(decision.nextHopIp, '10.0.0.2');
    assert.equal(decision.egressIface.name, 'GigabitEthernet0/1');
  });

  test('an endpoint uses its default gateway as a default route', () => {
    const { pc1 } = buildRoutedNetwork();
    const decision = routeLookup(pc1.device, '8.8.8.8');
    assert.equal(decision.type, RouteType.DEFAULT);
    assert.equal(decision.nextHopIp, '192.168.1.1');
  });

  test('no matching route returns null', () => {
    const { r1 } = buildRoutedNetwork({ staticRoutes: false });
    assert.equal(routeLookup(r1.device, '192.168.2.10'), null);
  });
});

describe('end-to-end routed ping', () => {
  test('reaches a host two subnets away via static routes', () => {
    const { topology } = buildRoutedNetwork();
    const engine = new PacketEngine(topology);
    const result = engine.ping('pc1', '192.168.2.10');
    assert.equal(result.success, true);
    assert.equal(result.reason, PingReason.OK);
    assert.deepEqual(result.events.find((e) => e.kind === 'icmp-request').path, [
      'pc1',
      'r1',
      'r2',
      'pc2',
    ]);
  });

  test('fails with no-route when routers lack a return/forward route', () => {
    const { topology } = buildRoutedNetwork({ staticRoutes: false });
    const engine = new PacketEngine(topology);
    assert.equal(engine.ping('pc1', '192.168.2.10').reason, PingReason.NO_ROUTE);
  });

  test('a directly connected ping still works (single hop)', () => {
    const { topology } = buildRoutedNetwork();
    const engine = new PacketEngine(topology);
    const result = engine.ping('pc1', '192.168.1.1');
    assert.equal(result.success, true);
    assert.deepEqual(result.events.find((e) => e.kind === 'icmp-request').path, ['pc1', 'r1']);
  });

  test('ping to an unknown host in a routed subnet is unreachable', () => {
    const { topology } = buildRoutedNetwork();
    const engine = new PacketEngine(topology);
    assert.equal(engine.ping('pc1', '192.168.2.99').reason, PingReason.UNREACHABLE_ARP);
  });
});
