import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Topology } from '../topology/Topology.js';
import { Node } from '../topology/Node.js';
import { Edge } from '../topology/Edge.js';
import { CliSession } from '../cli/CliSession.js';
import { CommandTree, ResolveError } from '../cli/CommandTree.js';
import { PacketEngine } from '../engine/PacketEngine.js';

function makeSession(deviceType = 'router', hostname = 'R1') {
  const topology = new Topology();
  const node = new Node({ id: 'n1', deviceType, hostname });
  topology.addNode(node);
  return { session: new CliSession({ node, topology }), topology, node };
}

describe('CommandTree', () => {
  test('resolves exact and abbreviated commands', () => {
    const tree = new CommandTree();
    let called = false;
    tree.add('show ip interface brief', () => {
      called = true;
    });
    const result = tree.resolve(['sh', 'ip', 'int', 'br']);
    assert.equal(typeof result.handler, 'function');
    result.handler();
    assert.ok(called);
  });

  test('captures parameters including rest-of-line', () => {
    const tree = new CommandTree();
    tree.add('description <text...>', () => {});
    const result = tree.resolve(['description', 'Link', 'to', 'core']);
    assert.equal(result.args.text, 'Link to core');
  });

  test('reports invalid and incomplete commands', () => {
    const tree = new CommandTree();
    tree.add('show run', () => {});
    tree.add('show startup', () => {});

    assert.equal(tree.resolve(['xyz']).kind, ResolveError.INVALID);
    assert.equal(tree.resolve(['show', 'zzz']).kind, ResolveError.INVALID);
    assert.equal(tree.resolve(['show']).kind, ResolveError.INCOMPLETE);
    // A unique abbreviation resolves successfully rather than erroring.
    assert.equal(typeof tree.resolve(['show', 's']).handler, 'function');
  });

  test('ambiguous abbreviation is reported', () => {
    const tree = new CommandTree();
    tree.add('show running-config', () => {});
    tree.add('show startup-config', () => {});
    tree.add('reload', () => {});
    // "s" under show root is ambiguous between running/startup only if both
    // start with s; here running vs startup -> "r"/"s" distinct. Use another.
    tree.add('show ip', () => {});
    tree.add('show interfaces', () => {});
    const result = tree.resolve(['show', 'i']);
    assert.equal(result.kind, ResolveError.AMBIGUOUS);
  });

  test('completion lists next keywords filtered by partial', () => {
    const tree = new CommandTree();
    tree.add('show ip route', () => {});
    tree.add('show ip interface brief', () => {});
    tree.add('show ip ospf neighbor', () => {});
    const { completions } = tree.complete(['show', 'ip'], true);
    assert.deepEqual(completions, ['interface', 'ospf', 'route']);
  });
});

describe('CLI mode transitions', () => {
  test('walks user → privileged → global → interface and back', () => {
    const { session } = makeSession();
    assert.match(session.prompt, /^R1>$/);
    session.execute('enable');
    assert.match(session.prompt, /^R1#$/);
    session.execute('configure terminal');
    assert.match(session.prompt, /\(config\)#$/);
    session.execute('interface gi0/0');
    assert.match(session.prompt, /\(config-if\)#$/);
    session.execute('exit');
    assert.match(session.prompt, /\(config\)#$/);
    session.execute('end');
    assert.match(session.prompt, /^R1#$/);
  });
});

describe('CLI configuration', () => {
  test('hostname changes the device and prompt', () => {
    const { session } = makeSession();
    session.execute('enable');
    session.execute('configure terminal');
    session.execute('hostname Core');
    assert.equal(session.device.hostname, 'Core');
    assert.match(session.prompt, /^Core\(config\)#$/);
  });

  test('interface ip address + no shutdown updates the model', () => {
    const { session, node } = makeSession();
    session.execute('enable');
    session.execute('configure terminal');
    session.execute('interface GigabitEthernet0/0');
    session.execute('ip address 10.0.0.1 255.255.255.0');
    session.execute('no shutdown');
    const iface = node.device.getInterface('GigabitEthernet0/0');
    assert.equal(iface.ipAddress, '10.0.0.1');
    assert.equal(iface.enabled, true);
  });

  test('rejects an invalid ip address with an IOS-style error', () => {
    const { session } = makeSession();
    session.execute('enable');
    session.execute('configure terminal');
    session.execute('interface gi0/0');
    const out = session.execute('ip address 999.0.0.1 255.255.255.0');
    assert.match(out, /Invalid input/);
  });

  test('vlan creation and naming shows up in show vlan brief', () => {
    const { session } = makeSession('switch', 'SW1');
    session.execute('enable');
    session.execute('configure terminal');
    session.execute('vlan 10');
    session.execute('name SALES');
    session.execute('end');
    const out = session.execute('show vlan brief');
    assert.match(out, /10\s+SALES\s+active/);
  });

  test('static route appears in running-config and show ip route', () => {
    const { session } = makeSession();
    session.execute('enable');
    session.execute('configure terminal');
    session.execute('ip route 0.0.0.0 0.0.0.0 10.0.0.254');
    session.execute('end');
    assert.match(
      session.execute('show running-config'),
      /ip route 0\.0\.0\.0 0\.0\.0\.0 10\.0\.0\.254/,
    );
    assert.match(session.execute('show ip route'), /S {4}0\.0\.0\.0\/0 \[1\/0\] via 10\.0\.0\.254/);
  });
});

describe('CLI show commands', () => {
  test('show ip interface brief lists all interfaces', () => {
    const { session } = makeSession();
    session.execute('enable');
    const out = session.execute('show ip interface brief');
    assert.match(out, /GigabitEthernet0\/0/);
    assert.match(out, /Serial0\/0\/0/);
  });

  test('show cdp neighbors reflects the topology', () => {
    const topology = new Topology();
    const r = new Node({ id: 'r', deviceType: 'router', hostname: 'R1' });
    const sw = new Node({ id: 's', deviceType: 'switch', hostname: 'SW1' });
    topology.addNode(r);
    topology.addNode(sw);
    topology.addEdge(
      new Edge({
        id: 'e1',
        sourceNodeId: 'r',
        targetNodeId: 's',
        sourcePort: 'GigabitEthernet0/0',
        targetPort: 'FastEthernet0/1',
      }),
    );
    const session = new CliSession({ node: r, topology });
    session.execute('enable');
    const out = session.execute('show cdp neighbors');
    assert.match(out, /SW1/);
    assert.match(out, /Gi0\/0/);
  });

  test('copy running-config startup-config stores a snapshot', () => {
    const { session, node } = makeSession();
    session.execute('enable');
    session.execute('configure terminal');
    session.execute('hostname Saved');
    session.execute('end');
    const out = session.execute('copy running-config startup-config');
    assert.match(out, /\[OK\]/);
    assert.match(node.device.startupConfig, /hostname Saved/);
  });

  test('history navigation returns previous commands', () => {
    const { session } = makeSession();
    session.execute('enable');
    session.execute('show version');
    assert.equal(session.historyPrev(), 'show version');
    assert.equal(session.historyPrev(), 'enable');
  });
});

describe('CLI ping via the packet engine', () => {
  test('ping succeeds over a direct link and fails to an absent host', () => {
    const topology = new Topology();
    const a = new Node({ id: 'a', deviceType: 'router', hostname: 'A' });
    const b = new Node({ id: 'b', deviceType: 'router', hostname: 'B' });
    topology.addNode(a);
    topology.addNode(b);
    topology.addEdge(
      new Edge({
        id: 'e1',
        sourceNodeId: 'a',
        targetNodeId: 'b',
        sourcePort: 'GigabitEthernet0/0',
        targetPort: 'GigabitEthernet0/0',
      }),
    );
    a.device.getInterface('GigabitEthernet0/0').setIp('10.0.0.1', '255.255.255.0');
    a.device.getInterface('GigabitEthernet0/0').enabled = true;
    b.device.getInterface('GigabitEthernet0/0').setIp('10.0.0.2', '255.255.255.0');
    b.device.getInterface('GigabitEthernet0/0').enabled = true;

    const engine = new PacketEngine(topology);
    const session = new CliSession({ node: a, topology, packetEngine: engine });
    session.execute('enable');
    assert.match(session.execute('ping 10.0.0.2'), /!!!!!/);
    assert.match(session.execute('ping 10.0.0.99'), /\.\.\.\.\./);
  });
});
