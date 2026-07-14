import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Topology } from '../topology/Topology.js';
import { Node } from '../topology/Node.js';
import { Edge } from '../topology/Edge.js';
import { PacketEngine, PingReason } from '../engine/PacketEngine.js';
import { L2Fabric } from '../engine/L2Fabric.js';
import { computeOspf } from '../protocols/ospf.js';

function setIp(node, ifaceName, ip, mask) {
  const iface = node.device.getInterface(ifaceName);
  iface.setIp(ip, mask);
  iface.enabled = true;
}

function ospf(networks) {
  return { processId: 1, routerId: null, networks };
}

/**
 * PC1 — R1 — R2 — PC2 across three subnets, OSPF area 0 on both routers,
 * NO static routes. `ospfEnabled` toggles the OSPF config on/off.
 */
function buildOspfNetwork({ ospfEnabled = true } = {}) {
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

  if (ospfEnabled) {
    r1.device.config.ospf = ospf([
      { address: '192.168.1.0', wildcard: '0.0.0.255', area: 0 },
      { address: '10.0.0.0', wildcard: '0.0.0.3', area: 0 },
    ]);
    r2.device.config.ospf = ospf([
      { address: '192.168.2.0', wildcard: '0.0.0.255', area: 0 },
      { address: '10.0.0.0', wildcard: '0.0.0.3', area: 0 },
    ]);
  }

  return { topology, r1, r2 };
}

describe('OSPF neighbors and router IDs', () => {
  test('router ID defaults to the highest interface IP', () => {
    const { topology } = buildOspfNetwork();
    const ospfState = computeOspf(topology, new L2Fabric(topology));
    assert.equal(ospfState.routerIds.get('r1'), '192.168.1.1');
    assert.equal(ospfState.routerIds.get('r2'), '192.168.2.1');
  });

  test('routers on a shared advertised subnet become neighbors', () => {
    const { topology } = buildOspfNetwork();
    const ospfState = computeOspf(topology, new L2Fabric(topology));
    const r1n = ospfState.neighbors.get('r1');
    assert.equal(r1n.length, 1);
    assert.equal(r1n[0].routerId, ospfState.routerIds.get('r2'));
    assert.match(r1n[0].state, /^FULL\//);
  });

  test('a segment elects a DR (highest router ID wins on equal priority)', () => {
    const { topology } = buildOspfNetwork();
    const ospfState = computeOspf(topology, new L2Fabric(topology));
    const segment = ospfState.segments.get('10.0.0.0/30');
    // Equal default priority (1), so the higher router ID becomes DR:
    // R2 = 192.168.2.1 > R1 = 192.168.1.1.
    assert.equal(segment.drId, '192.168.2.1');
    assert.equal(segment.bdrId, '192.168.1.1');
  });

  test('no OSPF config means no neighbors', () => {
    const { topology } = buildOspfNetwork({ ospfEnabled: false });
    const ospfState = computeOspf(topology, new L2Fabric(topology));
    assert.equal(ospfState.enabled, false);
  });
});

describe('OSPF learned routes and forwarding', () => {
  test('a router learns remote subnets via SPF with a next hop', () => {
    const { topology } = buildOspfNetwork();
    const ospfState = computeOspf(topology, new L2Fabric(topology));
    const r1Routes = ospfState.routes.get('r1');
    const toPc2 = r1Routes.find((r) => r.network === '192.168.2.0');
    assert.ok(toPc2, 'expected a route to 192.168.2.0');
    assert.equal(toPc2.nextHop, '10.0.0.2');
    assert.equal(toPc2.type, 'ospf');
  });

  test('cross-subnet ping succeeds with OSPF alone (no static routes)', () => {
    const { topology } = buildOspfNetwork();
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

  test('without OSPF (and no static routes) the same ping has no route', () => {
    const { topology } = buildOspfNetwork({ ospfEnabled: false });
    const engine = new PacketEngine(topology);
    assert.equal(engine.ping('pc1', '192.168.2.10').reason, PingReason.NO_ROUTE);
  });
});
