import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Topology } from '../topology/Topology.js';
import { Node } from '../topology/Node.js';
import { Edge } from '../topology/Edge.js';
import { PacketEngine, PingReason } from '../engine/PacketEngine.js';
import { CliSession } from '../cli/CliSession.js';
import { evaluateAcl, wildcardMatch, AclAction } from '../protocols/acl.js';

function setIp(node, ifaceName, ip, mask) {
  const iface = node.device.getInterface(ifaceName);
  iface.setIp(ip, mask);
  iface.enabled = true;
}

const denyHostThenPermitAny = {
  type: 'standard',
  entries: [
    { type: 'standard', action: AclAction.DENY, srcIp: '192.168.1.66', srcWildcard: '0.0.0.0' },
    {
      type: 'standard',
      action: AclAction.PERMIT,
      srcIp: '0.0.0.0',
      srcWildcard: '255.255.255.255',
    },
  ],
};

describe('ACL evaluation', () => {
  test('wildcardMatch honors the inverse mask', () => {
    assert.equal(wildcardMatch('192.168.1.5', '192.168.1.0', '0.0.0.255'), true);
    assert.equal(wildcardMatch('192.168.2.5', '192.168.1.0', '0.0.0.255'), false);
    assert.equal(wildcardMatch('10.0.0.9', '10.0.0.9', '0.0.0.0'), true);
  });

  test('first match wins and the denied host is dropped', () => {
    assert.equal(
      evaluateAcl(denyHostThenPermitAny, {
        protocol: 'icmp',
        srcIp: '192.168.1.66',
        dstIp: '8.8.8.8',
      }),
      false,
    );
    assert.equal(
      evaluateAcl(denyHostThenPermitAny, {
        protocol: 'icmp',
        srcIp: '192.168.1.10',
        dstIp: '8.8.8.8',
      }),
      true,
    );
  });

  test('an empty or missing ACL implicitly denies', () => {
    assert.equal(evaluateAcl({ type: 'standard', entries: [] }, { srcIp: '1.1.1.1' }), false);
    assert.equal(evaluateAcl(undefined, { srcIp: '1.1.1.1' }), false);
  });

  test('extended ACE matches protocol and destination', () => {
    const acl = {
      type: 'extended',
      entries: [
        {
          type: 'extended',
          action: AclAction.DENY,
          protocol: 'icmp',
          srcIp: '10.0.0.0',
          srcWildcard: '0.0.0.255',
          dstIp: '20.0.0.5',
          dstWildcard: '0.0.0.0',
        },
        {
          type: 'extended',
          action: AclAction.PERMIT,
          protocol: 'ip',
          srcIp: '0.0.0.0',
          srcWildcard: '255.255.255.255',
          dstIp: '0.0.0.0',
          dstWildcard: '255.255.255.255',
        },
      ],
    };
    assert.equal(
      evaluateAcl(acl, { protocol: 'icmp', srcIp: '10.0.0.9', dstIp: '20.0.0.5' }),
      false,
    );
    assert.equal(
      evaluateAcl(acl, { protocol: 'icmp', srcIp: '10.0.0.9', dstIp: '20.0.0.6' }),
      true,
    );
  });
});

/** PC1 & GUEST on SW1 → R1 → SERVER. */
function buildFilteredNetwork() {
  const topology = new Topology();
  const pc1 = new Node({ id: 'pc1', deviceType: 'pc', hostname: 'PC1' });
  const guest = new Node({ id: 'guest', deviceType: 'pc', hostname: 'GUEST' });
  const sw = new Node({ id: 'sw', deviceType: 'switch', hostname: 'SW1' });
  const r1 = new Node({ id: 'r1', deviceType: 'router', hostname: 'R1' });
  const srv = new Node({ id: 'srv', deviceType: 'pc', hostname: 'SERVER' });
  [pc1, guest, sw, r1, srv].forEach((n) => topology.addNode(n));

  topology.addEdge(
    new Edge({
      id: 'a',
      sourceNodeId: 'pc1',
      targetNodeId: 'sw',
      sourcePort: 'FastEthernet0',
      targetPort: 'FastEthernet0/1',
    }),
  );
  topology.addEdge(
    new Edge({
      id: 'b',
      sourceNodeId: 'guest',
      targetNodeId: 'sw',
      sourcePort: 'FastEthernet0',
      targetPort: 'FastEthernet0/2',
    }),
  );
  topology.addEdge(
    new Edge({
      id: 'c',
      sourceNodeId: 'sw',
      targetNodeId: 'r1',
      sourcePort: 'FastEthernet0/3',
      targetPort: 'GigabitEthernet0/0',
    }),
  );
  topology.addEdge(
    new Edge({
      id: 'd',
      sourceNodeId: 'r1',
      targetNodeId: 'srv',
      sourcePort: 'GigabitEthernet0/1',
      targetPort: 'FastEthernet0',
    }),
  );

  setIp(pc1, 'FastEthernet0', '192.168.1.10', '255.255.255.0');
  pc1.device.defaultGateway = '192.168.1.1';
  setIp(guest, 'FastEthernet0', '192.168.1.66', '255.255.255.0');
  guest.device.defaultGateway = '192.168.1.1';
  setIp(r1, 'GigabitEthernet0/0', '192.168.1.1', '255.255.255.0');
  setIp(r1, 'GigabitEthernet0/1', '192.168.2.1', '255.255.255.0');
  setIp(srv, 'FastEthernet0', '192.168.2.10', '255.255.255.0');
  srv.device.defaultGateway = '192.168.2.1';

  return { topology, r1 };
}

describe('ACL enforcement in the engine', () => {
  test('without an ACL everyone reaches the server', () => {
    const { topology } = buildFilteredNetwork();
    const engine = new PacketEngine(topology);
    assert.equal(engine.ping('pc1', '192.168.2.10').success, true);
    assert.equal(engine.ping('guest', '192.168.2.10').success, true);
  });

  test('an outbound ACL blocks only the denied host', () => {
    const { topology, r1 } = buildFilteredNetwork();
    r1.device.config.acls['10'] = denyHostThenPermitAny;
    r1.device.getInterface('GigabitEthernet0/1').aclOut = '10';

    const engine = new PacketEngine(topology);
    assert.equal(engine.ping('pc1', '192.168.2.10').success, true);
    const guestResult = engine.ping('guest', '192.168.2.10');
    assert.equal(guestResult.success, false);
    assert.equal(guestResult.reason, PingReason.ACL_DENIED);
  });
});

describe('ACL CLI', () => {
  test('access-list + ip access-group configure and show correctly', () => {
    const { topology, r1 } = buildFilteredNetwork();
    const session = new CliSession({
      node: r1,
      topology,
      packetEngine: new PacketEngine(topology),
    });
    session.execute('enable');
    session.execute('configure terminal');
    session.execute('access-list 10 deny host 192.168.1.66');
    session.execute('access-list 10 permit any');
    session.execute('interface GigabitEthernet0/1');
    session.execute('ip access-group 10 out');
    session.execute('end');

    assert.equal(r1.device.getInterface('GigabitEthernet0/1').aclOut, '10');
    assert.equal(r1.device.config.acls['10'].entries.length, 2);

    const show = session.execute('show access-lists');
    assert.match(show, /Standard IP access list 10/);
    assert.match(show, /deny host 192\.168\.1\.66/);
    assert.match(show, /permit any/);

    // And it actually blocks the guest now.
    const engine = new PacketEngine(topology);
    assert.equal(engine.ping('guest', '192.168.2.10').reason, PingReason.ACL_DENIED);
  });
});
