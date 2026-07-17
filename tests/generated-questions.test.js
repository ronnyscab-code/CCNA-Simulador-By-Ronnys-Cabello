import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { QUESTIONS, DOMAINS } from '../trainer/questions.js';
import { GENERATED_QUESTIONS } from '../trainer/generatedQuestions.js';
import { DEFAULT_QUESTIONS, TrainerEngine } from '../trainer/TrainerEngine.js';
import { TrainerStore } from '../trainer/TrainerStore.js';
import { prefixToMask, networkAddress, broadcastAddress } from '../devices/net-utils.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v) };
}

describe('generated question pool', () => {
  test('the built-in pool exceeds 500 questions', () => {
    assert.ok(DEFAULT_QUESTIONS.length >= 500, `expected >= 500, got ${DEFAULT_QUESTIONS.length}`);
    assert.equal(DEFAULT_QUESTIONS.length, QUESTIONS.length + GENERATED_QUESTIONS.length);
  });

  test('every generated question is well-formed with a valid domain', () => {
    const ids = new Set();
    for (const q of GENERATED_QUESTIONS) {
      assert.ok(q.id && !ids.has(q.id), `duplicate/missing id: ${q.id}`);
      ids.add(q.id);
      assert.ok(Object.values(DOMAINS).includes(q.domain), `bad domain: ${q.id}`);
      assert.ok(q.choices.length >= 2, `too few choices: ${q.id}`);
      assert.equal(q.correct.length, 1, `single-answer expected: ${q.id}`);
      const choiceIds = new Set(q.choices.map((c) => c.id));
      assert.ok(choiceIds.has(q.correct[0]), `correct id not a choice: ${q.id}`);
      const texts = q.choices.map((c) => c.text);
      assert.equal(new Set(texts).size, texts.length, `duplicate choice text: ${q.id}`);
      assert.ok(q.explanation && q.reference, `missing explanation/reference: ${q.id}`);
    }
  });

  test('ids are unique across the curated + generated pool', () => {
    const ids = DEFAULT_QUESTIONS.map((q) => q.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test('generation is deterministic (stable ids and answer positions)', async () => {
    const again = (await import('../trainer/generatedQuestions.js?fresh=1')).GENERATED_QUESTIONS;
    assert.equal(again.length, GENERATED_QUESTIONS.length);
    for (let i = 0; i < again.length; i += 1) {
      assert.equal(again[i].id, GENERATED_QUESTIONS[i].id);
      assert.equal(again[i].correct[0], GENERATED_QUESTIONS[i].correct[0]);
    }
  });

  test('the answer key is mathematically correct (spot-checks)', () => {
    // Pull a couple of families and re-derive the expected answer independently.
    const netQ = GENERATED_QUESTIONS.find((q) => q.id === 'gen-net-0');
    const m = netQ.prompt.match(/Host (\S+) has mask (\S+)/);
    const expectedNet = networkAddress(m[1], m[2]);
    assert.equal(netQ.choices.find((c) => c.id === netQ.correct[0]).text, expectedNet);

    const bcastQ = GENERATED_QUESTIONS.find((q) => q.id === 'gen-bcast-0');
    const mb = bcastQ.prompt.match(/Host (\S+) has mask (\S+)/);
    const expectedBcast = broadcastAddress(mb[1], mb[2]);
    assert.equal(bcastQ.choices.find((c) => c.id === bcastQ.correct[0]).text, expectedBcast);

    const maskQ = GENERATED_QUESTIONS.find((q) => q.id === 'gen-mask-24');
    assert.equal(maskQ.choices.find((c) => c.id === maskQ.correct[0]).text, prefixToMask(24));

    const hostsQ = GENERATED_QUESTIONS.find((q) => q.id === 'gen-hosts-26');
    assert.equal(hostsQ.choices.find((c) => c.id === hostsQ.correct[0]).text, String(2 ** 6 - 2));
  });
});

describe('exam configuration (domain + length)', () => {
  test('availableDomains lists every domain with a count summing to the pool', () => {
    const engine = new TrainerEngine({ store: new TrainerStore(memoryStorage()) });
    const domains = engine.availableDomains();
    assert.ok(domains.length >= 1);
    const sum = domains.reduce((acc, d) => acc + d.count, 0);
    assert.equal(sum, DEFAULT_QUESTIONS.length);
  });

  test('a domain-filtered exam only draws from that domain, capped to length', () => {
    const engine = new TrainerEngine({ store: new TrainerStore(memoryStorage()) });
    const { domain } = engine.availableDomains()[0];
    const exam = engine.buildExam({ count: 5, domain });
    assert.ok(exam.length > 0 && exam.length <= 5);
    assert.ok(exam.every((q) => q.domain === domain));
  });

  test('a difficulty-filtered exam only draws that difficulty', () => {
    const engine = new TrainerEngine({ store: new TrainerStore(memoryStorage()) });
    const { difficulty } = engine.availableDifficulties()[0];
    const exam = engine.buildExam({ count: 8, difficulty });
    assert.ok(exam.length > 0);
    assert.ok(exam.every((q) => q.difficulty === difficulty));
  });

  test('countMatching agrees with a domain+difficulty filter', () => {
    const engine = new TrainerEngine({ store: new TrainerStore(memoryStorage()) });
    const { domain } = engine.availableDomains()[0];
    const { difficulty } = engine.availableDifficulties()[0];
    const expected = DEFAULT_QUESTIONS.filter(
      (q) => q.domain === domain && q.difficulty === difficulty,
    ).length;
    assert.equal(engine.countMatching({ domain, difficulty }), expected);
  });
});

describe('review mode (your mistakes)', () => {
  test('wrong answers enter the review pool and correct ones clear it', () => {
    const engine = new TrainerEngine({ store: new TrainerStore(memoryStorage()) });
    assert.equal(engine.reviewCount(), 0);

    const q = engine.questions[0];
    engine.gradeStudyCard(q.id, false); // answered wrong
    assert.equal(engine.reviewCount(), 1);
    assert.equal(engine.buildReview()[0].id, q.id);

    engine.gradeStudyCard(q.id, true); // now correct
    assert.equal(engine.reviewCount(), 0);
    assert.equal(engine.buildReview().length, 0);
  });

  test('an exam records missed questions into the review pool', () => {
    const engine = new TrainerEngine({ store: new TrainerStore(memoryStorage()) });
    const exam = engine.buildExam({ count: 3 });
    const answers = {};
    exam.forEach((q, i) => {
      answers[q.id] = i === 0 ? q.correct : ['__wrong__'];
    });
    engine.gradeExam(exam, answers);
    assert.equal(engine.reviewCount(), 2);
  });
});

describe('the trainer engine uses the large pool by default', () => {
  test('an exam can be built from the default pool', () => {
    const engine = new TrainerEngine({ store: new TrainerStore(memoryStorage()) });
    const exam = engine.buildExam({ count: 40 });
    assert.equal(exam.length, 40);
    assert.equal(new Set(exam.map((q) => q.id)).size, 40);
  });
});
