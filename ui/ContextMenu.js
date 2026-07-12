/**
 * ContextMenu.js
 *
 * A small, generic right-click menu component. It knows nothing about
 * devices, topologies, or the canvas — callers pass a list of `{ label,
 * action, disabled?, shortcut? }` items (or `{ separator: true }`) and it
 * renders and wires them up. `main.js` decides *what* items to show for a
 * node/edge/canvas right-click; this class only handles *how* a menu is
 * shown, positioned, and dismissed.
 */

export class ContextMenu {
  /**
   * @param {HTMLElement} el - the (initially hidden) `#context-menu` element.
   */
  constructor(el) {
    this.el = el;
    this._onDocumentPointerDown = this._onDocumentPointerDown.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   * @param {Array<{label?: string, action?: Function, disabled?: boolean, shortcut?: string, separator?: boolean}>} items
   */
  show(clientX, clientY, items) {
    this.el.innerHTML = '';

    for (const item of items) {
      if (item.separator) {
        const sep = document.createElement('div');
        sep.className = 'context-menu-separator';
        this.el.appendChild(sep);
        continue;
      }

      const row = document.createElement('div');
      row.className = 'context-menu-item';
      row.setAttribute('role', 'menuitem');
      if (item.disabled) row.setAttribute('aria-disabled', 'true');

      const label = document.createElement('span');
      label.textContent = item.label;
      row.appendChild(label);

      if (item.shortcut) {
        const shortcut = document.createElement('span');
        shortcut.className = 'context-menu-shortcut';
        shortcut.textContent = item.shortcut;
        row.appendChild(shortcut);
      }

      if (!item.disabled) {
        row.addEventListener('click', () => {
          this.hide();
          item.action?.();
        });
      }

      this.el.appendChild(row);
    }

    this.el.hidden = false;
    this._position(clientX, clientY);

    // Deferred so the click that opened the menu doesn't immediately close it.
    setTimeout(() => {
      document.addEventListener('pointerdown', this._onDocumentPointerDown);
      document.addEventListener('keydown', this._onKeyDown);
    }, 0);
  }

  hide() {
    if (this.el.hidden) return;
    this.el.hidden = true;
    document.removeEventListener('pointerdown', this._onDocumentPointerDown);
    document.removeEventListener('keydown', this._onKeyDown);
  }

  _position(clientX, clientY) {
    const margin = 8;
    const rect = this.el.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - margin;
    const maxY = window.innerHeight - rect.height - margin;
    this.el.style.left = `${Math.min(clientX, Math.max(margin, maxX))}px`;
    this.el.style.top = `${Math.min(clientY, Math.max(margin, maxY))}px`;
  }

  _onDocumentPointerDown(event) {
    if (!this.el.contains(event.target)) this.hide();
  }

  _onKeyDown(event) {
    if (event.key === 'Escape') this.hide();
  }
}
