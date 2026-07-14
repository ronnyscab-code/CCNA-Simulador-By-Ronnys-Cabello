import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Topology } from '../topology/Topology.js';
import { Node } from '../topology/Node.js';
import { Edge } from '../topology/Edge.js';
import { PacketEngine } from '../engine/PacketEngine.js';
import { CliSession } from '../cli/CliSession.js';
import { translateSource } from '../protocols/nat.js';

function setIp(node, ifaceName, ip, mask) {
  const iface = node.device.getInterface(ifaceName);
  iface.setIp(ip, mask);
  iface.enabled = true;
}

describe('NAT translation logic', () => {
  test('static mapping translates a specific inside-local', () => {
    const device = {
      config: {
        nat: {
          staticMaps: [{ insideLocal: '10.0.0.5', insideGlobal: '203.0.113.5' }],
          dynamic: null,
        },
      },
    };
    const t = translateSource(device, {
      srcIp: '10.0.0.5',
      outsideIfaceIp: '203.0.113.1',
      aclPermits: () => false,
    });
    assert.deepEqual(t, { insideGlobal: '203.0.113.5', kind: 'static' });
  });

  test('PAT uses the outside interface address when the ACL permits', () => {
    const device = { config: { nat: { staticMaps: [], dynamic: { aclId: '1', overload: true } } } };
    const t = translateSource(device, {
      srcIp: '192.168.1.10',
      outsideIfaceIp: '203.0.113.1',
      aclPermits: () => true,
    });
    assert.deepEqual(t, { insideGlobal: '203.0.113.1', kind: 'pat' });
  });

  test('no translation when the ACL does not permit and no static map', () => {
    const device = { config: { nat: { staticMaps: [], dynamic: { aclId: '1', overload: true } } } };
    assert.equal(
      translateSource(device, {
        srcIp: '192.168.1.10',
        outsideIfaceIp: '203.0.113.1',
        aclPermits: () => false,
      }),
      null,
    );
  });

  test('no NAT config means no translation', () => {
    assert.equal(
      translateSource(
        { config: { nat: null } },
        { srcIp: '1.1.1.1', outsideIfaceIp: '2.2.2.2', aclPermits: () => true },
      ),
      null,
    );
  });
});

/** PC1 (inside) — R1 — EXT (outside). */
function buildNatEdge() {
  const topology = new Topology();
  const pc1 = new Node({ id: 'pc1', deviceType: 'pc', hostname: 'PC1' });
  const r1 = new Node({ id: 'r1', deviceType: 'router', hostname: 'R1' });
  const ext = new Node({ id: 'ext', deviceType: 'pc', hostname: 'EXT' });
  [pc1, r1, ext].forEach((n) => topology.addNode(n));
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
      targetNodeId: 'ext',
      sourcePort: 'GigabitEthernet0/1',
      targetPort: 'FastEthernet0',
    }),
  );
  setIp(pc1, 'FastEthernet0', '192.168.1.10', '255.255.255.0');
  pc1.device.defaultGateway = '192.168.1.1';
  setIp(r1, 'GigabitEthernet0/0', '192.168.1.1', '255.255.255.0');
  setIp(r1, 'GigabitEthernet0/1', '203.0.113.1', '255.255.255.0');
  setIp(ext, 'FastEthernet0', '203.0.113.9', '255.255.255.0');
  ext.device.defaultGateway = '203.0.113.1';
  r1.device.getInterface('GigabitEthernet0/0').natRole = 'inside';
  r1.device.getInterface('GigabitEthernet0/1').natRole = 'outside';
  return { topology, r1 };
}

describe('NAT/PAT in the engine', () => {
  test('PAT records an inside-local → outside-interface translation on a ping', () => {
    const { topology, r1 } = buildNatEdge();
    r1.device.config.acls['1'] = {
      type: 'standard',
      entries: [
        { type: 'standard', action: 'permit', srcIp: '192.168.1.0', srcWildcard: '0.0.0.255' },
      ],
    };
    r1.device.config.nat = {
      staticMaps: [],
      dynamic: { aclId: '1', outsideIface: 'GigabitEthernet0/1', overload: true },
    };

    const engine = new PacketEngine(topology);
    assert.equal(engine.ping('pc1', '203.0.113.9').success, true);

    const table = engine.natTableFor('r1');
    assert.equal(table.length, 1);
    assert.equal(table[0].insideLocal, '192.168.1.10');
    assert.equal(table[0].insideGlobal, '203.0.113.1');
  });

  test('reset clears the translation table', () => {
    const { topology, r1 } = buildNatEdge();
    r1.device.config.acls['1'] = {
      type: 'standard',
      entries: [
        { type: 'standard', action: 'permit', srcIp: '192.168.1.0', srcWildcard: '0.0.0.255' },
      ],
    };
    r1.device.config.nat = { staticMaps: [], dynamic: { aclId: '1', overload: true } };
    const engine = new PacketEngine(topology);
    engine.ping('pc1', '203.0.113.9');
    assert.ok(engine.natTableFor('r1').length > 0);
    engine.reset();
    assert.equal(engine.natTableFor('r1').length, 0);
  });
});

describe('NAT CLI', () => {
  test('configures inside/outside + overload and shows a translation', () => {
    const { topology, r1 } = buildNatEdge();
    // clear the programmatic roles so the CLI sets them.
    r1.device.getInterface('GigabitEthernet0/0').natRole = null;
    r1.device.getInterface('GigabitEthernet0/1').natRole = null;
    const engine = new PacketEngine(topology);

    const s = new CliSession({ node: r1, topology, packetEngine: engine });
    [
      'enable',
      'configure terminal',
      'interface GigabitEthernet0/0',
      'ip nat inside',
      'exit',
      'interface GigabitEthernet0/1',
      'ip nat outside',
      'exit',
      'access-list 1 permit 192.168.1.0 0.0.0.255',
      'ip nat inside source list 1 interface GigabitEthernet0/1 overload',
      'end',
    ].forEach((c) => s.execute(c));

    assert.equal(r1.device.getInterface('GigabitEthernet0/0').natRole, 'inside');
    assert.equal(engine.ping('pc1', '203.0.113.9').success, true);
    const show = s.execute('show ip nat translations');
    assert.match(show, /192\.168\.1\.10/);
    assert.match(show, /203\.0\.113\.1/);
    assert.match(s.execute('show running-config'), /ip nat inside source list 1 interface/);
  });
});
