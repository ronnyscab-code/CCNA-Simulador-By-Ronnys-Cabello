/**
 * ScenarioPanel.js
 *
 * The "Labs" modal: browse troubleshooting scenarios, load one (which swaps
 * the canvas to its broken topology), read the objective, then fix it with
 * the CLI/editor and hit **Check** to score it. Hints reveal one at a time;
 * the explanation appears once every check passes.
 *
 * Pure presentation on top of `scenarios/ScenarioEngine.js` — it holds no
 * networking logic of its own.
 */

import { ScenarioEngine } from '../scenarios/ScenarioEngine.js';
import { allScenarios } from '../labs/scenarios.js';
import { buildValidationReport } from '../scenarios/diagnostics.js';
import { LabHud } from './LabHud.js';

export class ScenarioPanel {
  /**
   * @param {object} deps
   * @param {import('../topology/Topology.js').Topology} deps.topology
   * @param {import('../engine/PacketEngine.js').PacketEngine} deps.engine
   * @param {import('./HistoryManager.js').HistoryManager} [deps.history]
   */
  constructor({ topology, engine, history = null }) {
    this.overlay = document.getElementById('labs-overlay');
    this.history = history;
    this.scenarios = allScenarios();
    this.scenarioEngine = new ScenarioEngine({ topology, engine });
    this.activeId = null;
    // Persistent objective card pinned over the canvas while a lab is loaded.
    this.hud = new LabHud('Objetivo del lab', 'Objetivo');

    document
      .querySelector('[data-action="open-labs"]')
      .addEventListener('click', () => this.open());
    this.overlay.addEventListener('click', (event) => {
      if (event.target === this.overlay) this.close();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.overlay.hidden) this.close();
    });
  }

  open() {
    this.overlay.hidden = false;
    this.render();
  }

  close() {
    this.overlay.hidden = true;
  }

  /**
   * Loads a scenario into the live topology and shows its detail view.
   * @param {string} scenarioId
   */
  loadScenario(scenarioId) {
    const scenario = this.scenarios.find((s) => s.id === scenarioId);
    if (!scenario) return;
    this.activeId = scenarioId;
    this.scenarioEngine.load(scenario);
    // A fresh scenario is a clean slate — nothing to undo into.
    if (this.history) this.history.clear();
    this.lastResult = null;
    this._showObjective(scenario);
    this.render();
  }

  /**
   * Shows the always-visible objective card for a loaded lab, so the task
   * stays on screen while the learner fixes the network in the CLI.
   * @param {object} scenario
   */
  _showObjective(scenario) {
    this.hud.show({
      chip: scenario.difficulty,
      prompt: scenario.objective,
      hintHtml: scenario.description ? escapeHtml(scenario.description) : null,
      actions: [
        {
          label: '▶ Validar',
          primary: true,
          onClick: () => {
            const { status, findings } = buildValidationReport(
              this.scenarioEngine.evaluate(),
              this.scenarioEngine.topology,
            );
            this.hud.setReport(status, findings);
          },
        },
        { label: 'Reiniciar', onClick: () => this.loadScenario(this.activeId) },
        {
          label: 'Ver detalle',
          onClick: () => {
            this.overlay.hidden = false;
            this.render();
          },
        },
      ],
    });
  }

  render() {
    if (this.overlay.hidden) return;
    this.overlay.innerHTML = '';
    const modal = el('div', 'labs-modal');

    const header = el('div', 'labs-header');
    const title = el('h2', 'labs-title');
    title.textContent = this.activeId ? 'Scenario' : 'Troubleshooting Labs';
    const close = el('button', 'btn icon-btn');
    close.textContent = '✕';
    close.addEventListener('click', () => this.close());
    header.append(title, close);
    modal.appendChild(header);

    modal.appendChild(this.activeId ? this._renderDetail() : this._renderList());
    this.overlay.appendChild(modal);
  }

  /**
   * @returns {HTMLElement}
   */
  _renderList() {
    const list = el('div', 'labs-list');
    const intro = el('p', 'labs-intro');
    intro.textContent =
      'Each lab loads a broken network. Fix it with the device CLIs, then press Check.';
    list.appendChild(intro);

    for (const scenario of this.scenarios) {
      const card = el('button', 'labs-card');
      card.type = 'button';
      const badge = el('span', `labs-badge labs-${scenario.difficulty.toLowerCase()}`);
      badge.textContent = scenario.difficulty;
      const name = el('span', 'labs-card-title');
      name.textContent = scenario.title;
      const desc = el('span', 'labs-card-desc');
      desc.textContent = scenario.objective;
      card.append(badge, name, desc);
      card.addEventListener('click', () => this.loadScenario(scenario.id));
      list.appendChild(card);
    }
    return list;
  }

  /**
   * @returns {HTMLElement}
   */
  _renderDetail() {
    const scenario = this.scenarios.find((s) => s.id === this.activeId);
    const detail = el('div', 'labs-detail');

    const back = el('button', 'btn labs-back');
    back.textContent = '← All labs';
    back.addEventListener('click', () => {
      this.activeId = null;
      this.render();
    });
    detail.appendChild(back);

    const name = el('h3', 'labs-detail-title');
    name.textContent = scenario.title;
    const objective = el('p', 'labs-objective');
    objective.innerHTML = `<strong>Objective:</strong> ${escapeHtml(scenario.objective)}`;
    const desc = el('p', 'labs-desc');
    desc.textContent = scenario.description;
    detail.append(name, objective, desc);

    const actions = el('div', 'labs-actions');
    const checkBtn = el('button', 'btn labs-check');
    checkBtn.textContent = 'Check';
    checkBtn.addEventListener('click', () => {
      this.lastResult = this.scenarioEngine.evaluate();
      this.render();
    });
    const hintBtn = el('button', 'btn');
    hintBtn.textContent = 'Hint';
    hintBtn.addEventListener('click', () => {
      this.scenarioEngine.revealHint();
      this.render();
    });
    const reloadBtn = el('button', 'btn');
    reloadBtn.textContent = 'Reset lab';
    reloadBtn.addEventListener('click', () => this.loadScenario(this.activeId));
    actions.append(checkBtn, hintBtn, reloadBtn);
    detail.appendChild(actions);

    detail.appendChild(this._renderHints());
    if (this.lastResult) detail.appendChild(this._renderResults(this.lastResult));

    const workBtn = el('button', 'btn labs-check practice-open');
    workBtn.textContent = '▶  Trabajar en el emulador';
    workBtn.addEventListener('click', () => this.close());
    detail.appendChild(workBtn);

    // Tip so the learner knows how to interact with the loaded topology.
    const tip = el('p', 'labs-tip');
    tip.textContent =
      'El objetivo queda fijo sobre el lienzo. Abre la CLI de un dispositivo (Enter) y usa Comprobar para validar.';
    detail.appendChild(tip);

    return detail;
  }

  /**
   * @returns {HTMLElement}
   */
  _renderHints() {
    const wrap = el('div', 'labs-hints');
    const hints = this.scenarioEngine.revealedHints();
    for (const [i, hint] of hints.entries()) {
      const line = el('div', 'labs-hint');
      line.textContent = `Hint ${i + 1}: ${hint}`;
      wrap.appendChild(line);
    }
    return wrap;
  }

  /**
   * @param {object} result
   * @returns {HTMLElement}
   */
  _renderResults(result) {
    const wrap = el('div', 'labs-results');

    const score = el('div', `labs-score${result.passedAll ? ' pass' : ''}`);
    score.textContent = result.passedAll
      ? `Solved!  Score ${result.score}/${result.maxScore}`
      : `Score ${result.score}/${result.maxScore}`;
    wrap.appendChild(score);

    for (const r of result.results) {
      const row = el('div', `labs-check-row ${r.passed ? 'ok' : 'fail'}`);
      const icon = el('span', 'labs-check-icon');
      icon.textContent = r.passed ? '✔' : '✘';
      const text = el('span', 'labs-check-text');
      text.textContent = r.detail ? `${r.description} — ${r.detail}` : r.description;
      row.append(icon, text);
      wrap.appendChild(row);
    }

    if (result.passedAll && result.explanation) {
      const expl = el('div', 'labs-explanation');
      expl.innerHTML = `<strong>Why this works:</strong> ${escapeHtml(result.explanation)}`;
      wrap.appendChild(expl);
    }
    return wrap;
  }
}

/**
 * @param {string} tag
 * @param {string} [className]
 * @returns {HTMLElement}
 */
function el(tag, className) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  return element;
}

/**
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
