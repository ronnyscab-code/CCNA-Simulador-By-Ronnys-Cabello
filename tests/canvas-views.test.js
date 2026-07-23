import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Topology } from '../topology/Topology.js';
import { Node } from '../topology/Node.js';
import { Edge } from '../topology/Edge.js';
import { frontPanelLayout, portAnchor, findPort, interfaceFamily } from '../devices/frontPanel.js';
import { computeZones, accessVlanOf, layer2Components } from '../topology/segments.js';
import { linkStates, shortPort, interfaceRows, buildTelemetry } from '../engine/telemetry.js';

/**
 * Builds R1 — SW1 — PC1/PC2, the same reference topology the design mockups
 * used, so a fault can be introduced per test.
 * @returns {{topology: Topology, r1: Node, sw1: Node, pc1: Node, pc2: Node}}
 */
function refTopology() {
  const topology = new Topology();
  const r1 = new Node({ id: 'r1', deviceType: 'router', hostname: 'R1', x: 0, y: 0 });
  const sw1 = new Node({ id: 'sw1', deviceType: 'switch', hostname: 'SW1', x: 200, y: 0 });
  const pc1 = new Node({ id: 'pc1', deviceType: 'pc', hostname: 'PC1', x: 400, y: -60 });
  const pc2 = new Node({ id: 'pc2', deviceType: 'pc', hostname: 'PC2', x: 400, y: 60 });
  for (const node of [r1, sw1, pc1, pc2]) topology.addNode(node);

  const gi0 = r1.device.getInterface('GigabitEthernet0/0');
  gi0.ipAddress = '192.168.1.1';
  gi0.subnetMask = '255.255.255.0';
  gi0.enabled = true;

  for (const [pc, ip] of [
    [pc1, '192.168.1.10'],
    [pc2, '192.168.1.11'],
  ]) {
    const iface = pc.device.interfaces[0];
    iface.ipAddress = ip;
    iface.subnetMask = '255.255.255.0';
    iface.enabled = true;
    pc.device.defaultGateway = '192.168.1.1';
  }

  topology.addEdge(
    new Edge({
      id: 'e1',
      sourceNodeId: 'r1',
      targetNodeId: 'sw1',
      sourcePort: 'GigabitEthernet0/0',
      targetPort: 'FastEthernet0/1',
    }),
  );
  topology.addEdge(
    new Edge({
      id: 'e2',
      sourceNodeId: 'sw1',
      targetNodeId: 'pc1',
      sourcePort: 'FastEthernet0/2',
      targetPort: pc1.device.interfaces[0].name,
    }),
  );
  topology.addEdge(
    new Edge({
      id: 'e3',
      sourceNodeId: 'sw1',
      targetNodeId: 'pc2',
      sourcePort: 'FastEthernet0/3',
      targetPort: pc2.device.interfaces[0].name,
    }),
  );

  return { topology, r1, sw1, pc1, pc2 };
}

describe('front panel layout', () => {
  test('a 2960 lays its 24 access ports out in two rows', () => {
    const { sw1 } = refTopology();
    const layout = frontPanelLayout(sw1.device);
    const access = layout.ports.filter((p) => p.family === 'FastEthernet');
    assert.equal(access.length, 24);
    assert.equal(new Set(access.map((p) => p.y)).size, 2, 'access ports use exactly two rows');
  });

  test('numbering alternates top/bottom like the real silk screen', () => {
    const { sw1 } = refTopology();
    const layout = frontPanelLayout(sw1.device);
    const fa1 = findPort(layout, 'FastEthernet0/1');
    const fa2 = findPort(layout, 'FastEthernet0/2');
    const fa3 = findPort(layout, 'FastEthernet0/3');
    assert.equal(fa1.x, fa2.x, 'Fa0/1 sits directly above Fa0/2');
    assert.ok(fa2.y > fa1.y);
    assert.ok(fa3.x > fa1.x, 'Fa0/3 starts the next column');
  });

  test('uplinks form their own group, so families never share a block', () => {
    const { sw1 } = refTopology();
    const layout = frontPanelLayout(sw1.device);
    assert.deepEqual(
      layout.groups.map((g) => g.label),
      ['Fa', 'Gi'],
    );
    const lastAccess = Math.max(
      ...layout.ports.filter((p) => p.family === 'FastEthernet').map((p) => p.x),
    );
    const firstUplink = Math.min(
      ...layout.ports.filter((p) => p.family === 'GigabitEthernet').map((p) => p.x),
    );
    assert.ok(firstUplink > lastAccess);
  });

  test('a router panel is narrower than a 24-port switch', () => {
    const { r1, sw1 } = refTopology();
    assert.ok(frontPanelLayout(r1.device).width < frontPanelLayout(sw1.device).width);
  });

  test('a port anchor lands inside the chassis, an unknown port at its centre', () => {
    const { sw1 } = refTopology();
    const layout = frontPanelLayout(sw1.device);
    const anchor = portAnchor(sw1, layout, 'FastEthernet0/1');
    assert.ok(Math.abs(anchor.x - sw1.x) <= layout.width / 2);
    assert.ok(Math.abs(anchor.y - sw1.y) <= layout.height / 2);
    assert.deepEqual(portAnchor(sw1, layout, 'Nope0/0'), { x: sw1.x, y: sw1.y });
  });

  test('interfaceFamily strips slot numbering at any depth', () => {
    assert.equal(interfaceFamily('GigabitEthernet1/0/24'), 'GigabitEthernet');
    assert.equal(interfaceFamily('Serial0/0/1'), 'Serial');
  });
});

describe('subnet and VLAN zones', () => {
  test('a healthy segment is one zone carrying its CIDR and gateway', () => {
    const { topology } = refTopology();
    const zones = computeZones(topology);
    assert.equal(zones.length, 1);
    assert.equal(zones[0].cidr, '192.168.1.0/24');
    assert.equal(zones[0].gateway, '192.168.1.1');
    assert.equal(zones[0].level, 'ok');
  });

  test('the router is never a zone member — it sits at the boundary', () => {
    const { topology } = refTopology();
    assert.ok(!computeZones(topology)[0].nodeIds.includes('r1'));
  });

  test('moving a host to another VLAN splits the segment into two zones', () => {
    const { topology, sw1 } = refTopology();
    sw1.device.getInterface('FastEthernet0/3').accessVlan = 20;

    const zones = computeZones(topology);
    assert.equal(zones.length, 2);
    assert.deepEqual(
      zones.map((z) => z.vlan).sort((a, b) => a - b),
      [1, 20],
    );
    assert.ok(
      zones.some((z) => z.level === 'warn' && /VLAN/.test(z.note)),
      JSON.stringify(zones),
    );
  });

  test('a segment with no router on its subnet is flagged', () => {
    const { topology, r1 } = refTopology();
    r1.device.getInterface('GigabitEthernet0/0').ipAddress = null;
    const zones = computeZones(topology);
    assert.equal(zones[0].level, 'warn');
    assert.match(zones[0].note, /router/);
  });

  test('accessVlanOf reads the VLAN off the switch port, not the host', () => {
    const { topology, sw1 } = refTopology();
    sw1.device.getInterface('FastEthernet0/2').accessVlan = 30;
    assert.equal(accessVlanOf(topology, 'pc1'), 30);
  });

  test('layer2Components stops at routers', () => {
    const { topology } = refTopology();
    const components = layer2Components(topology);
    assert.equal(components.length, 1);
    assert.ok(!components[0].includes('r1'));
  });
});

describe('link telemetry', () => {
  test('a fully configured topology reports every cable up', () => {
    const { topology } = refTopology();
    assert.ok(linkStates(topology).every((l) => l.level === 'ok'));
  });

  test('a shut interface takes its cable down and names the culprit', () => {
    const { topology, r1 } = refTopology();
    r1.device.getInterface('GigabitEthernet0/0').enabled = false;

    const link = linkStates(topology).find((l) => l.edgeId === 'e1');
    assert.equal(link.level, 'down');
    assert.match(link.reason, /R1 tiene Gi0\/0 apagada/);
  });

  test('a routed port without an IP is a warning, not a failure', () => {
    const { topology, r1 } = refTopology();
    r1.device.getInterface('GigabitEthernet0/0').ipAddress = null;

    const link = linkStates(topology).find((l) => l.edgeId === 'e1');
    assert.equal(link.level, 'warn');
    assert.match(link.reason, /no tiene dirección IP/);
  });

  test('switch ports are never faulted for lacking an IP', () => {
    const { topology } = refTopology();
    assert.equal(
      linkStates(topology).find((l) => l.edgeId === 'e2').level,
      'ok',
      'a switch-to-host cable needs no IP on the switch side',
    );
  });

  test('the summary counts what is wrong', () => {
    const { topology, r1 } = refTopology();
    r1.device.getInterface('GigabitEthernet0/0').enabled = false;

    const { summary } = buildTelemetry(topology);
    assert.equal(summary.devices, 4);
    assert.equal(summary.links, 3);
    assert.equal(summary.down, 1);
  });

  test('focusing a device exposes its interfaces, empty tables and all', () => {
    const { topology } = refTopology();
    const { focus } = buildTelemetry(topology, null, 'r1');
    assert.equal(focus.hostname, 'R1');
    assert.ok(focus.interfaces.some((i) => i.short === 'Gi0/0' && i.ip === '192.168.1.1'));
    assert.deepEqual(focus.arp, []);
  });

  test('shortPort abbreviates the way IOS prints it', () => {
    assert.equal(shortPort('GigabitEthernet0/1'), 'Gi0/1');
    assert.equal(shortPort('FastEthernet0/24'), 'Fa0/24');
    assert.equal(shortPort(undefined), '');
  });

  test('interfaceRows reports an access port by its VLAN when it has no IP', () => {
    const { sw1 } = refTopology();
    const row = interfaceRows(sw1).find((r) => r.short === 'Fa0/1');
    assert.equal(row.ip, null);
    assert.equal(row.vlan, 1);
  });
});
