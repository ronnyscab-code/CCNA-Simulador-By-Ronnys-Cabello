/**
 * Achievements.js
 *
 * Lightweight gamification: named milestones evaluated against the trainer's
 * aggregate stats. Each achievement has an `unlocked(stats)` predicate; the
 * `TrainerEngine` checks them after every answer/exam and records newly
 * unlocked ones in the store.
 *
 * DOM-free.
 */

/**
 * @typedef {object} Achievement
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {string} icon - an emoji badge
 * @property {(stats: object) => boolean} unlocked
 */

/** @type {Achievement[]} */
export const ACHIEVEMENTS = Object.freeze([
  {
    id: 'first-steps',
    title: 'First Steps',
    description: 'Answer your first question.',
    icon: '🎯',
    unlocked: (s) => s.attempts >= 1,
  },
  {
    id: 'warmed-up',
    title: 'Warmed Up',
    description: 'Answer 25 questions.',
    icon: '🔥',
    unlocked: (s) => s.attempts >= 25,
  },
  {
    id: 'streak-10',
    title: 'On a Roll',
    description: 'Get 10 correct answers in a row.',
    icon: '⚡',
    unlocked: (s) => s.bestStreak >= 10,
  },
  {
    id: 'sharpshooter',
    title: 'Sharpshooter',
    description: 'Reach 80% overall accuracy (after 20+ attempts).',
    icon: '🎓',
    unlocked: (s) => s.attempts >= 20 && s.correct / s.attempts >= 0.8,
  },
  {
    id: 'well-rounded',
    title: 'Well Rounded',
    description: 'Answer at least one question in every domain.',
    icon: '🧭',
    unlocked: (s) => Object.keys(s.byDomain).length >= 6,
  },
  {
    id: 'exam-ready',
    title: 'Exam Ready',
    description: 'Score 85% or higher on an exam.',
    icon: '🏅',
    unlocked: (s) => s.bestExamPercent >= 85,
  },
]);

/**
 * Returns the ids of achievements whose condition is met by `stats`.
 * @param {object} stats
 * @returns {string[]}
 */
export function earnedAchievementIds(stats) {
  return ACHIEVEMENTS.filter((a) => a.unlocked(stats)).map((a) => a.id);
}

/**
 * @param {string} id
 * @returns {Achievement|undefined}
 */
export function getAchievement(id) {
  return ACHIEVEMENTS.find((a) => a.id === id);
}
