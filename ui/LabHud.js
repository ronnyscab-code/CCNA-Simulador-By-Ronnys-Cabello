/**
 * LabHud.js
 *
 * A persistent "objective" card (heads-up display) pinned over the canvas
 * while a Práctica question or a troubleshooting Lab is loaded, so the task
 * stays visible the whole time the learner is configuring devices in the CLI.
 *
 * Presentation only: the panels feed it a config (chip, prompt, hint, action
 * buttons, live status) and it renders/refreshes the floating card. It can be
 * minimized to a small title pill or closed. DOM-only; no networking logic.
 */

export class LabHud {
  /**
   * @param {string} [titleFull] - Header text when expanded.
   * @param {string} [titleShort] - Header text when minimized.
   */
  constructor(titleFull = 'Objetivo', titleShort = 'Objetivo') {
    this.el = null;
    this.minimized = false;
    this.titleFull = titleFull;
    this.titleShort = titleShort;
    this.config = null;
  }

  /**
   * Shows (or refreshes) the card with a new configuration.
   * @param {object} config
   * @param {string} [config.chip] - Small badge text (domain/difficulty).
   * @param {string} config.prompt - The objective, always visible.
   * @param {string} [config.hintHtml] - Optional hint (trusted HTML).
   * @param {Array<{label: string, primary?: boolean, onClick: Function}>} [config.actions]
   * @param {{ok: boolean, text: string}|null} [config.status] - Live result line.
   * @param {Function} [config.onClose] - Called when the user closes the card.
   */
  show(config) {
    this.config = config;
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.className = 'practice-hud';
      document.body.appendChild(this.el);
    }
    this._render();
  }

  /**
   * Updates just the live status line (e.g. after "Comprobar red").
   * @param {{ok: boolean, text: string}|null} status
   */
  setStatus(status) {
    if (!this.config) return;
    this.config.status = status;
    this._render();
  }

  /** Removes the card from the screen. */
  hide() {
    if (this.el) {
      this.el.remove();
      this.el = null;
    }
    this.config = null;
  }

  /** @returns {boolean} whether the card is currently shown. */
  isOpen() {
    return !!this.el;
  }

  _render() {
    const c = this.config;
    if (!this.el || !c) return;
    this.el.innerHTML = '';
    this.el.classList.toggle('minimized', this.minimized);

    const head = h('div', 'practice-hud-head');
    const title = h('span', 'practice-hud-title');
    title.textContent = `🎯 ${this.minimized ? this.titleShort : this.titleFull}`;
    head.appendChild(title);

    const controls = h('div', 'practice-hud-controls');
    const minBtn = btn(this.minimized ? '▢' : '—', 'btn icon-btn', () => {
      this.minimized = !this.minimized;
      this._render();
    });
    minBtn.title = this.minimized ? 'Expandir' : 'Minimizar';
    const closeBtn = btn('✕', 'btn icon-btn', () => {
      const onClose = c.onClose;
      this.hide();
      if (onClose) onClose();
    });
    closeBtn.title = 'Cerrar';
    controls.append(minBtn, closeBtn);
    head.appendChild(controls);
    this.el.appendChild(head);

    if (this.minimized) return;

    if (c.chip) {
      const chip = h('span', 'practice-hud-chip');
      chip.textContent = c.chip;
      this.el.appendChild(chip);
    }

    const prompt = h('p', 'practice-hud-prompt');
    prompt.textContent = c.prompt;
    this.el.appendChild(prompt);

    if (c.hintHtml) {
      const hint = h('p', 'practice-hud-hint');
      hint.innerHTML = c.hintHtml;
      this.el.appendChild(hint);
    }

    if (c.actions && c.actions.length > 0) {
      const actions = h('div', 'practice-hud-actions');
      for (const a of c.actions) {
        actions.appendChild(btn(a.label, a.primary ? 'btn labs-check' : 'btn', a.onClick));
      }
      this.el.appendChild(actions);
    }

    if (c.status) {
      const status = h('div', `practice-hud-status ${c.status.ok ? 'ok' : 'fail'}`);
      status.textContent = c.status.text;
      this.el.appendChild(status);
    }
  }
}

/**
 * @param {string} tag
 * @param {string} [cls]
 * @returns {HTMLElement}
 */
function h(tag, cls) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  return el;
}

/**
 * @param {string} text
 * @param {string} cls
 * @param {Function} onClick
 * @returns {HTMLButtonElement}
 */
function btn(text, cls, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}
