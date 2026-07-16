import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { DeviceFactory } from '../devices/DeviceFactory.js';
import { Node } from '../topology/Node.js';
import {
  modelsForType,
  defaultModelId,
  getModel,
  modelLabel,
  buildModelInterfaces,
} from '../devices/models.js';

const names = (device) => device.interfaces.map((i) => i.name);

describe('model catalog', () => {
  test('router and switch expose several selectable models', () => {
    assert.ok(modelsForType('router').length >= 4);
    assert.ok(modelsForType('switch').length >= 4);
    assert.equal(modelsForType('pc').length, 0);
  });

  test('the default model matches the historical (legacy) layout', () => {
    const sw = buildModelInterfaces('switch', defaultModelId('switch'));
    assert.equal(sw.length, 26);
    assert.equal(sw[0].name, 'FastEthernet0/1');
    assert.equal(sw[24].name, 'GigabitEthernet0/1');

    const r = buildModelInterfaces('router', defaultModelId('router'));
    assert.deepEqual(
      r.map((i) => i.name),
      ['GigabitEthernet0/0', 'GigabitEthernet0/1', 'Serial0/0/0', 'Serial0/0/1'],
    );
  });

  test('an unknown model id falls back to the default layout', () => {
    const fallback = buildModelInterfaces('switch', 'does-not-exist');
    assert.equal(fallback.length, 26);
  });

  test('modelLabel returns the human label, or the id as a fallback', () => {
    assert.equal(modelLabel('router', '2911'), 'ISR 2911');
    assert.equal(modelLabel('router', 'weird'), 'weird');
  });
});

describe('models drive device interface layout', () => {
  test('48-port switch model yields 48 FastEthernet access ports', () => {
    const sw = DeviceFactory.create('switch', 'S1', { model: '2960-48TT' });
    assert.equal(sw.model, '2960-48TT');
    assert.equal(sw.interfaces.filter((i) => i.name.startsWith('FastEthernet')).length, 48);
    // Ports are access, VLAN 1, up — just like the default switch.
    assert.equal(sw.getInterface('FastEthernet0/48').switchportMode, 'access');
  });

  test('2911 router model has three GigabitEthernet ports', () => {
    const r = DeviceFactory.create('router', 'R1', { model: '2911' });
    assert.ok(names(r).includes('GigabitEthernet0/2'));
    // Routed ports are administratively down by default.
    assert.equal(r.getInterface('GigabitEthernet0/2').enabled, false);
  });

  test('4331 router model uses three-level GigabitEthernet naming', () => {
    const r = DeviceFactory.create('router', 'R1', { model: '4331' });
    assert.ok(names(r).includes('GigabitEthernet0/0/0'));
    assert.ok(getModel('router', '4331'));
  });

  test('capabilities stay tied to the device type, not the model', () => {
    const sw = DeviceFactory.create('switch', 'S1', { model: '3560-24PS' });
    assert.equal(sw.capabilities.switching, true);
    assert.equal(sw.capabilities.routing, false);
  });
});

describe('model persistence and node wiring', () => {
  test('the chosen model round-trips through serialization', () => {
    const original = DeviceFactory.create('switch', 'S1', { model: '3650-24PS' });
    const restored = DeviceFactory.fromJSON(original.toJSON());
    assert.equal(restored.model, '3650-24PS');
    assert.deepEqual(names(restored), names(original));
  });

  test('Node forwards a model to its device', () => {
    const node = new Node({ id: 'n1', deviceType: 'router', model: '1941' });
    assert.equal(node.device.model, '1941');
  });

  test('a Node with no model uses the type default', () => {
    const node = new Node({ id: 'n2', deviceType: 'switch' });
    assert.equal(node.device.model, defaultModelId('switch'));
  });
});
