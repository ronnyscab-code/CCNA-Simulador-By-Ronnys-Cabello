/**
 * TrainerEngine.js
 *
 * Orchestrates the CCNA Trainer's study modes on top of the question bank,
 * the spaced-repetition scheduler, and the persistent store:
 *
 *   - Study mode  — a spaced-repetition queue: due cards first, then unseen
 *     ones. Grading a card reschedules it and updates stats.
 *   - Exam mode   — a fixed-length, timed-feel quiz scored at the end.
 *   - Flashcards  — a simple sequential deck for self-testing.
 *   - Stats       — aggregate accuracy, streaks, and unlocked achievements.
 *
 * DOM-free: the UI (`ui/TrainerPanel.js`) drives it and renders the results.
 */

import { QUESTIONS } from './questions.js';
import { GENERATED_QUESTIONS } from './generatedQuestions.js';
import { CCNP_QUESTIONS } from './ccnpQuestions.js';
import { schedule, isDue, Grade } from './SpacedRepetition.js';
import { earnedAchievementIds } from './Achievements.js';

/**
 * The full built-in pool: CCNA (curated + generated) plus the CCNP bank. Each
 * question's `track` ('CCNA' by default, 'CCNP' for the enterprise bank) lets
 * the Trainer present the two certifications as separate study sections.
 */
export const DEFAULT_QUESTIONS = Object.freeze([
  ...QUESTIONS,
  ...GENERATED_QUESTIONS,
  ...CCNP_QUESTIONS,
]);

/**
 * @param {object} q
 * @returns {string} the question's track, defaulting to 'CCNA'.
 */
export function trackOf(q) {
  return q.track ?? 'CCNA';
}

/**
 * Compares a set of selected choice ids against the correct set (order
 * independent). Used for both single- and multi-answer questions.
 * @param {string[]} selected
 * @param {string[]} correct
 * @returns {boolean}
 */
export function isAnswerCorrect(selected, correct) {
  if (selected.length !== correct.length) return false;
  const a = [...selected].sort();
  const b = [...correct].sort();
  return a.every((v, i) => v === b[i]);
}

export class TrainerEngine {
  /**
   * @param {object} deps
   * @param {import('./TrainerStore.js').TrainerStore} deps.store
   * @param {object[]} [deps.questions] - defaults to the full bank.
   * @param {() => number} [deps.now]
   * @param {() => number} [deps.rng] - injectable RNG for deterministic tests.
   */
  constructor({ store, questions = DEFAULT_QUESTIONS, now = () => Date.now(), rng = Math.random }) {
    this.store = store;
    this.questions = questions;
    this.now = now;
    this.rng = rng;
  }

  /**
   * @param {string} id
   * @returns {object|undefined}
   */
  getQuestion(id) {
    return this.questions.find((q) => q.id === id);
  }

  // --- Study mode (spaced repetition) ---------------------------------

  /**
   * Builds the study queue: cards currently due (or never seen), ordered so
   * lapsed/overdue cards come first.
   * @param {{limit?: number, domain?: string|null}} [opts]
   * @returns {object[]}
   */
  buildStudyQueue({ limit = 20, domain = null, track = null } = {}) {
    const now = this.now();
    const pool = this._filter({ domain, track });
    const due = pool.filter((q) => isDue(this.store.getCardState(q.id), now));
    due.sort((a, b) => this.store.getCardState(a.id).due - this.store.getCardState(b.id).due);
    return due.slice(0, limit);
  }

  /**
   * Grades a study card: reschedules it and records the attempt.
   * @param {string} questionId
   * @param {boolean} correct - whether the learner answered correctly.
   * @param {number} [grade] - optional explicit {@link Grade}; defaults to
   *   GOOD for correct and AGAIN for incorrect.
   * @returns {{state: object, newAchievements: string[]}}
   */
  gradeStudyCard(questionId, correct, grade = correct ? Grade.GOOD : Grade.AGAIN) {
    const question = this.getQuestion(questionId);
    const prev = this.store.getCardState(questionId);
    const next = schedule(prev, grade, this.now());
    this.store.setCardState(questionId, next);
    this.store.recordAnswer(question?.domain ?? 'unknown', correct);
    this.store.recordQuestionResult(questionId, correct);
    return { state: next, newAchievements: this._syncAchievements() };
  }

  // --- Exam mode --------------------------------------------------------

  /**
   * Filters the pool by any combination of track / domain / difficulty.
   * `track` matches the question's `track` (default 'CCNA').
   * @param {{track?: string|null, domain?: string|null, difficulty?: string|null}} [opts]
   * @returns {object[]}
   */
  _filter({ track = null, domain = null, difficulty = null } = {}) {
    return this.questions.filter(
      (q) =>
        (!track || trackOf(q) === track) &&
        (!domain || q.domain === domain) &&
        (!difficulty || q.difficulty === difficulty),
    );
  }

  /**
   * @returns {string[]} the distinct study tracks present (e.g. CCNA, CCNP).
   */
  availableTracks() {
    return [...new Set(this.questions.map((q) => trackOf(q)))];
  }

  /**
   * Lists the domains present (optionally within a track) with their counts,
   * so the UI can offer a "study this domain" filter.
   * @param {string|null} [track]
   * @returns {Array<{domain: string, count: number}>}
   */
  availableDomains(track = null) {
    const counts = new Map();
    for (const q of this._filter({ track })) counts.set(q.domain, (counts.get(q.domain) ?? 0) + 1);
    return [...counts.entries()].map(([domain, count]) => ({ domain, count }));
  }

  /**
   * Lists the difficulty levels present (optionally within a track).
   * @param {string|null} [track]
   * @returns {Array<{difficulty: string, count: number}>}
   */
  availableDifficulties(track = null) {
    const counts = new Map();
    for (const q of this._filter({ track })) {
      counts.set(q.difficulty, (counts.get(q.difficulty) ?? 0) + 1);
    }
    return [...counts.entries()].map(([difficulty, count]) => ({ difficulty, count }));
  }

  /**
   * Assembles a randomized exam. Does not mutate any state.
   * @param {{count?: number, domain?: string|null, difficulty?: string|null, track?: string|null}} [opts]
   * @returns {object[]} the selected questions.
   */
  buildExam({ count = 10, domain = null, difficulty = null, track = null } = {}) {
    const shuffled = this._shuffle(this._filter({ track, domain, difficulty }));
    return shuffled.slice(0, Math.min(count, shuffled.length));
  }

  /**
   * Counts questions matching a track + domain + difficulty (for the setup UI).
   * @param {{domain?: string|null, difficulty?: string|null, track?: string|null}} [opts]
   * @returns {number}
   */
  countMatching({ domain = null, difficulty = null, track = null } = {}) {
    return this._filter({ track, domain, difficulty }).length;
  }

  // --- Review mode (your mistakes) -------------------------------------

  /**
   * The questions you last answered incorrectly (across Study and Exam), so
   * you can drill exactly your weak spots.
   * @param {{limit?: number}} [opts]
   * @returns {object[]}
   */
  buildReview({ limit = 30, track = null } = {}) {
    const missed = new Set(this.store.getMissedIds());
    return this._filter({ track })
      .filter((q) => missed.has(q.id))
      .slice(0, limit);
  }

  /**
   * @param {string|null} [track]
   * @returns {number} how many questions are currently in the review pool
   *   (optionally within a track).
   */
  reviewCount(track = null) {
    const missed = new Set(this.store.getMissedIds());
    return this._filter({ track }).filter((q) => missed.has(q.id)).length;
  }

  /**
   * Scores a completed exam.
   * @param {object[]} examQuestions
   * @param {Record<string, string[]>} answers - questionId → selected choice ids.
   * @returns {{
   *   total: number, correct: number, percent: number, passed: boolean,
   *   perQuestion: Array<{id: string, correct: boolean}>,
   *   newAchievements: string[]
   * }}
   */
  gradeExam(examQuestions, answers) {
    const perQuestion = examQuestions.map((q) => {
      const selected = answers[q.id] ?? [];
      const correct = isAnswerCorrect(selected, q.correct);
      this.store.recordAnswer(q.domain, correct);
      this.store.recordQuestionResult(q.id, correct);
      return { id: q.id, correct };
    });

    const correct = perQuestion.filter((r) => r.correct).length;
    const total = examQuestions.length;
    const percent = total > 0 ? (correct / total) * 100 : 0;
    // Cisco's real pass line varies; 85% is a sensible study target.
    const passed = percent >= 85;

    this.store.recordExam(percent);
    return {
      total,
      correct,
      percent: Math.round(percent),
      passed,
      perQuestion,
      newAchievements: this._syncAchievements(),
    };
  }

  // --- Flashcards -------------------------------------------------------

  /**
   * A shuffled flashcard deck (question + answer for self-testing).
   * @param {{domain?: string|null}} [opts]
   * @returns {object[]}
   */
  buildFlashcards({ domain = null, track = null } = {}) {
    return this._shuffle(this._filter({ domain, track }));
  }

  // --- Stats ------------------------------------------------------------

  /**
   * @returns {object} aggregate stats plus derived accuracy.
   */
  getStats() {
    const stats = this.store.getStats();
    stats.accuracy = stats.attempts > 0 ? Math.round((stats.correct / stats.attempts) * 100) : 0;
    return stats;
  }

  /**
   * @returns {string[]} unlocked achievement ids.
   */
  getUnlockedAchievements() {
    return this.store.getAchievements();
  }

  /**
   * Unlocks any newly earned achievements based on current stats.
   * @returns {string[]} ids unlocked by this call.
   */
  _syncAchievements() {
    const earned = earnedAchievementIds(this.store.getStats());
    const newly = [];
    for (const id of earned) {
      if (this.store.unlockAchievement(id)) newly.push(id);
    }
    return newly;
  }

  /**
   * Fisher–Yates shuffle using the injected RNG (non-mutating).
   * @param {object[]} array
   * @returns {object[]}
   */
  _shuffle(array) {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.rng() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
}
