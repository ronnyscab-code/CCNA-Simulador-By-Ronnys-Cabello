import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Topology } from '../topology/Topology.js';
import { Node } from '../topology/Node.js';
import { Edge } from '../topology/Edge.js';
import { PacketEngine } from '../engine/PacketEngine.js';
import { CliSession } from '../cli/CliSession.js';
import { nextFreeAddress, poolsServedBy } from '../protocols/dhcp.js';

const POOL = { network: '192.168.1.0', mask: '255.255.255.0' };

describe('DHCP allocation helpers', () => {
  test('nextFreeAddress skips network, broadcast, used, and reserved', () => {
    const used = new Set(['192.168.1.10']);
    const addr = nextFreeAddress(POOL, used, [], ['192.168.1.1']);
    // .0 network, .1 reserved (gateway), .10 used → first free is .2
    assert.equal(addr, '192.168.1.2');
  });

  test('nextFreeAddress honors excluded ranges', () => {
    const addr = nextFreeAddress(POOL, new Set(), [{ lo: '192.168.1.1', hi: '192.168.1.9' }], []);
    assert.equal(addr, '192.168.1.10');
  });

  test('nextFreeAddress returns null when the pool is exhausted', () => {
    const tiny = { network: '10.0.0.0', mask: '255.255.255.252' }; // .1 and .2 usable
    const used = new Set(['10.0.0.1', '10.0.0.2']);
    assert.equal(nextFreeAddress(tiny, used, [], []), null);
  });

  test('poolsServedBy reports the server interface on the pool subnet', () => {
    const r = new Node({ id: 'r', deviceType: 'router', hostname: 'R' });
    r.device.getInterface('GigabitEthernet0/0').setIp('192.168.1.1', '255.255.255.0');
    r.device.getInterface('GigabitEthernet0/0').enabled = true;
    r.device.config.dhcpPools.LAN = { network: '192.168.1.0', mask: '255.255.255.0' };
    const served = poolsServedBy(r.device);
    assert.equal(served.length, 1);
    assert.equal(served[0].serverIp, '192.168.1.1');
  });
});

/** R1 (DHCP server) — SW — PC1, PC2. */
function buildDhcpLan() {
  const topology = new Topology();
  const r1 = new Node({ id: 'r1', deviceType: 'router', hostname: 'R1' });
  const sw = new Node({ id: 'sw', deviceType: 'switch', hostname: 'SW' });
  const pc1 = new Node({ id: 'pc1', deviceType: 'pc', hostname: 'PC1' });
  const pc2 = new Node({ id: 'pc2', deviceType: 'pc', hostname: 'PC2' });
  [r1, sw, pc1, pc2].forEach((n) => topology.addNode(n));
  topology.addEdge(
    new Edge({
      id: 'e0',
      sourceNodeId: 'r1',
      targetNodeId: 'sw',
      sourcePort: 'GigabitEthernet0/0',
      targetPort: 'FastEthernet0/1',
    }),
  );
  topology.addEdge(
    new Edge({
      id: 'e1',
      sourceNodeId: 'pc1',
      targetNodeId: 'sw',
      sourcePort: 'FastEthernet0',
      targetPort: 'FastEthernet0/2',
    }),
  );
  topology.addEdge(
    new Edge({
      id: 'e2',
      sourceNodeId: 'pc2',
      targetNodeId: 'sw',
      sourcePort: 'FastEthernet0',
      targetPort: 'FastEthernet0/3',
    }),
  );
  r1.device.getInterface('GigabitEthernet0/0').setIp('192.168.1.1', '255.255.255.0');
  r1.device.getInterface('GigabitEthernet0/0').enabled = true;
  r1.device.config.dhcpExcluded.push({ lo: '192.168.1.1', hi: '192.168.1.9' });
  r1.device.config.dhcpPools.LAN = {
    network: '192.168.1.0',
    mask: '255.255.255.0',
    defaultRouter: '192.168.1.1',
    dnsServer: '8.8.8.8',
  };
  return { topology, r1, pc1, pc2 };
}

describe('DHCP leases via the engine', () => {
  test('two clients get sequential addresses above the excluded range', () => {
    const { topology, pc1, pc2 } = buildDhcpLan();
    const engine = new PacketEngine(topology);

    const r1res = engine.requestDhcp('pc1', 'FastEthernet0');
    assert.equal(r1res.success, true);
    assert.equal(r1res.ip, '192.168.1.10');
    assert.equal(pc1.device.defaultGateway, '192.168.1.1');

    const r2res = engine.requestDhcp('pc2', 'FastEthernet0');
    assert.equal(r2res.ip, '192.168.1.11');
    assert.notEqual(r2res.ip, r1res.ip);
    void pc2;
  });

  test('leased hosts can then ping each other', () => {
    const { topology } = buildDhcpLan();
    const engine = new PacketEngine(topology);
    engine.requestDhcp('pc1', 'FastEthernet0');
    const pc2ip = engine.requestDhcp('pc2', 'FastEthernet0').ip;
    assert.equal(engine.ping('pc1', pc2ip).success, true);
  });

  test('a client with no server on its segment is refused', () => {
    const { topology, r1 } = buildDhcpLan();
    r1.device.config.dhcpPools = {}; // remove the pool
    const engine = new PacketEngine(topology);
    assert.equal(engine.requestDhcp('pc1', 'FastEthernet0').success, false);
  });
});

describe('DHCP CLI', () => {
  test('ip dhcp pool + ip address dhcp assign a lease and round-trip in config', () => {
    const { topology, r1, pc1 } = buildDhcpLan();
    // Rebuild the server config through the CLI to exercise the parser.
    r1.device.config.dhcpPools = {};
    r1.device.config.dhcpExcluded = [];
    const engine = new PacketEngine(topology);

    const server = new CliSession({ node: r1, topology, packetEngine: engine });
    [
      'enable',
      'configure terminal',
      'ip dhcp excluded-address 192.168.1.1 192.168.1.9',
      'ip dhcp pool LAN',
      'network 192.168.1.0 255.255.255.0',
      'default-router 192.168.1.1',
      'end',
    ].forEach((c) => server.execute(c));
    assert.equal(r1.device.config.dhcpPools.LAN.network, '192.168.1.0');

    const client = new CliSession({ node: pc1, topology, packetEngine: engine });
    ['enable', 'configure terminal', 'interface FastEthernet0'].forEach((c) => client.execute(c));
    const out = client.execute('ip address dhcp');
    assert.match(out, /assigned DHCP address 192\.168\.1\.10/);
    assert.equal(pc1.device.getInterface('FastEthernet0').ipAddress, '192.168.1.10');

    // running-config shows dhcp on the client and the pool on the server.
    client.execute('end');
    assert.match(client.execute('show running-config'), /ip address dhcp/);
    assert.match(server.execute('show running-config'), /ip dhcp pool LAN/);
  });
});
