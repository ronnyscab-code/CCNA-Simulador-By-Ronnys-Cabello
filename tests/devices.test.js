import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { DeviceFactory } from '../devices/DeviceFactory.js';
import { Device } from '../devices/Device.js';
import { Router } from '../devices/Router.js';
import { NetworkInterface } from '../devices/NetworkInterface.js';
import { Node } from '../topology/Node.js';
import { Topology } from '../topology/Topology.js';
import { Edge } from '../topology/Edge.js';

describe('DeviceFactory', () => {
  test('creates every supported type with a hostname and interfaces', () => {
    for (const type of DeviceFactory.supportedTypes()) {
      const device = DeviceFactory.create(type, `${type}-1`);
      assert.equal(device.type, type);
      assert.equal(device.hostname, `${type}-1`);
      assert.ok(Array.isArray(device.interfaces));
    }
  });

  test('rejects unknown types', () => {
    assert.throws(() => DeviceFactory.create('toaster', 'T1'));
    assert.throws(() => DeviceFactory.fromJSON({ type: 'toaster' }));
  });

  test('round-trips a device through toJSON/fromJSON', () => {
    const router = DeviceFactory.create('router', 'R1');
    router.getInterface('GigabitEthernet0/0').setIp('192.168.1.1', '255.255.255.0');
    router.getInterface('GigabitEthernet0/0').enabled = true;

    const restored = DeviceFactory.fromJSON(router.toJSON());
    const iface = restored.getInterface('GigabitEthernet0/0');
    assert.equal(restored.hostname, 'R1');
    assert.equal(iface.ipAddress, '192.168.1.1');
    assert.equal(iface.subnetMask, '255.255.255.0');
    assert.equal(iface.enabled, true);
  });
});

describe('Device defaults', () => {
  test('router ports are administratively down by default', () => {
    const router = DeviceFactory.create('router', 'R1');
    assert.ok(router.capabilities.routing);
    assert.ok(router.interfaces.every((i) => i.enabled === false));
  });

  test('switch ports are switched access ports, up by default', () => {
    const sw = DeviceFactory.create('switch', 'S1');
    assert.ok(sw.capabilities.switching);
    assert.ok(sw.interfaces.every((i) => i.switchportMode === 'access'));
    assert.ok(sw.interfaces.every((i) => i.enabled === true));
  });

  test('endpoints have exactly one interface', () => {
    for (const type of ['pc', 'laptop', 'server', 'printer']) {
      assert.equal(DeviceFactory.create(type, 'x').interfaces.length, 1);
    }
  });
});

describe('Interface name resolution', () => {
  test('resolves IOS abbreviations', () => {
    assert.equal(Device.expandInterfaceName('gi0/0'), 'GigabitEthernet0/0');
    assert.equal(Device.expandInterfaceName('fa0/1'), 'FastEthernet0/1');
    assert.equal(Device.expandInterfaceName('s0/0/0'), 'Serial0/0/0');
    assert.equal(Device.expandInterfaceName('GigabitEthernet0/0'), 'GigabitEthernet0/0');
  });

  test('resolveInterface finds a port by abbreviation', () => {
    const router = new Router({ hostname: 'R1' });
    assert.equal(router.resolveInterface('gi0/1').name, 'GigabitEthernet0/1');
  });

  test('firstFreeInterface skips used ports', () => {
    const router = new Router({ hostname: 'R1' });
    const used = new Set(['GigabitEthernet0/0']);
    assert.equal(router.firstFreeInterface(used).name, 'GigabitEthernet0/1');
  });
});

describe('NetworkInterface', () => {
  test('setIp validates address and mask', () => {
    const iface = new NetworkInterface({ name: 'Gi0/0' });
    iface.setIp('10.0.0.1', '255.0.0.0');
    assert.ok(iface.hasIpConfigured());
    assert.throws(() => iface.setIp('999.0.0.1', '255.0.0.0'));
    assert.throws(() => iface.setIp('10.0.0.1', '255.0.255.0'));
  });
});

describe('Node ↔ Device integration', () => {
  test('a new Node builds the matching device and syncs hostname', () => {
    const node = new Node({ id: 'n1', deviceType: 'router', hostname: 'Core' });
    assert.ok(node.device instanceof Router);
    assert.equal(node.device.hostname, 'Core');
    node.hostname = 'Edge';
    assert.equal(node.device.hostname, 'Edge');
  });

  test('Node round-trips the device config through JSON', () => {
    const node = new Node({ id: 'n1', deviceType: 'pc', hostname: 'PC1' });
    node.device.getInterface('FastEthernet0').setIp('192.168.1.10', '255.255.255.0');
    node.device.defaultGateway = '192.168.1.1';

    const restored = Node.fromJSON(node.toJSON());
    assert.equal(restored.hostname, 'PC1');
    assert.equal(restored.device.defaultGateway, '192.168.1.1');
    assert.equal(restored.device.getInterface('FastEthernet0').ipAddress, '192.168.1.10');
  });

  test('v0.1-style JSON without a device field still loads', () => {
    const legacy = { id: 'n1', deviceType: 'switch', hostname: 'S-old', x: 5, y: 6 };
    const node = Node.fromJSON(legacy);
    assert.equal(node.hostname, 'S-old');
    assert.ok(node.device, 'device should be reconstructed from deviceType');
    assert.equal(node.device.type, 'switch');
  });

  test('clone produces an independent device copy', () => {
    const node = new Node({ id: 'n1', deviceType: 'router', hostname: 'R1' });
    const clone = node.clone('n2');
    clone.device.getInterface('GigabitEthernet0/0').setIp('1.1.1.1', '255.255.255.0');
    assert.equal(node.device.getInterface('GigabitEthernet0/0').ipAddress, null);
    assert.equal(clone.hostname, 'R1-copy');
  });
});

describe('Topology port tracking', () => {
  test('getUsedInterfaceNames reflects edge port assignments', () => {
    const topology = new Topology();
    const r = new Node({ id: 'r', deviceType: 'router' });
    const s = new Node({ id: 's', deviceType: 'switch' });
    topology.addNode(r);
    topology.addNode(s);
    topology.addEdge(
      new Edge({
        id: 'e1',
        sourceNodeId: 'r',
        targetNodeId: 's',
        sourcePort: 'GigabitEthernet0/0',
        targetPort: 'FastEthernet0/1',
      }),
    );

    assert.deepEqual([...topology.getUsedInterfaceNames('r')], ['GigabitEthernet0/0']);
    assert.deepEqual([...topology.getUsedInterfaceNames('s')], ['FastEthernet0/1']);
  });
});
