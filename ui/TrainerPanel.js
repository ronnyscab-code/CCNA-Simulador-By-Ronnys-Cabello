/**
 * TrainerPanel.js
 *
 * The "Trainer" modal — the CCNA study companion. Four modes over the same
 * question bank and engine:
 *   - Study      — spaced-repetition queue, one question at a time with
 *                  immediate feedback (auto-graded into the SR scheduler).
 *   - Exam       — a fixed-length quiz scored at the end.
 *   - Flashcards — flip-to-reveal self testing.
 *   - Stats      — accuracy, streak, per-domain progress, achievements.
 *
 * Pure presentation on top of `trainer/TrainerEngine.js`; it holds no study
 * logic itself. Reuses the Labs modal styling plus a few trainer-specific
 * classes.
 */

import { TrainerEngine } from '../trainer/TrainerEngine.js';
import { TrainerStore } from '../trainer/TrainerStore.js';
import { ACHIEVEMENTS, getAchievement } from '../trainer/Achievements.js';

export class TrainerPanel {
  constructor() {
    this.overlay = document.getElementById('trainer-overlay');
    this.engine = new TrainerEngine({ store: new TrainerStore() });
    this.view = 'home';
    this.session = null; // per-mode transient state

    document
      .querySelector('[data-action="open-trainer"]')
      .addEventListener('click', () => this.open());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.overlay.hidden) this.close();
    });
  }

  open() {
    this.overlay.hidden = false;
    this.view = 'home';
    this.render();
  }

  close() {
    this.overlay.hidden = true;
  }

  render() {
    if (this.overlay.hidden) return;
    this.overlay.innerHTML = '';
    const modal = el('div', 'labs-modal trainer-modal');

    const header = el('div', 'labs-header');
    const title = el('h2', 'labs-title');
    title.textContent = 'CCNA Trainer';
    const close = el('button', 'btn icon-btn');
    close.textContent = '✕';
    close.addEventListener('click', () => this.close());
    header.append(title, close);
    modal.appendChild(header);

    const body = el('div', 'labs-detail');
    const views = {
      home: () => this._renderHome(body),
      study: () => this._renderStudy(body),
      exam: () => this._renderExam(body),
      'exam-results': () => this._renderExamResults(body),
      flashcards: () => this._renderFlashcards(body),
      stats: () => this._renderStats(body),
    };
    (views[this.view] ?? views.home)();
    modal.appendChild(body);
    this.overlay.appendChild(modal);
  }

  _backButton(body, label = '← Menu') {
    const back = el('button', 'btn labs-back');
    back.textContent = label;
    back.addEventListener('click', () => {
      this.view = 'home';
      this.session = null;
      this.render();
    });
    body.appendChild(back);
  }

  // --- Home -------------------------------------------------------------

  _renderHome(body) {
    const intro = el('p', 'labs-intro');
    intro.textContent =
      'Original questions written to the CCNA 200-301 blueprint. Study with spaced repetition, take a practice exam, or flip flashcards.';
    body.appendChild(intro);

    const grid = el('div', 'trainer-modes');
    const modes = [
      ['study', '📚', 'Study', 'Spaced-repetition review of due questions.'],
      ['exam', '📝', 'Exam', 'A 10-question scored practice test.'],
      ['flashcards', '🃏', 'Flashcards', 'Flip to reveal — quick self-testing.'],
      ['stats', '📊', 'Stats', 'Accuracy, streaks, and achievements.'],
    ];
    for (const [view, icon, name, desc] of modes) {
      const card = el('button', 'trainer-mode-card');
      card.type = 'button';
      card.innerHTML = `<span class="trainer-mode-icon">${icon}</span><span class="trainer-mode-name">${name}</span><span class="trainer-mode-desc">${desc}</span>`;
      card.addEventListener('click', () => this._enter(view));
      grid.appendChild(card);
    }
    body.appendChild(grid);

    const stats = this.engine.getStats();
    const summary = el('p', 'labs-tip');
    summary.textContent = `${stats.attempts} answered · ${stats.accuracy}% accuracy · best streak ${stats.bestStreak}`;
    body.appendChild(summary);
  }

  _enter(view) {
    if (view === 'study') {
      const queue = this.engine.buildStudyQueue({ limit: 20 });
      this.session = { queue, index: 0, selected: [], answered: false };
    } else if (view === 'exam') {
      const questions = this.engine.buildExam({ count: 10 });
      this.session = { questions, index: 0, answers: {}, selected: [] };
    } else if (view === 'flashcards') {
      const deck = this.engine.buildFlashcards();
      this.session = { deck, index: 0, revealed: false };
    }
    this.view = view;
    this.render();
  }

  // --- Study ------------------------------------------------------------

  _renderStudy(body) {
    this._backButton(body);
    const s = this.session;
    if (!s.queue.length) {
      body.appendChild(msg('All caught up! No cards are due right now. 🎉'));
      return;
    }
    if (s.index >= s.queue.length) {
      body.appendChild(msg(`Session complete — ${s.queue.length} cards reviewed.`));
      return;
    }

    const q = s.queue[s.index];
    body.appendChild(progress(s.index + 1, s.queue.length, 'Study'));
    this._renderQuestion(body, q, s, () => {
      const correct = this._isSelectionCorrect(q, s.selected);
      const { newAchievements } = this.engine.gradeStudyCard(q.id, correct);
      this._toast(newAchievements);
    });
  }

  // --- Exam -------------------------------------------------------------

  _renderExam(body) {
    this._backButton(body, '← Quit exam');
    const s = this.session;
    const q = s.questions[s.index];
    body.appendChild(progress(s.index + 1, s.questions.length, 'Exam'));

    const card = el('div', 'trainer-question');
    card.appendChild(domainTag(q));
    const prompt = el('p', 'trainer-prompt');
    prompt.textContent = q.prompt;
    card.appendChild(prompt);
    card.appendChild(
      this._choices(q, s.answers[q.id] ?? [], (selected) => {
        s.answers[q.id] = selected;
        this.render();
      }),
    );
    body.appendChild(card);

    const nav = el('div', 'labs-actions');
    if (s.index > 0) {
      const prev = el('button', 'btn');
      prev.textContent = 'Previous';
      prev.addEventListener('click', () => {
        s.index -= 1;
        this.render();
      });
      nav.appendChild(prev);
    }
    const isLast = s.index === s.questions.length - 1;
    const next = el('button', 'btn labs-check');
    next.textContent = isLast ? 'Submit exam' : 'Next';
    next.addEventListener('click', () => {
      if (isLast) {
        this.session.result = this.engine.gradeExam(s.questions, s.answers);
        this._toast(this.session.result.newAchievements);
        this.view = 'exam-results';
      } else {
        s.index += 1;
      }
      this.render();
    });
    nav.appendChild(next);
    body.appendChild(nav);
  }

  _renderExamResults(body) {
    this._backButton(body);
    const r = this.session.result;
    const score = el('div', `labs-score${r.passed ? ' pass' : ''}`);
    score.textContent = `${r.passed ? 'Passed' : 'Keep studying'} — ${r.correct}/${r.total} (${r.percent}%)`;
    body.appendChild(score);

    for (const [i, res] of r.perQuestion.entries()) {
      const q = this.engine.getQuestion(res.id);
      const row = el('div', `labs-check-row ${res.correct ? 'ok' : 'fail'}`);
      row.innerHTML = `<span class="labs-check-icon">${res.correct ? '✔' : '✘'}</span><span class="labs-check-text">Q${i + 1}. ${escapeHtml(q.prompt)}</span>`;
      body.appendChild(row);
    }
    const retake = el('button', 'btn labs-check');
    retake.textContent = 'New exam';
    retake.style.marginTop = 'var(--space-3)';
    retake.addEventListener('click', () => this._enter('exam'));
    body.appendChild(retake);
  }

  // --- Flashcards -------------------------------------------------------

  _renderFlashcards(body) {
    this._backButton(body);
    const s = this.session;
    const q = s.deck[s.index];
    body.appendChild(progress(s.index + 1, s.deck.length, 'Flashcards'));

    const card = el('div', 'trainer-question');
    card.appendChild(domainTag(q));
    const prompt = el('p', 'trainer-prompt');
    prompt.textContent = q.prompt;
    card.appendChild(prompt);

    if (s.revealed) {
      const answer = el('div', 'trainer-answer');
      const correctText = q.correct
        .map((id) => q.choices.find((c) => c.id === id)?.text)
        .filter(Boolean)
        .join('; ');
      answer.innerHTML = `<strong>Answer:</strong> ${escapeHtml(correctText)}<br><span class="trainer-expl">${escapeHtml(q.explanation)}</span>`;
      card.appendChild(answer);
    }
    body.appendChild(card);

    const nav = el('div', 'labs-actions');
    const flip = el('button', 'btn labs-check');
    flip.textContent = s.revealed ? 'Hide answer' : 'Show answer';
    flip.addEventListener('click', () => {
      s.revealed = !s.revealed;
      this.render();
    });
    const next = el('button', 'btn');
    next.textContent = 'Next card';
    next.addEventListener('click', () => {
      s.index = (s.index + 1) % s.deck.length;
      s.revealed = false;
      this.render();
    });
    nav.append(flip, next);
    body.appendChild(nav);
  }

  // --- Stats ------------------------------------------------------------

  _renderStats(body) {
    this._backButton(body);
    const stats = this.engine.getStats();

    const tiles = el('div', 'trainer-stat-tiles');
    tiles.appendChild(statTile(stats.attempts, 'Answered'));
    tiles.appendChild(statTile(`${stats.accuracy}%`, 'Accuracy'));
    tiles.appendChild(statTile(stats.bestStreak, 'Best streak'));
    tiles.appendChild(statTile(`${stats.bestExamPercent}%`, 'Best exam'));
    body.appendChild(tiles);

    const domainTitle = el('div', 'prop-group-title');
    domainTitle.textContent = 'By domain';
    body.appendChild(domainTitle);
    for (const [domain, d] of Object.entries(stats.byDomain)) {
      const pct = d.attempts ? Math.round((d.correct / d.attempts) * 100) : 0;
      const row = el('div', 'trainer-domain-row');
      row.innerHTML = `<span class="trainer-domain-name">${escapeHtml(domain)}</span><span class="trainer-domain-bar"><span style="width:${pct}%"></span></span><span class="trainer-domain-pct">${pct}%</span>`;
      body.appendChild(row);
    }

    const achTitle = el('div', 'prop-group-title');
    achTitle.textContent = 'Achievements';
    achTitle.style.marginTop = 'var(--space-3)';
    body.appendChild(achTitle);
    const unlocked = new Set(this.engine.getUnlockedAchievements());
    const grid = el('div', 'trainer-achievements');
    for (const a of ACHIEVEMENTS) {
      const has = unlocked.has(a.id);
      const badge = el('div', `trainer-achievement${has ? ' earned' : ''}`);
      badge.title = a.description;
      badge.innerHTML = `<span class="trainer-ach-icon">${a.icon}</span><span class="trainer-ach-name">${a.title}</span>`;
      grid.appendChild(badge);
    }
    body.appendChild(grid);
  }

  // --- Shared question rendering ---------------------------------------

  /**
   * Renders a question with answer submission + feedback (Study mode).
   */
  _renderQuestion(body, q, s, onGrade) {
    const card = el('div', 'trainer-question');
    card.appendChild(domainTag(q));
    const prompt = el('p', 'trainer-prompt');
    prompt.textContent = q.prompt;
    card.appendChild(prompt);

    card.appendChild(
      this._choices(
        q,
        s.selected,
        (selected) => {
          if (s.answered) return;
          s.selected = selected;
          this.render();
        },
        s.answered,
      ),
    );

    if (s.answered) {
      const correct = this._isSelectionCorrect(q, s.selected);
      const fb = el('div', `trainer-feedback ${correct ? 'ok' : 'fail'}`);
      fb.innerHTML = `<strong>${correct ? 'Correct' : 'Not quite'}.</strong> ${escapeHtml(q.explanation)}<br><span class="trainer-ref">${escapeHtml(q.reference)}</span>`;
      card.appendChild(fb);
    }
    body.appendChild(card);

    const actions = el('div', 'labs-actions');
    if (!s.answered) {
      const submit = el('button', 'btn labs-check');
      submit.textContent = 'Submit';
      submit.disabled = s.selected.length === 0;
      submit.addEventListener('click', () => {
        s.answered = true;
        onGrade();
        this.render();
      });
      actions.appendChild(submit);
    } else {
      const next = el('button', 'btn labs-check');
      next.textContent = s.index + 1 >= s.queue.length ? 'Finish' : 'Next';
      next.addEventListener('click', () => {
        s.index += 1;
        s.selected = [];
        s.answered = false;
        this.render();
      });
      actions.appendChild(next);
    }
    body.appendChild(actions);
  }

  /**
   * Renders the choice list (radio for single, checkbox for multi).
   */
  _choices(q, selected, onChange, locked = false) {
    const list = el('div', 'trainer-choices');
    for (const choice of q.choices) {
      const isSel = selected.includes(choice.id);
      const isCorrect = q.correct.includes(choice.id);
      let cls = 'trainer-choice';
      if (isSel) cls += ' selected';
      if (locked && isCorrect) cls += ' correct';
      if (locked && isSel && !isCorrect) cls += ' wrong';
      const row = el('button', cls);
      row.type = 'button';
      row.disabled = locked;
      row.innerHTML = `<span class="trainer-choice-key">${q.multi ? (isSel ? '☑' : '☐') : isSel ? '●' : '○'}</span><span>${escapeHtml(choice.text)}</span>`;
      row.addEventListener('click', () => {
        let next;
        if (q.multi) {
          next = isSel ? selected.filter((id) => id !== choice.id) : [...selected, choice.id];
        } else {
          next = [choice.id];
        }
        onChange(next);
      });
      list.appendChild(row);
    }
    if (q.multi) {
      const note = el('p', 'trainer-multi-note');
      note.textContent = 'Select all that apply.';
      list.appendChild(note);
    }
    return list;
  }

  _isSelectionCorrect(q, selected) {
    if (selected.length !== q.correct.length) return false;
    const a = [...selected].sort();
    const b = [...q.correct].sort();
    return a.every((v, i) => v === b[i]);
  }

  /**
   * Briefly flashes newly-earned achievements in the modal header area.
   * @param {string[]} ids
   */
  _toast(ids) {
    if (!ids || ids.length === 0) return;
    const names = ids.map((id) => getAchievement(id)?.title).filter(Boolean);
    const toast = el('div', 'trainer-toast');
    toast.textContent = `🏆 Achievement unlocked: ${names.join(', ')}`;
    this.overlay.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  }
}

// --- small DOM helpers ---------------------------------------------------

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

function progress(current, total, label) {
  const p = el('div', 'trainer-progress');
  p.textContent = `${label} — ${current} / ${total}`;
  return p;
}

function domainTag(q) {
  const tag = el('span', 'prop-device-type');
  tag.textContent = `${q.domain} · ${q.difficulty}`;
  return tag;
}

function statTile(value, label) {
  const tile = el('div', 'trainer-stat-tile');
  tile.innerHTML = `<span class="trainer-stat-value">${value}</span><span class="trainer-stat-label">${label}</span>`;
  return tile;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
