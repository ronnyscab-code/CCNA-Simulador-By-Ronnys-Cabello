import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { CCNP_QUESTIONS, CCNP_DOMAINS } from '../trainer/ccnpQuestions.js';
import { TrainerEngine, DEFAULT_QUESTIONS, trackOf } from '../trainer/TrainerEngine.js';
import { TrainerStore } from '../trainer/TrainerStore.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v) };
}

function engine() {
  return new TrainerEngine({ store: new TrainerStore(memoryStorage()) });
}

describe('CCNP question bank', () => {
  test('is a non-trivial, well-formed, CCNP-tagged bank', () => {
    assert.ok(CCNP_QUESTIONS.length >= 30, `expected >= 30, got ${CCNP_QUESTIONS.length}`);
    const domains = new Set(Object.values(CCNP_DOMAINS));
    const ids = new Set();
    for (const q of CCNP_QUESTIONS) {
      assert.ok(q.id && !ids.has(q.id), `duplicate/missing id: ${q.id}`);
      ids.add(q.id);
      assert.equal(q.track, 'CCNP', `not CCNP-tagged: ${q.id}`);
      assert.ok(domains.has(q.domain), `bad domain: ${q.id}`);
      assert.ok(q.choices.length >= 2, `too few choices: ${q.id}`);
      assert.equal(q.correct.length, 1, `single-answer expected: ${q.id}`);
      const choiceIds = new Set(q.choices.map((c) => c.id));
      assert.ok(choiceIds.has(q.correct[0]), `correct id not a choice: ${q.id}`);
      const texts = q.choices.map((c) => c.text);
      assert.equal(new Set(texts).size, texts.length, `duplicate choice text: ${q.id}`);
      assert.ok(q.explanation && q.reference, `missing explanation/reference: ${q.id}`);
    }
  });

  test('CCNP questions are included in the default pool with unique global ids', () => {
    const ccnp = DEFAULT_QUESTIONS.filter((q) => trackOf(q) === 'CCNP');
    assert.equal(ccnp.length, CCNP_QUESTIONS.length);
    const ids = DEFAULT_QUESTIONS.map((q) => q.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe('track filtering in the engine', () => {
  test('both CCNA and CCNP tracks are available', () => {
    const tracks = engine().availableTracks();
    assert.ok(tracks.includes('CCNA'));
    assert.ok(tracks.includes('CCNP'));
  });

  test('a CCNP exam only draws CCNP questions', () => {
    const exam = engine().buildExam({ count: 15, track: 'CCNP' });
    assert.ok(exam.length > 0);
    assert.ok(exam.every((q) => trackOf(q) === 'CCNP'));
  });

  test('CCNP offers its own advanced domains', () => {
    const e = engine();
    const ccnpDomains = e.availableDomains('CCNP').map((d) => d.domain);
    assert.ok(ccnpDomains.length >= 5);
    // CCNP-specific domains not present in CCNA.
    assert.ok(ccnpDomains.includes('Advanced Routing'));
    assert.ok(ccnpDomains.includes('Enterprise Switching'));
  });

  test('countMatching respects the track', () => {
    const e = engine();
    assert.equal(
      e.countMatching({ track: 'CCNP' }),
      DEFAULT_QUESTIONS.filter((q) => trackOf(q) === 'CCNP').length,
    );
  });

  test('review pool is scoped by track', () => {
    const e = engine();
    const ccnp = e.buildExam({ count: 1, track: 'CCNP' })[0];
    e.gradeStudyCard(ccnp.id, false); // miss a CCNP question
    assert.equal(e.reviewCount('CCNP'), 1);
    assert.equal(e.reviewCount('CCNA'), 0);
  });
});
