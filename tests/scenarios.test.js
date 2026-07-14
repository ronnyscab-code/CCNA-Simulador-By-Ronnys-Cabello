import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Topology } from '../topology/Topology.js';
import { PacketEngine } from '../engine/PacketEngine.js';
import { ScenarioEngine } from '../scenarios/ScenarioEngine.js';
import { allScenarios, generateAddressingScenarios } from '../labs/scenarios.js';
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

    // The scenario targets 192.168.16.12/24 for PC2.
    topology
      .getNode('pc2')
      .device.getInterface('FastEthernet0')
      .setIp('192.168.16.12', '255.255.255.0');
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
