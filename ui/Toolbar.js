/**
 * Toolbar.js
 *
 * Wires up the top toolbar (undo/redo, edit actions, view controls,
 * project actions) and the device palette sidebar. Every button here calls
 * the same `CanvasManager`/`Topology`/`History`/`StorageManager` methods
 * that keyboard shortcuts use (see `CanvasInteractions`), so there is one
 * source of truth for what each action does.
 *
 * Project save/load dialogs use `window.prompt`/`confirm`/`alert` for v0.1
 * — functional and dependency-free; a proper modal can replace them later
 * without touching `StorageManager`.
 */

import { modelsForType, defaultModelId } from '../devices/models.js';

export class Toolbar {
  /**
   * @param {object} deps
   * @param {import('../topology/Topology.js').Topology} deps.topology
   * @param {import('./Camera.js').Camera} deps.camera
   * @param {import('./HistoryManager.js').HistoryManager} deps.history
   * @param {import('../engine/StorageManager.js').StorageManager} deps.storage
   * @param {import('./CanvasManager.js').CanvasManager} deps.canvasManager
   */
  constructor({ topology, camera, history, storage, canvasManager }) {
    this.topology = topology;
    this.camera = camera;
    this.history = history;
    this.storage = storage;
    this.canvasManager = canvasManager;

    this.el = document.getElementById('toolbar');
    this.zoomLabel = document.getElementById('zoom-label');
    this.importInput = document.getElementById('import-file-input');
    this.paletteList = document.getElementById('palette-list');

    this.statusSelection = document.getElementById('status-selection');
    this.statusCoords = document.getElementById('status-coords');
    this.statusMode = document.getElementById('status-mode');
    this.statusProject = document.getElementById('status-project');

    this.projectName = 'Untitled Topology';
    this.currentProjectId = null;

    this._bindToolbarButtons();
    this._bindPalette();
    this._bindStatusUpdates();
  }

  _bindToolbarButtons() {
    this.el.addEventListener('click', (event) => {
      const btn = event.target.closest('button[data-action]');
      if (btn) this._handleAction(btn.dataset.action);
    });

    this.importInput.addEventListener('change', () => this._handleImportFile());

    this.history.addEventListener('change', () => this._updateHistoryButtons());
    this.camera.addEventListener('change', () => this._updateZoomLabel());
    this.canvasManager.addEventListener('viewChange', () => this._updateToggleButtons());

    this._updateHistoryButtons();
    this._updateZoomLabel();
    this._updateToggleButtons();
  }

  _handleAction(action) {
    const actions = {
      undo: () => this.history.undo(),
      redo: () => this.history.redo(),
      duplicate: () => this.canvasManager.duplicateSelection(),
      delete: () => this.canvasManager.deleteSelection(),
      connect: () => this.canvasManager.toggleConnectMode(),
      'zoom-in': () => this.canvasManager.zoomIn(),
      'zoom-out': () => this.canvasManager.zoomOut(),
      'zoom-reset': () => this.canvasManager.zoomResetView(),
      'toggle-grid': () => this.canvasManager.toggleGrid(),
      'toggle-snap': () => this.canvasManager.toggleSnap(),
      'toggle-chassis': () => this.canvasManager.toggleChassis(),
      'toggle-zones': () => this.canvasManager.toggleZones(),
      'toggle-telemetry': () => this.canvasManager.toggleTelemetry(),
      'new-project': () => this._newProject(),
      'save-project': () => this._saveProject(),
      'load-project': () => this._loadProjectPrompt(),
      'export-json': () => this._exportJson(),
      'import-json': () => this.importInput.click(),
    };
    actions[action]?.();
  }

  _updateHistoryButtons() {
    this.el.querySelector('[data-action="undo"]').disabled = !this.history.canUndo();
    this.el.querySelector('[data-action="redo"]').disabled = !this.history.canRedo();
  }

  _updateZoomLabel() {
    this.zoomLabel.textContent = `${this.camera.getZoomPercent()}%`;
  }

  _updateToggleButtons() {
    this.el
      .querySelector('[data-action="connect"]')
      .setAttribute('aria-pressed', String(this.canvasManager.connectMode));
    this.el
      .querySelector('[data-action="toggle-grid"]')
      .setAttribute('aria-pressed', String(this.canvasManager.gridVisible));
    this.el
      .querySelector('[data-action="toggle-snap"]')
      .setAttribute('aria-pressed', String(this.canvasManager.snapEnabled));
    for (const [action, on] of [
      ['toggle-chassis', this.canvasManager.chassisMode],
      ['toggle-zones', this.canvasManager.zonesVisible],
      ['toggle-telemetry', this.canvasManager.telemetryVisible],
    ]) {
      this.el.querySelector(`[data-action="${action}"]`)?.setAttribute('aria-pressed', String(on));
    }
    this.statusMode.textContent = this.canvasManager.connectMode ? 'Connect mode' : 'Select mode';
  }

  _bindPalette() {
    this._placeCount = 0;
    this._populateModelSelects();
    for (const item of this.paletteList.querySelectorAll('.palette-item')) {
      item.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData('text/device-type', item.dataset.deviceType);
        event.dataTransfer.setData('text/device-model', this._selectedModel(item) ?? '');
        event.dataTransfer.effectAllowed = 'copy';
        item.classList.add('dragging');
      });
      item.addEventListener('dragend', () => item.classList.remove('dragging'));

      // Click-to-place fallback: dragging is fiddly on trackpads, so a plain
      // click drops the device onto the canvas (cascading so they don't stack).
      item.addEventListener('click', (event) => {
        // Interacting with the model dropdown must not place a device.
        if (event.target.closest('.palette-model')) return;
        const rect = this.canvasManager.container.getBoundingClientRect();
        const step = (this._placeCount % 6) * 26;
        const x = rect.left + rect.width / 2 - 60 + step;
        const y = rect.top + rect.height / 2 - 60 + step;
        this._placeCount += 1;
        this.canvasManager.addDeviceAtClient(
          item.dataset.deviceType,
          x,
          y,
          this._selectedModel(item),
        );
      });
    }
  }

  /**
   * Fills every `.palette-model` dropdown with its device type's models,
   * selecting that type's default. Keeps the option list in one place
   * (`devices/models.js`) rather than duplicating it in the HTML.
   */
  _populateModelSelects() {
    for (const select of this.paletteList.querySelectorAll('.palette-model')) {
      const type = select.dataset.modelFor;
      const models = modelsForType(type);
      select.innerHTML = '';
      for (const model of models) {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.label;
        select.appendChild(option);
      }
      select.value = defaultModelId(type) ?? models[0]?.id ?? '';
    }
  }

  /**
   * @param {HTMLElement} item - A `.palette-item`.
   * @returns {string|null} the model id chosen in this item's dropdown, if any.
   */
  _selectedModel(item) {
    return item.querySelector('.palette-model')?.value || null;
  }

  _bindStatusUpdates() {
    this.canvasManager.selection.addEventListener('change', () => this._updateSelectionStatus());
    this._updateSelectionStatus();

    this.canvasManager.container.addEventListener('pointermove', (event) => {
      const world = this.canvasManager.worldPointFromClient(event.clientX, event.clientY);
      this.statusCoords.textContent = `x: ${Math.round(world.x)}, y: ${Math.round(world.y)}`;
    });
  }

  _updateSelectionStatus() {
    this.statusSelection.textContent = `${this.canvasManager.selection.size()} selected`;
  }

  // --- Project actions ---------------------------------------------------

  _newProject() {
    if (this.topology.getNodes().length > 0) {
      const confirmed = window.confirm('Start a new topology? Unsaved changes will be lost.');
      if (!confirmed) return;
    }
    this.topology.clear();
    this.history.clear();
    this.camera.reset();
    this.currentProjectId = null;
    this._setProjectName('Untitled Topology');
    this.storage.clearAutosave();
  }

  async _saveProject() {
    const suggested = this.projectName === 'Untitled Topology' ? '' : this.projectName;
    const name = window.prompt('Project name:', suggested);
    if (!name) return;
    this.currentProjectId = await this.storage.saveNamedProject(
      this.topology,
      name,
      this.currentProjectId,
    );
    this._setProjectName(name);
  }

  async _loadProjectPrompt() {
    const projects = await this.storage.listNamedProjects();
    if (projects.length === 0) {
      window.alert('No saved projects yet. Use "Save" first.');
      return;
    }
    const listText = projects.map((p, i) => `${i + 1}. ${p.name}`).join('\n');
    const answer = window.prompt(`Enter the number of the project to load:\n${listText}`);
    const index = Number.parseInt(answer, 10) - 1;
    if (Number.isNaN(index) || !projects[index]) return;

    const project = projects[index];
    const data = await this.storage.loadNamedProject(project.id);
    if (!data) return;

    this.topology.loadFromJSON(data);
    this.history.clear();
    this.currentProjectId = project.id;
    this._setProjectName(project.name);
  }

  _exportJson() {
    this.storage.exportToFile(this.topology, `${this._slugify(this.projectName)}.json`);
  }

  async _handleImportFile() {
    const file = this.importInput.files?.[0];
    this.importInput.value = '';
    if (!file) return;

    try {
      const data = await this.storage.importFromFile(file);
      this.topology.loadFromJSON(data);
      this.history.clear();
      this.currentProjectId = null;
      this._setProjectName(file.name.replace(/\.json$/i, ''));
    } catch (error) {
      window.alert(error.message);
    }
  }

  _setProjectName(name) {
    this.projectName = name;
    this.statusProject.textContent = name;
  }

  /**
   * @param {string} name
   * @returns {string}
   */
  _slugify(name) {
    return (
      name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'topology'
    );
  }
}
