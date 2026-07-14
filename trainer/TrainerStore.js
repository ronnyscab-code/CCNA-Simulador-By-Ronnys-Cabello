/**
 * TrainerStore.js
 *
 * Persists CCNA Trainer progress: per-question spaced-repetition state and
 * aggregate statistics (attempts, correct answers, streak, per-domain
 * breakdown, best exam score). Storage is injected — it defaults to
 * `localStorage` in the browser but a plain in-memory object is passed in
 * tests, keeping this module runnable under `node:test`.
 */

import { newCardState } from './SpacedRepetition.js';

const STORAGE_KEY = 'openccna:trainer';

/**
 * A minimal storage interface: `getItem(key)` / `setItem(key, value)`. This
 * matches the Web Storage API, so `localStorage` works directly.
 * @typedef {{getItem: (k: string) => string|null, setItem: (k: string, v: string) => void}} KeyValueStore
 */

/**
 * @returns {object} the default, empty persisted shape.
 */
function emptyData() {
  return {
    cards: {}, // questionId -> SR state
    stats: {
      attempts: 0,
      correct: 0,
      streak: 0,
      bestStreak: 0,
      byDomain: {}, // domain -> { attempts, correct }
      bestExamPercent: 0,
      examsTaken: 0,
    },
    achievements: [], // unlocked achievement ids
  };
}

export class TrainerStore {
  /**
   * @param {KeyValueStore} [storage]
   */
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.data = this._load();
  }

  _load() {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY);
      if (!raw) return emptyData();
      return { ...emptyData(), ...JSON.parse(raw) };
    } catch {
      return emptyData();
    }
  }

  _save() {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      /* storage may be unavailable (private mode / tests) — ignore */
    }
  }

  /**
   * @param {string} questionId
   * @returns {object} the card's SR state (a fresh one if unseen).
   */
  getCardState(questionId) {
    return this.data.cards[questionId] ?? newCardState();
  }

  /**
   * @param {string} questionId
   * @param {object} state
   */
  setCardState(questionId, state) {
    this.data.cards[questionId] = state;
    this._save();
  }

  /**
   * Records the outcome of answering a question and updates streaks and
   * per-domain stats.
   * @param {string} domain
   * @param {boolean} correct
   */
  recordAnswer(domain, correct) {
    const s = this.data.stats;
    s.attempts += 1;
    if (correct) {
      s.correct += 1;
      s.streak += 1;
      s.bestStreak = Math.max(s.bestStreak, s.streak);
    } else {
      s.streak = 0;
    }
    const d = (s.byDomain[domain] ??= { attempts: 0, correct: 0 });
    d.attempts += 1;
    if (correct) d.correct += 1;
    this._save();
  }

  /**
   * Records a completed exam's score percentage.
   * @param {number} percent
   */
  recordExam(percent) {
    const s = this.data.stats;
    s.examsTaken += 1;
    s.bestExamPercent = Math.max(s.bestExamPercent, Math.round(percent));
    this._save();
  }

  /**
   * @returns {object} a copy of the aggregate stats.
   */
  getStats() {
    return structuredClone(this.data.stats);
  }

  /**
   * @returns {string[]} unlocked achievement ids.
   */
  getAchievements() {
    return [...this.data.achievements];
  }

  /**
   * @param {string} id
   * @returns {boolean} true if newly unlocked (false if already had it).
   */
  unlockAchievement(id) {
    if (this.data.achievements.includes(id)) return false;
    this.data.achievements.push(id);
    this._save();
    return true;
  }

  /**
   * Wipes all trainer progress.
   */
  reset() {
    this.data = emptyData();
    this._save();
  }
}
