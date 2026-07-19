import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Topology } from '../topology/Topology.js';
import { PacketEngine } from '../engine/PacketEngine.js';
import { ScenarioEngine } from '../scenarios/ScenarioEngine.js';
import {
  allScenarios,
  generateAddressingScenarios,
  generateGatewayScenarios,
  generateShutdownScenarios,
  generateVlanScenarios,
  generateWrongSubnetScenarios,
  generateDefaultRouteScenarios,
  generateWrongNextHopScenarios,
  generateTrunkScenarios,
  generateOspfTransitScenarios,
  generateWrongGatewayScenarios,
  generateWrongRouterIpScenarios,
} from '../labs/scenarios.js';
import { pingSucceeds, interfaceEnabled, resolveNode } from '../scenarios/checks.js';

function freshEngine() {
  const topology = new Topology();
  const engine = new PacketEngine(topology);
  const scenarioEngine = new ScenarioEngine({ topology, engine });
  return { topology, engine, scenarioEngine };
}

/** Applies the intended fix for each authored scenario. */
const FIXES = {
  'shutdown-interface': (t) => {
    t.getNode('r1').device.getInterface('GigabitEthernet0/1').enabled = true;
  },
  'missing-ip-address': (t) => {
    t.getNode('r1').device.getInterface('GigabitEthernet0/0').setIp('192.168.1.1', '255.255.255.0');
  },
  'vlan-mismatch': (t) => {
    t.getNode('sw1').device.getInterface('FastEthernet0/2').accessVlan = 10;
  },
  'ospf-missing-network': (t) => {
    t.getNode('r2').device.config.ospf.networks.push({
      address: '192.168.2.0',
      wildcard: '0.0.0.255',
      area: 0,
    });
  },
};

describe('checks library', () => {
  test('resolveNode finds a node by id and by hostname', () => {
    const { topology, scenarioEngine } = freshEngine();
    scenarioEngine.load(generateAddressingScenarios(1)[0]);
    assert.ok(resolveNode(topology, 'pc1'));
    assert.ok(resolveNode(topology, 'PC1'));
    assert.equal(resolveNode(topology, 'nope'), null);
  });

  test('a check reports pass/fail with detail', () => {
    const { topology, engine, scenarioEngine } = freshEngine();
    scenarioEngine.load(allScenarios()[0]); // shutdown-interface
    const check = interfaceEnabled('R1', 'GigabitEthernet0/1');
    const before = check.run({ topology, engine });
    assert.equal(before.passed, false);
    topology.getNode('r1').device.getInterface('GigabitEthernet0/1').enabled = true;
    const after = check.run({ topology, engine });
    assert.equal(after.passed, true);
  });
});

describe('ScenarioEngine scoring', () => {
  test('every authored scenario starts unsolved and is solvable by its fix', () => {
    for (const scenario of allScenarios().filter((s) => FIXES[s.id])) {
      const { topology, scenarioEngine } = freshEngine();
      scenarioEngine.load(scenario);

      const before = scenarioEngine.evaluate();
      assert.equal(before.passedAll, false, `${scenario.id} should start unsolved`);

      FIXES[scenario.id](topology);

      const after = scenarioEngine.evaluate();
      assert.equal(after.passedAll, true, `${scenario.id} should be solved after its fix`);
      assert.equal(after.score, after.maxScore);
      assert.ok(after.explanation, `${scenario.id} should reveal an explanation when solved`);
    }
  });

  test('generated addressing drills start unsolved and pass once addressed', () => {
    const scenario = generateAddressingScenarios(1)[0];
    const { topology, scenarioEngine } = freshEngine();
    scenarioEngine.load(scenario);
    assert.equal(scenarioEngine.evaluate().passedAll, false);

    // The first scenario targets 192.168.10.12/24 for PC2.
    topology
      .getNode('pc2')
      .device.getInterface('FastEthernet0')
      .setIp('192.168.10.12', '255.255.255.0');
    assert.equal(scenarioEngine.evaluate().passedAll, true);
  });

  test('a used hint reduces the final score by one', () => {
    const scenario = allScenarios()[0];
    const { topology, scenarioEngine } = freshEngine();
    scenarioEngine.load(scenario);
    FIXES[scenario.id](topology);

    const clean = scenarioEngine.evaluate();
    scenarioEngine.revealHint();
    const withHint = scenarioEngine.evaluate();
    assert.equal(withHint.score, clean.score - 1);
    assert.equal(withHint.passedAll, true);
  });

  test('the generator produces the requested count with unique ids', () => {
    const scenarios = generateAddressingScenarios(20);
    assert.equal(scenarios.length, 20);
    assert.equal(new Set(scenarios.map((s) => s.id)).size, 20);
  });

  test('every generated scenario across all families has a unique id', () => {
    const all = allScenarios();
    assert.equal(new Set(all.map((s) => s.id)).size, all.length);
  });

  test('the catalog now spans several distinct drill families, not one template', () => {
    const generated = allScenarios().filter((s) => s.generated);
    const families = new Set(generated.map((s) => s.id.replace(/-\d+$/, '')));
    assert.ok(families.size >= 11, `expected >= 11 families, got ${[...families].join(', ')}`);
    assert.ok(generated.length >= 55, `expected a large pool, got ${generated.length}`);
  });

  test('every checked scenario in the catalog starts unsolved', () => {
    for (const scenario of allScenarios()) {
      if (!scenario.checks || scenario.checks.length === 0) continue;
      const { scenarioEngine } = freshEngine();
      scenarioEngine.load(scenario);
      assert.equal(
        scenarioEngine.evaluate().passedAll,
        false,
        `${scenario.id} should start unsolved`,
      );
    }
  });
});

describe('each generated drill family is broken on load and solvable by its fix', () => {
  test('gateway family: setting PC2 default gateway restores the ping', () => {
    const scenario = generateGatewayScenarios(1)[0];
    const { topology, scenarioEngine } = freshEngine();
    scenarioEngine.load(scenario);
    assert.equal(scenarioEngine.evaluate().passedAll, false);
    // Family 2 uses lanB = 192.168.60.0/24, so the gateway is 192.168.60.1.
    topology.getNode('pc2').device.defaultGateway = '192.168.60.1';
    assert.equal(scenarioEngine.evaluate().passedAll, true);
  });

  test('shutdown family: no shutdown on R1 restores the ping', () => {
    const scenario = generateShutdownScenarios(1)[0];
    const { topology, scenarioEngine } = freshEngine();
    scenarioEngine.load(scenario);
    assert.equal(scenarioEngine.evaluate().passedAll, false);
    topology.getNode('r1').device.getInterface('GigabitEthernet0/1').enabled = true;
    assert.equal(scenarioEngine.evaluate().passedAll, true);
  });

  test('vlan family: moving PC2 back to the right VLAN restores the ping', () => {
    const scenario = generateVlanScenarios(1)[0];
    const { topology, scenarioEngine } = freshEngine();
    scenarioEngine.load(scenario);
    assert.equal(scenarioEngine.evaluate().passedAll, false);
    // Family 4's first drill uses VLAN 10 as the correct VLAN.
    topology.getNode('sw1').device.getInterface('FastEthernet0/2').accessVlan = 10;
    assert.equal(scenarioEngine.evaluate().passedAll, true);
  });

  test('wrong-subnet family: re-addressing PC2 into PC1 subnet restores the ping', () => {
    const scenario = generateWrongSubnetScenarios(1)[0];
    const { topology, scenarioEngine } = freshEngine();
    scenarioEngine.load(scenario);
    assert.equal(scenarioEngine.evaluate().passedAll, false);
    // Family 5's first drill targets 172.16.20.12/24 for PC2.
    topology
      .getNode('pc2')
      .device.getInterface('FastEthernet0')
      .setIp('172.16.20.12', '255.255.255.0');
    assert.equal(scenarioEngine.evaluate().passedAll, true);
  });

  test('default-route family: a default route lets PC1 reach the Internet host', () => {
    const scenario = generateDefaultRouteScenarios(1)[0];
    const { topology, scenarioEngine } = freshEngine();
    scenarioEngine.load(scenario);
    assert.equal(scenarioEngine.evaluate().passedAll, false);
    topology.getNode('r1').device.config.staticRoutes.push({
      prefix: '0.0.0.0',
      mask: '0.0.0.0',
      nextHop: '10.10.0.2',
    });
    assert.equal(scenarioEngine.evaluate().passedAll, true);
  });

  test('wrong-nexthop family: fixing the next-hop restores the ping', () => {
    const scenario = generateWrongNextHopScenarios(1)[0];
    const { topology, scenarioEngine } = freshEngine();
    scenarioEngine.load(scenario);
    assert.equal(scenarioEngine.evaluate().passedAll, false);
    const route = topology
      .getNode('r1')
      .device.config.staticRoutes.find((r) => r.prefix === '172.20.0.0');
    route.nextHop = '10.20.0.2';
    assert.equal(scenarioEngine.evaluate().passedAll, true);
  });

  test('trunk family: trunking the inter-switch link restores the ping', () => {
    const scenario = generateTrunkScenarios(1)[0];
    const { topology, scenarioEngine } = freshEngine();
    scenarioEngine.load(scenario);
    assert.equal(scenarioEngine.evaluate().passedAll, false);
    topology.getNode('sw1').device.getInterface('GigabitEthernet0/1').switchportMode = 'trunk';
    topology.getNode('sw2').device.getInterface('GigabitEthernet0/1').switchportMode = 'trunk';
    assert.equal(scenarioEngine.evaluate().passedAll, true);
  });

  test('ospf-transit family: advertising the transit link forms the adjacency', () => {
    const scenario = generateOspfTransitScenarios(1)[0];
    const { topology, scenarioEngine } = freshEngine();
    scenarioEngine.load(scenario);
    assert.equal(scenarioEngine.evaluate().passedAll, false);
    topology.getNode('r1').device.config.ospf.networks.push({
      address: '10.30.0.0',
      wildcard: '0.0.0.3',
      area: 0,
    });
    assert.equal(scenarioEngine.evaluate().passedAll, true);
  });

  test('wrong-gateway family: pointing PC2 at the real router restores the ping', () => {
    const scenario = generateWrongGatewayScenarios(1)[0];
    const { topology, scenarioEngine } = freshEngine();
    scenarioEngine.load(scenario);
    assert.equal(scenarioEngine.evaluate().passedAll, false);
    topology.getNode('pc2').device.defaultGateway = '192.168.130.1';
    assert.equal(scenarioEngine.evaluate().passedAll, true);
  });

  test('wrong-router-ip family: re-addressing R1 into PC1 subnet restores the ping', () => {
    const scenario = generateWrongRouterIpScenarios(1)[0];
    const { topology, scenarioEngine } = freshEngine();
    scenarioEngine.load(scenario);
    assert.equal(scenarioEngine.evaluate().passedAll, false);
    topology
      .getNode('r1')
      .device.getInterface('GigabitEthernet0/0')
      .setIp('192.168.140.1', '255.255.255.0');
    assert.equal(scenarioEngine.evaluate().passedAll, true);
  });
});

describe('pingSucceeds check integrates with the engine', () => {
  test('passes only when the network is actually fixed', () => {
    const { topology, engine, scenarioEngine } = freshEngine();
    scenarioEngine.load(allScenarios()[0]); // shutdown-interface
    const check = pingSucceeds('PC1', '192.168.2.10');
    assert.equal(check.run({ topology, engine }).passed, false);
    topology.getNode('r1').device.getInterface('GigabitEthernet0/1').enabled = true;
    assert.equal(check.run({ topology, engine }).passed, true);
  });
});
