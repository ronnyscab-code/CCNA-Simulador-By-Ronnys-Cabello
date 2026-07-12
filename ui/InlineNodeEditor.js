/**
 * InlineNodeEditor.js
 *
 * A small, focused component for renaming a device in place: it overlays a
 * plain HTML `<input>` on top of the node's on-screen label (SVG has no
 * native text-editing widget). Lives in `ui/` because it is purely a DOM
 * concern — `CanvasManager` only ever sees the committed hostname via
 * `renameNode()`.
 */

export class InlineNodeEditor {
  /**
   * @param {HTMLElement} container - positioned ancestor the input is placed within.
   */
  constructor(container) {
    this.container = container;
    /** @type {HTMLInputElement|null} */
    this.inputEl = null;
  }

  /**
   * @returns {boolean}
   */
  isEditing() {
    return this.inputEl !== null;
  }

  /**
   * Opens the editor over the given node.
   * @param {import('../topology/Node.js').Node} node
   * @param {import('./Camera.js').Camera} camera
   * @param {(newHostname: string) => void} onCommit
   */
  begin(node, camera, onCommit) {
    if (this.isEditing()) this.end();

    const screen = camera.toScreen(node.x, node.y);
    const input = document.createElement('input');
    input.type = 'text';
    input.value = node.hostname;
    input.className = 'node-label-edit';
    input.style.position = 'absolute';
    input.style.left = `${screen.x - 60}px`;
    input.style.top = `${screen.y + node.height / 2 + 6}px`;
    input.style.width = '120px';

    const commit = () => {
      if (!this.isEditing()) return;
      onCommit(input.value);
      this.end();
    };
    const cancel = () => this.end();

    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') commit();
      else if (event.key === 'Escape') cancel();
    });
    input.addEventListener('blur', commit);
    input.addEventListener('pointerdown', (event) => event.stopPropagation());

    this.container.appendChild(input);
    this.inputEl = input;
    input.focus();
    input.select();
  }

  end() {
    if (this.inputEl) {
      this.inputEl.remove();
      this.inputEl = null;
    }
  }
}
