/**
 * Terminal.js
 *
 * A draggable terminal window that hosts one `CliSession` for a device.
 * Pure presentation + input handling: it renders the session's prompt and
 * output, and forwards keystrokes to the session (Enter = execute, Tab =
 * complete, ↑/↓ = history). All command semantics live in `cli/`; this
 * widget knows nothing about IOS beyond "type a line, show the result".
 *
 * Multiple terminals can be open at once (one per device); `TerminalManager`
 * owns the collection. Each terminal reuses its device's `CliSession`, so
 * closing and reopening it preserves mode and history.
 */

export class Terminal {
  /**
   * @param {object} deps
   * @param {import('../cli/CliSession.js').CliSession} deps.session
   * @param {HTMLElement} deps.root - Container to append the window to.
   * @param {() => void} [deps.onClose]
   */
  constructor({ session, root, onClose = () => {} }) {
    this.session = session;
    this.root = root;
    this.onClose = onClose;
    this._build();
    this._print(
      `Connected to ${this.session.device.hostname}. Type "?" or press Tab for command help.\n`,
    );
    this._printPrompt();
    this.focus();
  }

  _build() {
    this.el = document.createElement('div');
    this.el.className = 'terminal-window';

    const header = document.createElement('div');
    header.className = 'terminal-header';
    const title = document.createElement('span');
    title.className = 'terminal-title';
    title.textContent = `CLI — ${this.session.device.hostname}`;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'terminal-close';
    closeBtn.textContent = '✕';
    closeBtn.title = 'Close';
    closeBtn.addEventListener('click', () => this.close());
    header.append(title, closeBtn);
    this.titleEl = title;

    this.output = document.createElement('pre');
    this.output.className = 'terminal-output';

    const inputRow = document.createElement('div');
    inputRow.className = 'terminal-input-row';
    this.promptEl = document.createElement('span');
    this.promptEl.className = 'terminal-prompt';
    this.input = document.createElement('input');
    this.input.className = 'terminal-input';
    this.input.type = 'text';
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;
    inputRow.append(this.promptEl, this.input);

    this.el.append(header, this.output, inputRow);
    this.root.appendChild(this.el);

    this.input.addEventListener('keydown', (event) => this._onKeyDown(event));
    // Keep focus in the input when clicking anywhere in the window.
    this.el.addEventListener('mousedown', (event) => {
      if (event.target !== this.input) {
        // Defer so text selection in the output still works on drag.
        setTimeout(() => this.focus(), 0);
      }
    });

    this._makeDraggable(header);
    this._updatePromptLabel();
  }

  focus() {
    this.input.focus();
  }

  close() {
    this.el.remove();
    this.onClose();
  }

  /**
   * @param {KeyboardEvent} event
   */
  _onKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      this._submit();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      this._complete();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prev = this.session.historyPrev();
      if (prev !== null) this.input.value = prev;
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.input.value = this.session.historyNext();
    } else if (event.key === '?') {
      // IOS context help: show completions without consuming the line.
      event.preventDefault();
      this._showHelp();
    }
  }

  _submit() {
    const line = this.input.value;
    this._print(`${this.session.prompt} ${line}\n`);
    const output = this.session.execute(line);
    if (output) this._print(`${output}\n`);
    this.input.value = '';
    this._updatePromptLabel();
    this._printPrompt();
    this._scrollToBottom();
  }

  _complete() {
    const line = this.input.value;
    const { completions, exact } = this.session.complete(line);
    if (completions.length === 1) {
      this.input.value = this._applyCompletion(line, completions[0]);
    } else if (completions.length > 1 && !exact) {
      this._print(`${this.session.prompt} ${line}\n${completions.join('   ')}\n`);
      this._scrollToBottom();
    }
  }

  _showHelp() {
    const line = this.input.value;
    const { completions, descriptions, param } = this.session.complete(line);
    let help;
    if (param) {
      help = `  <${param}>`;
    } else if (completions.length === 0) {
      help = '  <cr>';
    } else {
      const width = Math.max(...completions.map((c) => c.length)) + 2;
      help = completions
        .map((c) =>
          descriptions && descriptions[c] ? `  ${c.padEnd(width)}${descriptions[c]}` : `  ${c}`,
        )
        .join('\n');
    }
    this._print(`${this.session.prompt} ${line}?\n${help}\n`);
    this._scrollToBottom();
  }

  /**
   * Replaces the final (partial) word of `line` with `word`, preserving the
   * preceding tokens, and adds a trailing space.
   * @param {string} line
   * @param {string} word
   * @returns {string}
   */
  _applyCompletion(line, word) {
    if (/\s$/.test(line) || line.length === 0) return `${line}${word} `;
    const parts = line.split(/(\s+)/);
    parts[parts.length - 1] = word;
    return `${parts.join('')} `;
  }

  _printPrompt() {
    this.promptEl.textContent = `${this.session.prompt} `;
  }

  _updatePromptLabel() {
    this.promptEl.textContent = `${this.session.prompt} `;
    this.titleEl.textContent = `CLI — ${this.session.device.hostname}`;
  }

  /**
   * @param {string} text
   */
  _print(text) {
    this.output.appendChild(document.createTextNode(text));
  }

  _scrollToBottom() {
    this.output.scrollTop = this.output.scrollHeight;
  }

  /**
   * Minimal window dragging via the header bar.
   * @param {HTMLElement} handle
   */
  _makeDraggable(handle) {
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;

    const onMove = (event) => {
      this.el.style.left = `${originLeft + (event.clientX - startX)}px`;
      this.el.style.top = `${originTop + (event.clientY - startY)}px`;
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    handle.addEventListener('pointerdown', (event) => {
      if (event.target.closest('.terminal-close')) return;
      const rect = this.el.getBoundingClientRect();
      originLeft = rect.left;
      originTop = rect.top;
      startX = event.clientX;
      startY = event.clientY;
      this.el.style.left = `${originLeft}px`;
      this.el.style.top = `${originTop}px`;
      this.el.style.right = 'auto';
      this.el.style.bottom = 'auto';
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  }
}
