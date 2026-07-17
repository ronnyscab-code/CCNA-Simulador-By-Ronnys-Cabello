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

import { TrainerEngine, DEFAULT_QUESTIONS } from '../trainer/TrainerEngine.js';
import { TrainerStore } from '../trainer/TrainerStore.js';
import { ACHIEVEMENTS, getAchievement } from '../trainer/Achievements.js';
import { parseQuestions } from '../trainer/parseQuestions.js';
import { extractPdfText } from '../trainer/pdfText.js';

export class TrainerPanel {
  constructor() {
    this.overlay = document.getElementById('trainer-overlay');
    this.store = new TrainerStore();
    this._rebuildEngine();
    this.view = 'home';
    this.session = null; // per-mode transient state
    this.importResult = null; // { added, errors } after an import attempt
    // Exam setup: chosen domain (null = all) and length.
    this.examConfig = { domain: null, count: 10 };
    this.examReviewWrongOnly = false;

    document
      .querySelector('[data-action="open-trainer"]')
      .addEventListener('click', () => this.open());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });
    document.addEventListener('keydown', (e) => this._handleKey(e));
  }

  /**
   * Builds (or rebuilds) the engine so its question pool includes the
   * built-in original bank plus any questions the user imported locally.
   */
  _rebuildEngine() {
    const imported = this.store.getImportedQuestions();
    this.engine = new TrainerEngine({
      store: this.store,
      questions: [...DEFAULT_QUESTIONS, ...imported],
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
      'exam-setup': () => this._renderExamSetup(body),
      exam: () => this._renderExam(body),
      'exam-results': () => this._renderExamResults(body),
      flashcards: () => this._renderFlashcards(body),
      stats: () => this._renderStats(body),
      import: () => this._renderImport(body),
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
      ['study', '📚', 'Estudio', 'Repaso espaciado de las preguntas pendientes.'],
      ['exam-setup', '📝', 'Examen', 'Test puntuado: elige tema y número de preguntas.'],
      ['flashcards', '🃏', 'Flashcards', 'Voltea para revelar — autoevaluación rápida.'],
      ['stats', '📊', 'Progreso', 'Precisión, rachas y logros.'],
    ];
    for (const [view, icon, name, desc] of modes) {
      const card = el('button', 'trainer-mode-card');
      card.type = 'button';
      card.innerHTML = `<span class="trainer-mode-icon">${icon}</span><span class="trainer-mode-name">${name}</span><span class="trainer-mode-desc">${desc}</span>`;
      card.addEventListener('click', () => {
        if (view === 'exam-setup') {
          this.view = 'exam-setup';
          this.render();
        } else {
          this._enter(view);
        }
      });
      grid.appendChild(card);
    }
    body.appendChild(grid);

    const imported = this.store.getImportedQuestions().length;
    const importBtn = el('button', 'btn trainer-import-btn');
    importBtn.type = 'button';
    importBtn.textContent = imported
      ? `📥 Mis preguntas (${imported} importadas)`
      : '📥 Importar mis preguntas';
    importBtn.addEventListener('click', () => {
      this.view = 'import';
      this.importResult = null;
      this.render();
    });
    body.appendChild(importBtn);

    const stats = this.engine.getStats();
    const summary = el('p', 'labs-tip');
    summary.textContent = `${stats.attempts} answered · ${stats.accuracy}% accuracy · best streak ${stats.bestStreak}`;
    body.appendChild(summary);
  }

  // --- Import (private, local) ------------------------------------------

  /**
   * Reads a PDF entirely in the browser, extracts its text, and drops it into
   * the import textarea. Nothing leaves the device.
   * @param {File} f
   * @param {HTMLTextAreaElement} textarea
   * @param {HTMLElement} status
   */
  async _extractPdfInto(f, textarea, status) {
    status.hidden = false;
    status.textContent = 'Extrayendo texto del PDF… (se procesa en tu navegador)';
    try {
      const buffer = await f.arrayBuffer();
      const text = await extractPdfText(buffer);
      textarea.value = text;
      status.textContent = text.trim()
        ? 'Texto extraído. Revísalo/edítalo abajo y pulsa "Añadir preguntas".'
        : 'No se pudo extraer texto (¿PDF escaneado o cifrado?). Copia y pega el texto manualmente.';
    } catch {
      status.textContent = 'No se pudo leer el PDF. Copia y pega el texto manualmente.';
    }
  }

  _renderImport(body) {
    this._backButton(body);

    const intro = el('p', 'labs-intro');
    intro.innerHTML =
      'Importa <strong>tus propias</strong> preguntas. Se guardan solo en este navegador (no se suben a ningún sitio) y se suman a Estudio, Examen y Flashcards.';
    body.appendChild(intro);

    const count = this.store.getImportedQuestions().length;
    if (count > 0) {
      const have = el('p', 'labs-tip');
      have.textContent = `Tienes ${count} preguntas importadas.`;
      body.appendChild(have);
    }

    // Format help.
    const help = el('div', 'labs-explanation');
    help.innerHTML =
      '<strong>Formato de texto</strong> (una pregunta por bloque, separadas por una línea en blanco o <code>---</code>):<br>' +
      '<pre class="trainer-format">Q: ¿Qué comando asigna una IP a la interfaz?\nA) ip address 10.0.0.1 255.255.255.0\nB) ip 10.0.0.1\nC) address 10.0.0.1\nR: A\nE: (explicación opcional)</pre>' +
      'El enunciado también puede ir sin <code>Q:</code> (p. ej. «1. …») y la respuesta como <code>Answer: A</code>. ' +
      'Aceptas <strong>JSON</strong> (array con prompt, choices, correct, explanation) y <strong>PDF</strong> de texto ' +
      '(se extrae en tu navegador; revísalo antes de añadir).';
    body.appendChild(help);

    // File input.
    const fileField = el('div', 'prop-field');
    const fileLabel = el('label');
    fileLabel.textContent = 'Sube un archivo (.txt, .json o .pdf)';
    const file = el('input', 'prop-input');
    file.type = 'file';
    file.accept = '.txt,.json,.pdf,text/plain,application/json,application/pdf';
    const fileStatus = el('p', 'labs-tip');
    fileStatus.hidden = true;
    file.addEventListener('change', () => {
      const f = file.files?.[0];
      if (!f) return;
      const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
      if (isPdf) {
        this._extractPdfInto(f, textarea, fileStatus);
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          textarea.value = String(reader.result);
        };
        reader.readAsText(f);
      }
    });
    fileField.append(fileLabel, file, fileStatus);
    body.appendChild(fileField);

    // Paste area.
    const textarea = el('textarea', 'prop-input trainer-import-area');
    textarea.rows = 8;
    textarea.placeholder = 'Pega aquí tus preguntas (texto o JSON)…';
    body.appendChild(textarea);

    const actions = el('div', 'labs-actions');
    const addBtn = el('button', 'btn labs-check');
    addBtn.textContent = 'Añadir preguntas';
    addBtn.addEventListener('click', () => {
      const { questions, errors } = parseQuestions(textarea.value);
      if (questions.length > 0) {
        this.store.addImportedQuestions(questions);
        this._rebuildEngine();
      }
      this.importResult = { added: questions.length, errors };
      this.render();
    });
    actions.appendChild(addBtn);

    if (count > 0) {
      const clearBtn = el('button', 'btn');
      clearBtn.textContent = 'Borrar importadas';
      clearBtn.addEventListener('click', () => {
        this.store.clearImportedQuestions();
        this._rebuildEngine();
        this.importResult = { added: 0, errors: [], cleared: true };
        this.render();
      });
      actions.appendChild(clearBtn);
    }
    body.appendChild(actions);

    if (this.importResult) {
      const res = el('div', 'labs-results');
      const score = el('div', `labs-score${this.importResult.added > 0 ? ' pass' : ''}`);
      score.textContent = this.importResult.cleared
        ? 'Preguntas importadas borradas.'
        : `Añadidas ${this.importResult.added} preguntas.`;
      res.appendChild(score);
      for (const err of this.importResult.errors ?? []) {
        const row = el('div', 'labs-check-row fail');
        row.innerHTML = `<span class="labs-check-icon">✘</span><span class="labs-check-text">${escapeHtml(err)}</span>`;
        res.appendChild(row);
      }
      body.appendChild(res);
    }
  }

  _enter(view) {
    if (view === 'study') {
      const queue = this.engine.buildStudyQueue({ limit: 20 });
      this.session = { queue, index: 0, selected: [], answered: false };
    } else if (view === 'exam') {
      const questions = this.engine.buildExam({
        count: this.examConfig.count,
        domain: this.examConfig.domain,
      });
      this.session = { questions, index: 0, answers: {}, selected: [] };
      this.examReviewWrongOnly = false;
    } else if (view === 'flashcards') {
      const deck = this.engine.buildFlashcards();
      this.session = { deck, index: 0, revealed: false };
    }
    this.view = view;
    this.render();
  }

  // --- Exam setup (choose domain + length) ------------------------------

  _renderExamSetup(body) {
    this._backButton(body);

    const intro = el('p', 'labs-intro');
    intro.textContent = 'Configura tu examen: elige el tema y cuántas preguntas quieres.';
    body.appendChild(intro);

    // Domain filter.
    const domainTitle = el('div', 'prop-group-title');
    domainTitle.textContent = 'Tema';
    body.appendChild(domainTitle);

    const domains = this.engine.availableDomains();
    const totalCount = domains.reduce((sum, d) => sum + d.count, 0);
    const chips = el('div', 'practice-filters');
    const options = [{ domain: null, count: totalCount, label: 'Todos' }, ...domains];
    for (const opt of options) {
      const active = this.examConfig.domain === opt.domain;
      const chip = el('button', `practice-chip${active ? ' active' : ''}`);
      chip.type = 'button';
      chip.textContent = `${opt.label ?? opt.domain} (${opt.count})`;
      chip.addEventListener('click', () => {
        this.examConfig.domain = opt.domain;
        this.render();
      });
      chips.appendChild(chip);
    }
    body.appendChild(chips);

    // Length.
    const poolSize = this.examConfig.domain
      ? (domains.find((d) => d.domain === this.examConfig.domain)?.count ?? 0)
      : totalCount;
    const lenTitle = el('div', 'prop-group-title');
    lenTitle.textContent = 'Número de preguntas';
    body.appendChild(lenTitle);

    const lenChips = el('div', 'practice-filters');
    const lengths = [10, 20, 40, poolSize].filter((n, i, a) => n > 0 && a.indexOf(n) === i);
    for (const n of lengths) {
      const capped = Math.min(n, poolSize);
      const active = this.examConfig.count === capped;
      const chip = el('button', `practice-chip${active ? ' active' : ''}`);
      chip.type = 'button';
      chip.textContent = n >= poolSize ? `Todas (${poolSize})` : String(n);
      chip.addEventListener('click', () => {
        this.examConfig.count = capped;
        this.render();
      });
      lenChips.appendChild(chip);
    }
    body.appendChild(lenChips);

    const start = el('button', 'btn labs-check');
    start.textContent = `Comenzar examen (${Math.min(this.examConfig.count, poolSize)} preguntas)`;
    start.style.marginTop = 'var(--space-3)';
    start.addEventListener('click', () => {
      this.examConfig.count = Math.min(this.examConfig.count, poolSize) || 10;
      this._enter('exam');
    });
    body.appendChild(start);
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
    body.appendChild(progress(s.index + 1, s.queue.length, 'Estudio'));
    body.appendChild(keyHint());
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
    body.appendChild(progress(s.index + 1, s.questions.length, 'Examen'));
    body.appendChild(keyHint());

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
    const s = this.session;
    const score = el('div', `labs-score${r.passed ? ' pass' : ''}`);
    score.textContent = `${r.passed ? '¡Aprobado!' : 'Sigue estudiando'} — ${r.correct}/${r.total} (${r.percent}%)`;
    body.appendChild(score);

    // Review controls.
    const wrongCount = r.perQuestion.filter((res) => !res.correct).length;
    const controls = el('div', 'labs-actions');
    const toggle = el('button', 'btn');
    toggle.textContent = this.examReviewWrongOnly
      ? 'Ver todas las preguntas'
      : `Ver solo las falladas (${wrongCount})`;
    toggle.addEventListener('click', () => {
      this.examReviewWrongOnly = !this.examReviewWrongOnly;
      this.render();
    });
    if (wrongCount > 0) controls.appendChild(toggle);
    body.appendChild(controls);

    // Per-question review with your answer, the correct one, and why.
    const reviewTitle = el('div', 'prop-group-title');
    reviewTitle.textContent = 'Repaso';
    body.appendChild(reviewTitle);

    r.perQuestion.forEach((res, i) => {
      if (this.examReviewWrongOnly && res.correct) return;
      const q = this.engine.getQuestion(res.id);
      const item = el('div', `trainer-review ${res.correct ? 'ok' : 'fail'}`);

      const head = el('div', 'trainer-review-head');
      head.innerHTML = `<span class="labs-check-icon">${res.correct ? '✔' : '✘'}</span><span>Q${i + 1}. ${escapeHtml(q.prompt)}</span>`;
      item.appendChild(head);

      const yourIds = s.answers[res.id] ?? [];
      const yourText = yourIds.length
        ? yourIds
            .map((id) => q.choices.find((c) => c.id === id)?.text)
            .filter(Boolean)
            .join('; ')
        : '(sin responder)';
      const correctText = q.correct
        .map((id) => q.choices.find((c) => c.id === id)?.text)
        .filter(Boolean)
        .join('; ');

      if (!res.correct) {
        const yours = el('div', 'trainer-review-line wrong');
        yours.innerHTML = `<strong>Tu respuesta:</strong> ${escapeHtml(yourText)}`;
        item.appendChild(yours);
      }
      const right = el('div', 'trainer-review-line right');
      right.innerHTML = `<strong>Correcta:</strong> ${escapeHtml(correctText)}`;
      item.appendChild(right);

      const expl = el('div', 'trainer-review-expl');
      expl.innerHTML = `${escapeHtml(q.explanation)}<br><span class="trainer-ref">${escapeHtml(q.reference)}</span>`;
      item.appendChild(expl);

      body.appendChild(item);
    });

    const actions = el('div', 'labs-actions');
    actions.style.marginTop = 'var(--space-3)';
    const again = el('button', 'btn labs-check');
    again.textContent = 'Otro examen';
    again.addEventListener('click', () => {
      this.view = 'exam-setup';
      this.render();
    });
    actions.appendChild(again);
    body.appendChild(actions);
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
      row.innerHTML = `<span class="trainer-choice-key">${choice.id.toUpperCase()}</span><span>${escapeHtml(choice.text)}</span>`;
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

  // --- Keyboard shortcuts ----------------------------------------------

  /**
   * Global key handling for the Trainer: Escape closes; in Study/Exam,
   * A–D or 1–4 pick a choice and Enter advances; in Flashcards, Enter flips
   * and → shows the next card. Ignored while typing in a field.
   * @param {KeyboardEvent} e
   */
  _handleKey(e) {
    if (this.overlay.hidden) return;
    if (e.key === 'Escape') {
      this.close();
      return;
    }
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const s = this.session;
    if (!s) return;

    if (this.view === 'exam') {
      const q = s.questions[s.index];
      if (!q) return;
      const idx = keyToChoiceIndex(e.key, q.choices.length);
      if (idx !== null) {
        e.preventDefault();
        s.answers[q.id] = toggleChoice(q, s.answers[q.id] ?? [], q.choices[idx].id);
        this.render();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (s.index === s.questions.length - 1) {
          s.result = this.engine.gradeExam(s.questions, s.answers);
          this._toast(s.result.newAchievements);
          this.view = 'exam-results';
        } else {
          s.index += 1;
        }
        this.render();
      }
      return;
    }

    if (this.view === 'study') {
      if (s.index >= s.queue.length) return;
      const q = s.queue[s.index];
      if (!q) return;
      if (!s.answered) {
        const idx = keyToChoiceIndex(e.key, q.choices.length);
        if (idx !== null) {
          e.preventDefault();
          s.selected = toggleChoice(q, s.selected, q.choices[idx].id);
          this.render();
          return;
        }
        if (e.key === 'Enter' && s.selected.length) {
          e.preventDefault();
          s.answered = true;
          const correct = this._isSelectionCorrect(q, s.selected);
          this._toast(this.engine.gradeStudyCard(q.id, correct).newAchievements);
          this.render();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        s.index += 1;
        s.selected = [];
        s.answered = false;
        this.render();
      }
      return;
    }

    if (this.view === 'flashcards') {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        s.revealed = !s.revealed;
        this.render();
      } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'n') {
        e.preventDefault();
        s.index = (s.index + 1) % s.deck.length;
        s.revealed = false;
        this.render();
      }
    }
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

/**
 * Maps a keyboard key to a 0-based choice index: '1'..'9' or 'a'..'i'.
 * @param {string} key
 * @param {number} count - number of choices available.
 * @returns {number|null}
 */
function keyToChoiceIndex(key, count) {
  if (/^[1-9]$/.test(key)) {
    const i = Number(key) - 1;
    return i < count ? i : null;
  }
  const lower = key.toLowerCase();
  if (/^[a-i]$/.test(lower)) {
    const i = lower.charCodeAt(0) - 97;
    return i < count ? i : null;
  }
  return null;
}

/**
 * Returns the next selection after toggling a choice (single- vs multi-answer).
 * @param {{multi: boolean}} q
 * @param {string[]} selected
 * @param {string} id
 * @returns {string[]}
 */
function toggleChoice(q, selected, id) {
  if (!q.multi) return [id];
  return selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
}

function progress(current, total, label) {
  const p = el('div', 'trainer-progress');
  p.textContent = `${label} — ${current} / ${total}`;
  return p;
}

function keyHint() {
  const p = el('p', 'trainer-keyhint');
  p.textContent = 'Atajos: A–D o 1–4 para elegir · Enter para continuar';
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
