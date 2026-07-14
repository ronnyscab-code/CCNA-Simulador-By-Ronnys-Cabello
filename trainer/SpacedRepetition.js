/**
 * SpacedRepetition.js
 *
 * An SM-2-style spaced-repetition scheduler. Given a card's current state and
 * how well the learner recalled it, it computes the next review interval, the
 * updated ease factor, and the next due date. This is what turns the question
 * bank into an efficient study tool: cards you know drift far into the future,
 * cards you miss come back tomorrow.
 *
 * Pure and DOM-free — `now` is injected so scheduling is deterministic in
 * tests.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_EASE = 1.3;
const DEFAULT_EASE = 2.5;

/**
 * Recall grades, mapped to SM-2's 0–5 quality scale. Anything below 3 is a
 * lapse and resets the interval.
 */
export const Grade = Object.freeze({
  AGAIN: 1, // total blank / wrong
  HARD: 3, // correct but with difficulty
  GOOD: 4, // correct
  EASY: 5, // correct and easy
});

/**
 * A fresh card state (never studied).
 * @returns {{ease: number, interval: number, repetitions: number, due: number, lapses: number}}
 */
export function newCardState() {
  return { ease: DEFAULT_EASE, interval: 0, repetitions: 0, due: 0, lapses: 0 };
}

/**
 * Applies a grade to a card, returning its new state (does not mutate input).
 * @param {object} state - previous card state (or undefined for a new card).
 * @param {number} grade - one of {@link Grade}.
 * @param {number} [now] - current time in ms (defaults to Date.now()).
 * @returns {object} the updated state.
 */
export function schedule(state, grade, now = Date.now()) {
  const prev = state ?? newCardState();
  const next = { ...prev };

  if (grade < 3) {
    // Lapse: relearn from a 1-day interval, keep (slightly reduced) ease.
    next.repetitions = 0;
    next.interval = 1;
    next.lapses = prev.lapses + 1;
  } else {
    if (prev.repetitions === 0) next.interval = 1;
    else if (prev.repetitions === 1) next.interval = 6;
    else next.interval = Math.round(prev.interval * prev.ease);
    next.repetitions = prev.repetitions + 1;
  }

  // SM-2 ease adjustment, clamped so cards never become impossibly frequent.
  const q = grade;
  next.ease = Math.max(MIN_EASE, prev.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  next.due = now + next.interval * DAY_MS;

  return next;
}

/**
 * Whether a card is due for review at `now`.
 * @param {object} state
 * @param {number} [now]
 * @returns {boolean}
 */
export function isDue(state, now = Date.now()) {
  if (!state || state.repetitions === 0) return true;
  return state.due <= now;
}
