import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { allPracticeQuestions } from '../labs/practiceQuestions.js';
import { extraPracticeQuestions } from '../labs/practiceQuestionsExtra.js';
import { Topology } from '../topology/Topology.js';
import { PacketEngine } from '../engine/PacketEngine.js';
import { ScenarioEngine } from '../scenarios/ScenarioEngine.js';

const DOMAINS = new Set([
  'Network Fundamentals',
  'Network Access',
  'IP Connectivity',
  'IP Services',
  'Security Fundamentals',
]);

function freshEngine() {
  const topology = new Topology();
  const engine = new PacketEngine(topology);
  return { topology, scenarioEngine: new ScenarioEngine({ topology, engine }) };
}

describe('practice question bank integrity', () => {
  test('the bank grew (base + extra) with unique ids', () => {
    const all = allPracticeQuestions();
    assert.ok(all.length >= 30, `expected >= 30 practice questions, got ${all.length}`);
    const ids = all.map((q) => q.id);
    assert.equal(new Set(ids).size, ids.length, 'duplicate practice question id');
  });

  test('every practice question is well-formed', () => {
    for (const q of allPracticeQuestions()) {
      assert.ok(q.id, `missing id`);
      assert.ok(DOMAINS.has(q.domain), `bad domain in ${q.id}: ${q.domain}`);
      assert.ok(q.prompt && q.prompt.length > 8, `bad prompt in ${q.id}`);
      assert.ok(q.choices.length >= 2, `too few choices in ${q.id}`);
      assert.equal(q.correct.length, 1, `expected exactly one correct in ${q.id}`);
      const choiceIds = new Set(q.choices.map((c) => c.id));
      assert.ok(choiceIds.has(q.correct[0]), `correct id not a choice in ${q.id}`);
      const texts = q.choices.map((c) => c.text);
      assert.equal(new Set(texts).size, texts.length, `duplicate choice text in ${q.id}`);
      assert.ok(q.explanation && q.labHint, `missing explanation/labHint in ${q.id}`);
      assert.equal(typeof q.createTopology, 'function', `missing createTopology in ${q.id}`);
    }
  });

  test('every createTopology builds a non-empty topology', () => {
    for (const q of allPracticeQuestions()) {
      const topo = q.createTopology();
      assert.ok(topo.getNodes().length >= 2, `${q.id} built too few nodes`);
    }
  });
});

describe('practice labs are broken on load and solvable by their fix', () => {
  test('every extra checked lab starts unsolved', () => {
    // The extra labs are designed so their fault breaks the FORWARD path the
    // engine actually models, so each must start failing its checks.
    for (const q of extraPracticeQuestions()) {
      if (!q.checks || q.checks.length === 0) continue;
      const { scenarioEngine } = freshEngine();
      scenarioEngine.load(q);
      assert.equal(
        scenarioEngine.evaluate().passedAll,
        false,
        `${q.id} should start unsolved (its fault must break something)`,
      );
    }
  });

  test('every extra lab with a solver reaches passedAll after solving', () => {
    for (const q of extraPracticeQuestions()) {
      if (!q.checks || q.checks.length === 0) continue;
      assert.equal(typeof q.solve, 'function', `${q.id} has checks but no solver`);
      const { topology, scenarioEngine } = freshEngine();
      scenarioEngine.load(q);
      q.solve(topology);
      const after = scenarioEngine.evaluate();
      assert.equal(
        after.passedAll,
        true,
        `${q.id} not solvable: ${JSON.stringify(after.results.map((r) => [r.passed, r.description]))}`,
      );
      assert.equal(after.score, after.maxScore);
    }
  });
});
