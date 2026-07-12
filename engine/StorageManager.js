/**
 * StorageManager.js
 *
 * Facade over every persistence mechanism the editor uses:
 *   - `localStorage`  — a single autosave slot, restored on load.
 *   - `IndexedDBAdapter` — named, multi-project storage.
 *   - File download/upload — manual JSON export/import.
 *
 * `Topology.toJSON()` / `Topology.fromJSON()` is the single serialization
 * format shared by all three, so a topology exported to a file can be
 * imported back, saved as a named project, or restored from autosave
 * interchangeably.
 */

import { generateId } from '../topology/Topology.js';
import { IndexedDBAdapter } from './IndexedDBAdapter.js';

const AUTOSAVE_KEY = 'openccna:autosave';

/**
 * Throws a descriptive error if `data` doesn't look like a topology
 * serialized by `Topology#toJSON`.
 * @param {any} data
 */
function assertValidTopologyData(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid topology file: expected a JSON object');
  }
  if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
    throw new Error('Invalid topology file: missing "nodes" or "edges" array');
  }
}

export class StorageManager {
  constructor() {
    this.indexedDb = new IndexedDBAdapter();
  }

  // --- Autosave (localStorage) -----------------------------------------

  /**
   * @param {import('../topology/Topology.js').Topology} topology
   */
  saveAutosave(topology) {
    const payload = JSON.stringify(topology.toJSON());
    localStorage.setItem(AUTOSAVE_KEY, payload);
  }

  /**
   * @returns {object|null} Parsed topology data, or null if none exists
   *   or it is corrupted.
   */
  loadAutosave() {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      assertValidTopologyData(data);
      return data;
    } catch (error) {
      console.warn('OpenCCNA: discarding corrupted autosave', error);
      return null;
    }
  }

  clearAutosave() {
    localStorage.removeItem(AUTOSAVE_KEY);
  }

  // --- File export/import ------------------------------------------------

  /**
   * Triggers a browser download of the topology as a `.json` file.
   * @param {import('../topology/Topology.js').Topology} topology
   * @param {string} [filename]
   */
  exportToFile(topology, filename = 'openccna-topology.json') {
    const payload = JSON.stringify(topology.toJSON(), null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  }

  /**
   * Reads and validates a `File` (e.g. from a file input) as topology JSON.
   * Does not mutate any Topology — callers should call
   * `topology.loadFromJSON(data)` themselves so the caller controls
   * whether this replaces the current topology or is used elsewhere.
   * @param {File} file
   * @returns {Promise<object>}
   */
  importFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(String(reader.result));
          assertValidTopologyData(data);
          resolve(data);
        } catch (error) {
          reject(new Error(`Could not import topology: ${error.message}`));
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  // --- Named projects (IndexedDB) -----------------------------------------

  /**
   * @param {import('../topology/Topology.js').Topology} topology
   * @param {string} name
   * @param {string} [existingId] - Pass to overwrite a previously saved project.
   * @returns {Promise<string>} the project id
   */
  async saveNamedProject(topology, name, existingId = null) {
    const id = existingId ?? generateId();
    await this.indexedDb.saveProject({ id, name, data: topology.toJSON() });
    return id;
  }

  /**
   * @returns {Promise<Array<{id: string, name: string, updatedAt: number}>>}
   */
  async listNamedProjects() {
    const projects = await this.indexedDb.listProjects();
    return projects.map(({ id, name, updatedAt }) => ({ id, name, updatedAt }));
  }

  /**
   * @param {string} id
   * @returns {Promise<object|null>} topology data, or null if not found
   */
  async loadNamedProject(id) {
    const record = await this.indexedDb.loadProject(id);
    if (!record) return null;
    assertValidTopologyData(record.data);
    return record.data;
  }

  /**
   * @param {string} id
   * @returns {Promise<void>}
   */
  async deleteNamedProject(id) {
    await this.indexedDb.deleteProject(id);
  }
}
