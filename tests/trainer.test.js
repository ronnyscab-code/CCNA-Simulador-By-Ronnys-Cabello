import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { QUESTIONS, DOMAINS, domainsInBank } from '../trainer/questions.js';
import { schedule, isDue, newCardState, Grade } from '../trainer/SpacedRepetition.js';
import { TrainerStore } from '../trainer/TrainerStore.js';
import { TrainerEngine, isAnswerCorrect } from '../trainer/TrainerEngine.js';
import { earnedAchievementIds } from '../trainer/Achievements.js';

/** An in-memory KV store for tests (no localStorage in node). */
function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
  };
}

function freshEngine(rng = () => 0.5) {
  return new TrainerEngine({ store: new TrainerStore(memoryStorage()), rng });
}

describe('question bank integrity', () => {
  test('every question is well-formed and original-schema compliant', () => {
    const ids = new Set();
    for (const q of QUESTIONS) {
      assert.ok(q.id && !ids.has(q.id), `duplicate/missing id: ${q.id}`);
      ids.add(q.id);
      assert.ok(Object.values(DOMAINS).includes(q.domain), `bad domain: ${q.domain}`);
      assert.ok(q.choices.length >= 2, `too few choices: ${q.id}`);
      assert.ok(q.correct.length >= 1, `no correct answer: ${q.id}`);
      const choiceIds = new Set(q.choices.map((c) => c.id));
      assert.ok(
        q.correct.every((c) => choiceIds.has(c)),
        `correct id not a choice: ${q.id}`,
      );
      if (!q.multi) assert.equal(q.correct.length, 1, `single-answer q with >1 correct: ${q.id}`);
      assert.ok(q.explanation && q.reference, `missing explanation/reference: ${q.id}`);
    }
  });

  test('all six blueprint domains are represented', () => {
    assert.equal(domainsInBank().length, 6);
  });
});

describe('spaced repetition (SM-2)', () => {
  test('successive good grades grow the interval', () => {
    let s = newCardState();
    s = schedule(s, Grade.GOOD, 0);
    assert.equal(s.interval, 1);
    s = schedule(s, Grade.GOOD, s.due);
    assert.equal(s.interval, 6);
    const before = s.interval;
    s = schedule(s, Grade.GOOD, s.due);
    assert.ok(s.interval > before);
  });

  test('a lapse (Again) resets repetitions and shortens the interval', () => {
    let s = newCardState();
    s = schedule(s, Grade.GOOD, 0);
    s = schedule(s, Grade.GOOD, s.due);
    const lapsed = schedule(s, Grade.AGAIN, s.due);
    assert.equal(lapsed.repetitions, 0);
    assert.equal(lapsed.interval, 1);
    assert.equal(lapsed.lapses, 1);
  });

  test('ease never drops below the SM-2 floor', () => {
    let s = newCardState();
    for (let i = 0; i < 10; i += 1) s = schedule(s, Grade.AGAIN, s.due);
    assert.ok(s.ease >= 1.3);
  });

  test('a freshly-seen card is due, a just-reviewed one is not', () => {
    const s = schedule(newCardState(), Grade.GOOD, 0);
    assert.equal(isDue(s, 0), false);
    assert.equal(isDue(s, s.due + 1), true);
    assert.equal(isDue(newCardState(), 0), true);
  });
});

describe('answer grading', () => {
  test('isAnswerCorrect is order-independent and exact', () => {
    assert.equal(isAnswerCorrect(['a'], ['a']), true);
    assert.equal(isAnswerCorrect(['a', 'c'], ['c', 'a']), true);
    assert.equal(isAnswerCorrect(['a'], ['a', 'c']), false);
    assert.equal(isAnswerCorrect(['b'], ['a']), false);
  });
});

describe('TrainerEngine', () => {
  test('study queue starts full (all cards due) and shrinks as cards are scheduled', () => {
    const engine = freshEngine();
    const now = () => 0;
    engine.now = now;
    const all = engine.buildStudyQueue({ limit: 999 });
    assert.equal(all.length, QUESTIONS.length);
    engine.gradeStudyCard(all[0].id, true, Grade.EASY);
    const after = engine.buildStudyQueue({ limit: 999 });
    assert.equal(after.length, QUESTIONS.length - 1);
  });

  test('exam scoring computes percent and pass/fail', () => {
    const engine = freshEngine();
    const exam = engine.buildExam({ count: 4 });
    const answers = {};
    exam.forEach((q, i) => {
      answers[q.id] = i < 3 ? q.correct : ['__wrong__'];
    });
    const result = engine.gradeExam(exam, answers);
    assert.equal(result.total, 4);
    assert.equal(result.correct, 3);
    assert.equal(result.percent, 75);
    assert.equal(result.passed, false);
  });

  test('a perfect exam passes and is recorded as a best score', () => {
    const engine = freshEngine();
    const exam = engine.buildExam({ count: 5 });
    const answers = Object.fromEntries(exam.map((q) => [q.id, q.correct]));
    const result = engine.gradeExam(exam, answers);
    assert.equal(result.percent, 100);
    assert.equal(result.passed, true);
    assert.equal(engine.getStats().bestExamPercent, 100);
  });

  test('answering unlocks the first-steps achievement', () => {
    const engine = freshEngine();
    const q = engine.buildStudyQueue({ limit: 1 })[0];
    const { newAchievements } = engine.gradeStudyCard(q.id, true);
    assert.ok(newAchievements.includes('first-steps'));
    assert.ok(engine.getUnlockedAchievements().includes('first-steps'));
  });

  test('stats accuracy reflects recorded answers', () => {
    const engine = freshEngine();
    const queue = engine.buildStudyQueue({ limit: 4 });
    engine.gradeStudyCard(queue[0].id, true);
    engine.gradeStudyCard(queue[1].id, true);
    engine.gradeStudyCard(queue[2].id, false);
    const stats = engine.getStats();
    assert.equal(stats.attempts, 3);
    assert.equal(stats.correct, 2);
    assert.equal(stats.accuracy, 67);
  });

  test('a domain filter restricts study and exam pools', () => {
    const engine = freshEngine();
    const domain = DOMAINS.SECURITY;
    const queue = engine.buildStudyQueue({ limit: 999, domain });
    assert.ok(queue.length > 0);
    assert.ok(queue.every((q) => q.domain === domain));
  });
});

describe('achievements', () => {
  test('well-rounded unlocks after covering all domains', () => {
    const store = new TrainerStore(memoryStorage());
    for (const domain of Object.values(DOMAINS)) store.recordAnswer(domain, true);
    assert.ok(earnedAchievementIds(store.getStats()).includes('well-rounded'));
  });

  test('sharpshooter requires 20+ attempts at 80%+', () => {
    const store = new TrainerStore(memoryStorage());
    for (let i = 0; i < 20; i += 1) store.recordAnswer('Network Fundamentals', i < 18);
    assert.ok(earnedAchievementIds(store.getStats()).includes('sharpshooter'));
  });
});
