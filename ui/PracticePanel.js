/**
 * PracticePanel.js
 *
 * The "Práctica" modal: a browsable bank of original hands-on questions.
 * Each question can be opened as a live lab in the emulator — you load its
 * topology, type commands and run pings to figure out the answer, then check
 * your network and reveal the correct choice with an explanation.
 *
 * It reuses `ScenarioEngine` to load a question's topology into the live
 * canvas (exactly like the Labs), so "Abrir en el emulador" drops you into a
 * ready-to-configure network. Presentation only.
 */

import { ScenarioEngine } from '../scenarios/ScenarioEngine.js';
import { allPracticeQuestions } from '../labs/practiceQuestions.js';

export class PracticePanel {
  /**
   * @param {object} deps
   * @param {import('../topology/Topology.js').Topology} deps.topology
   * @param {import('../engine/PacketEngine.js').PacketEngine} deps.engine
   * @param {import('./HistoryManager.js').HistoryManager} [deps.history]
   */
  constructor({ topology, engine, history = null }) {
    this.overlay = document.getElementById('practice-overlay');
    this.history = history;
    this.questions = allPracticeQuestions();
    this.scenarioEngine = new ScenarioEngine({ topology, engine });

    this.activeId = null;
    this.domain = 'Todas';
    this.query = '';
    this.selected = [];
    this.revealed = false;
    this.lastResult = null;

    document
      .querySelector('[data-action="open-practice"]')
      ?.addEventListener('click', () => this.open());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.overlay.hidden) this.close();
    });
  }

  open() {
    this.overlay.hidden = false;
    this.activeId = null;
    this.render();
  }

  close() {
    this.overlay.hidden = true;
  }

  /**
   * @returns {string[]} the distinct domains, plus a "Todas" pseudo-filter.
   */
  _domains() {
    return ['Todas', ...new Set(this.questions.map((q) => q.domain))];
  }

  /**
   * @returns {object[]} questions matching the current domain + search.
   */
  _filtered() {
    const q = this.query.trim().toLowerCase();
    return this.questions.filter((item) => {
      if (this.domain !== 'Todas' && item.domain !== this.domain) return false;
      if (q && !item.prompt.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  render() {
    if (this.overlay.hidden) return;
    this.overlay.innerHTML = '';
    const modal = el('div', 'labs-modal');

    const header = el('div', 'labs-header');
    const title = el('h2', 'labs-title');
    title.textContent = this.activeId ? 'Pregunta práctica' : 'Práctica en el emulador';
    const close = el('button', 'btn icon-btn');
    close.textContent = '✕';
    close.addEventListener('click', () => this.close());
    header.append(title, close);
    modal.appendChild(header);

    modal.appendChild(this.activeId ? this._renderDetail() : this._renderList());
    this.overlay.appendChild(modal);
  }

  // --- List -------------------------------------------------------------

  _renderList() {
    const wrap = el('div', 'labs-list');

    const intro = el('p', 'labs-intro');
    intro.textContent =
      'Elige una pregunta y ábrela en el emulador: prueba comandos, haz ping y descubre la respuesta correcta por ti mismo.';
    wrap.appendChild(intro);

    // Domain filter chips.
    const chips = el('div', 'practice-filters');
    for (const d of this._domains()) {
      const chip = el('button', `practice-chip${d === this.domain ? ' active' : ''}`);
      chip.type = 'button';
      chip.textContent = d;
      chip.addEventListener('click', () => {
        this.domain = d;
        this.render();
      });
      chips.appendChild(chip);
    }
    wrap.appendChild(chips);

    // Search.
    const search = el('input', 'prop-input practice-search');
    search.type = 'search';
    search.placeholder = 'Buscar pregunta…';
    search.value = this.query;
    search.addEventListener('input', () => {
      this.query = search.value;
      this._refreshCards(wrap);
    });
    wrap.appendChild(search);

    const cards = el('div', 'practice-cards');
    wrap.appendChild(cards);
    this._cardsContainer = cards;
    this._fillCards();

    return wrap;
  }

  _refreshCards() {
    if (this._cardsContainer) this._fillCards();
  }

  _fillCards() {
    const cards = this._cardsContainer;
    cards.innerHTML = '';
    const items = this._filtered();
    if (items.length === 0) {
      cards.appendChild(msg('No hay preguntas para ese filtro.'));
      return;
    }
    for (const q of items) {
      const card = el('button', 'labs-card');
      card.type = 'button';
      const badge = el('span', `labs-badge labs-${q.difficulty.toLowerCase()}`);
      badge.textContent = q.domain;
      const name = el('span', 'labs-card-title');
      name.textContent = q.prompt;
      card.append(badge, name);
      card.addEventListener('click', () => {
        this.activeId = q.id;
        this.selected = [];
        this.revealed = false;
        this.lastResult = null;
        this.render();
      });
      cards.appendChild(card);
    }
  }

  // --- Detail -----------------------------------------------------------

  _renderDetail() {
    const q = this.questions.find((x) => x.id === this.activeId);
    const detail = el('div', 'labs-detail');

    const back = el('button', 'btn labs-back');
    back.textContent = '← Todas las preguntas';
    back.addEventListener('click', () => {
      this.activeId = null;
      this.render();
    });
    detail.appendChild(back);

    const chip = el('span', 'prop-device-type');
    chip.textContent = `${q.domain} · ${q.difficulty}`;
    detail.appendChild(chip);

    const prompt = el('p', 'trainer-prompt');
    prompt.textContent = q.prompt;
    detail.appendChild(prompt);

    // Open in the emulator.
    const openBtn = el('button', 'btn labs-check practice-open');
    openBtn.textContent = '▶  Abrir en el emulador';
    openBtn.addEventListener('click', () => {
      this.scenarioEngine.load(q);
      if (this.history) this.history.clear();
      this.close();
      this._toast(`Lab cargado. ${q.labHint}`);
    });
    detail.appendChild(openBtn);

    const hint = el('p', 'labs-tip');
    hint.innerHTML = `<strong>Pista:</strong> ${escapeHtml(q.labHint)}`;
    detail.appendChild(hint);

    // Choices.
    const choicesTitle = el('div', 'prop-group-title');
    choicesTitle.textContent = 'Tu respuesta';
    detail.appendChild(choicesTitle);
    detail.appendChild(this._renderChoices(q));

    // Actions.
    const actions = el('div', 'labs-actions');
    if (q.checks && q.checks.length > 0) {
      const checkNet = el('button', 'btn');
      checkNet.textContent = 'Comprobar red';
      checkNet.addEventListener('click', () => {
        this.lastResult = this.scenarioEngine.evaluate();
        this.render();
      });
      actions.appendChild(checkNet);
    }
    const revealBtn = el('button', 'btn labs-check');
    revealBtn.textContent = this.revealed ? 'Ocultar respuesta' : 'Revelar respuesta';
    revealBtn.addEventListener('click', () => {
      this.revealed = !this.revealed;
      this.render();
    });
    actions.appendChild(revealBtn);
    detail.appendChild(actions);

    if (this.lastResult) detail.appendChild(this._renderNetResult(this.lastResult));
    if (this.revealed) detail.appendChild(this._renderReveal(q));

    return detail;
  }

  _renderChoices(q) {
    const list = el('div', 'trainer-choices');
    for (const choice of q.choices) {
      const isSel = this.selected.includes(choice.id);
      const isCorrect = q.correct.includes(choice.id);
      let cls = 'trainer-choice';
      if (isSel) cls += ' selected';
      if (this.revealed && isCorrect) cls += ' correct';
      if (this.revealed && isSel && !isCorrect) cls += ' wrong';
      const row = el('button', cls);
      row.type = 'button';
      row.disabled = this.revealed;
      row.innerHTML = `<span class="trainer-choice-key">${isSel ? '●' : '○'}</span><span>${escapeHtml(choice.text)}</span>`;
      row.addEventListener('click', () => {
        this.selected = [choice.id];
        this.render();
      });
      list.appendChild(row);
    }
    return list;
  }

  _renderNetResult(result) {
    const wrap = el('div', 'labs-results');
    const score = el('div', `labs-score${result.passedAll ? ' pass' : ''}`);
    score.textContent = result.passedAll
      ? '¡Red correcta! Todos los objetivos cumplidos.'
      : `Objetivos: ${result.score}/${result.maxScore}`;
    wrap.appendChild(score);
    for (const r of result.results) {
      const row = el('div', `labs-check-row ${r.passed ? 'ok' : 'fail'}`);
      row.innerHTML = `<span class="labs-check-icon">${r.passed ? '✔' : '✘'}</span><span class="labs-check-text">${escapeHtml(r.detail ? `${r.description} — ${r.detail}` : r.description)}</span>`;
      wrap.appendChild(row);
    }
    return wrap;
  }

  _renderReveal(q) {
    const wrap = el('div', 'labs-results');
    const correctText = q.correct
      .map((id) => q.choices.find((c) => c.id === id)?.text)
      .filter(Boolean)
      .join('; ');
    const chosenCorrect = this.selected.length === 1 && q.correct.includes(this.selected[0]);
    const verdict = el('div', `labs-score${chosenCorrect ? ' pass' : ''}`);
    verdict.textContent = this.selected.length
      ? chosenCorrect
        ? '✔ ¡Correcto!'
        : '✘ No era esa.'
      : 'Respuesta correcta:';
    wrap.appendChild(verdict);

    const answer = el('div', 'labs-explanation');
    answer.innerHTML = `<strong>Respuesta:</strong> ${escapeHtml(correctText)}<br><br>${escapeHtml(q.explanation)}`;
    wrap.appendChild(answer);
    return wrap;
  }

  _toast(text) {
    const toast = el('div', 'trainer-toast practice-toast');
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  }
}

// --- helpers -------------------------------------------------------------

function el(tag, className) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  return element;
}

function msg(text) {
  const p = el('p', 'labs-intro');
  p.textContent = text;
  return p;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
