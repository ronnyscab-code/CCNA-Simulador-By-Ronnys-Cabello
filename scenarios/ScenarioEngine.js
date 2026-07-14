/**
 * ScenarioEngine.js
 *
 * Drives troubleshooting scenarios: it loads a scenario's (deliberately
 * broken) topology into the live model, then, on demand, runs the scenario's
 * checks against the current state and produces a score. The learner fixes
 * the network through the CLI/editor between `load` and `evaluate`, exactly
 * as they would on real gear.
 *
 * DOM-free: the UI (`ui/ScenarioPanel.js`) calls into this and renders the
 * result. Evaluation reuses the application's `PacketEngine`, which already
 * recomputes STP/OSPF and reads the current config on every ping, so results
 * always reflect the latest changes.
 */

export class ScenarioEngine {
  /**
   * @param {object} deps
   * @param {import('../topology/Topology.js').Topology} deps.topology
   * @param {import('../engine/PacketEngine.js').PacketEngine} deps.engine
   */
  constructor({ topology, engine }) {
    this.topology = topology;
    this.engine = engine;
    /** @type {object|null} */
    this.current = null;
    /** @type {number} how many hints have been revealed */
    this.hintsRevealed = 0;
  }

  /**
   * Loads a scenario: replaces the live topology with the scenario's starting
   * (broken) state and resets hint progress. Dispatching happens through
   * `Topology.loadFromJSON`, so the canvas and CLI update automatically.
   * @param {object} scenario
   */
  load(scenario) {
    this.current = scenario;
    this.hintsRevealed = 0;
    const start = scenario.createTopology();
    this.topology.loadFromJSON(start.toJSON());
  }

  /**
   * Reveals the next hint, if any.
   * @returns {string|null} the newly revealed hint, or null if none remain.
   */
  revealHint() {
    if (!this.current) return null;
    const hints = this.current.hints ?? [];
    if (this.hintsRevealed >= hints.length) return null;
    const hint = hints[this.hintsRevealed];
    this.hintsRevealed += 1;
    return hint;
  }

  /**
   * @returns {string[]} the hints revealed so far.
   */
  revealedHints() {
    return (this.current?.hints ?? []).slice(0, this.hintsRevealed);
  }

  /**
   * Runs every check in the current scenario against the live topology.
   * @returns {{
   *   results: Array<{description: string, points: number, passed: boolean, detail?: string}>,
   *   score: number,
   *   maxScore: number,
   *   passedAll: boolean,
   *   explanation: string|null
   * }}
   */
  evaluate() {
    if (!this.current) {
      return { results: [], score: 0, maxScore: 0, passedAll: false, explanation: null };
    }

    const ctx = { topology: this.topology, engine: this.engine };
    const results = this.current.checks.map((check) => {
      let outcome;
      try {
        outcome = check.run(ctx);
      } catch (error) {
        outcome = { passed: false, detail: `check error: ${error.message}` };
      }
      return {
        description: check.description,
        points: check.points,
        passed: Boolean(outcome.passed),
        detail: outcome.detail,
      };
    });

    const maxScore = results.reduce((sum, r) => sum + r.points, 0);
    const score = results.reduce((sum, r) => sum + (r.passed ? r.points : 0), 0);
    const passedAll = results.length > 0 && results.every((r) => r.passed);

    // A small hint penalty keeps scoring meaningful without being punitive.
    const penalty = Math.min(this.hintsRevealed, maxScore);
    const adjustedScore = passedAll ? Math.max(0, score - penalty) : score;

    return {
      results,
      score: adjustedScore,
      maxScore,
      passedAll,
      explanation: passedAll ? (this.current.explanation ?? null) : null,
    };
  }
}
