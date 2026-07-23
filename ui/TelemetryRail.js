/**
 * TelemetryRail.js
 *
 * The live-state rail that floats over the canvas while telemetry is on: a
 * count of what the cabling is doing, the interfaces of whichever device is
 * selected, and the tables the engine has actually learned (ARP for a router
 * or host, MAC for a switch).
 *
 * It reports, it does not judge — the scenario checks say whether the lab is
 * solved and `scenarios/diagnostics.js` says where a fault probably is. This
 * only shows what is true right now, refreshed on every canvas render.
 *
 * Presentation only; all the reading lives in `engine/telemetry.js`.
 */

import { buildTelemetry } from '../engine/telemetry.js';

export class TelemetryRail {
  /**
   * @param {object} deps
   * @param {HTMLElement} deps.container - the canvas container to float over.
   * @param {import('../topology/Topology.js').Topology} deps.topology
   * @param {import('../engine/PacketEngine.js').PacketEngine|null} [deps.engine]
   */
  constructor({ container, topology, engine = null }) {
    this.topology = topology;
    this.engine = engine;
    this.visible = false;
    this.focusNodeId = null;

    this.el = document.createElement('aside');
    this.el.className = 'telemetry-rail';
    this.el.hidden = true;
    container.appendChild(this.el);
  }

  /**
   * @param {boolean} visible
   */
  setVisible(visible) {
    this.visible = visible;
    this.el.hidden = !visible;
    if (visible) this.refresh();
  }

  /**
   * @param {string|null} nodeId - the device to show in detail.
   */
  setFocus(nodeId) {
    this.focusNodeId = nodeId;
    if (this.visible) this.refresh();
  }

  refresh() {
    if (!this.visible) return;
    const data = buildTelemetry(this.topology, this.engine, this.focusNodeId);

    this.el.innerHTML = '';
    this.el.appendChild(this._header(data.summary));

    if (!data.focus) {
      this.el.appendChild(hint('Selecciona un dispositivo para ver sus interfaces y tablas.'));
      return;
    }

    this.el.appendChild(section(data.focus.hostname));
    this.el.appendChild(this._interfaces(data.focus.interfaces));

    if (data.focus.mac.length > 0) {
      this.el.appendChild(section('Tabla MAC'));
      this.el.appendChild(this._macTable(data.focus.mac));
    }
    if (data.focus.arp.length > 0) {
      this.el.appendChild(section('Caché ARP'));
      this.el.appendChild(this._arpTable(data.focus.arp));
    }
    if (data.focus.mac.length === 0 && data.focus.arp.length === 0) {
      this.el.appendChild(hint('Sin entradas aprendidas todavía. Lanza un ping.'));
    }
  }

  /**
   * @param {object} summary
   * @returns {HTMLElement}
   */
  _header(summary) {
    const wrap = el('div', 'telemetry-summary');
    wrap.append(
      stat(summary.devices, 'equipos'),
      stat(summary.links, 'enlaces'),
      stat(summary.warn, 'avisos', summary.warn > 0 ? 'warn' : null),
      stat(summary.down, 'caídos', summary.down > 0 ? 'down' : null),
    );
    return wrap;
  }

  /**
   * @param {Array<object>} rows
   * @returns {HTMLElement}
   */
  _interfaces(rows) {
    const list = el('ul', 'telemetry-list');
    for (const row of rows) {
      const item = el('li', 'telemetry-row');
      const dot = el('span', `telemetry-dot ${row.up ? 'up' : 'down'}`);
      const name = el('span', 'telemetry-key');
      name.textContent = row.short;
      const value = el('span', 'telemetry-value');
      value.textContent = row.ip ?? (row.vlan !== null ? `vlan ${row.vlan}` : 'sin IP');
      item.append(dot, name, value);
      list.appendChild(item);
    }
    return list;
  }

  /**
   * @param {Array<object>} rows
   * @returns {HTMLElement}
   */
  _macTable(rows) {
    const list = el('ul', 'telemetry-list');
    for (const row of rows.slice(0, 8)) {
      const item = el('li', 'telemetry-row');
      const key = el('span', 'telemetry-key');
      key.textContent = row.port;
      const value = el('span', 'telemetry-value mono');
      value.textContent = `${row.mac}  ·  vlan ${row.vlan}`;
      item.append(key, value);
      list.appendChild(item);
    }
    return list;
  }

  /**
   * @param {Array<object>} rows
   * @returns {HTMLElement}
   */
  _arpTable(rows) {
    const list = el('ul', 'telemetry-list');
    for (const row of rows.slice(0, 8)) {
      const item = el('li', 'telemetry-row');
      const key = el('span', 'telemetry-key');
      key.textContent = row.ip;
      const value = el('span', 'telemetry-value mono');
      value.textContent = row.mac;
      item.append(key, value);
      list.appendChild(item);
    }
    return list;
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
 * @param {number} value
 * @param {string} label
 * @param {string|null} [level]
 * @returns {HTMLElement}
 */
function stat(value, label, level = null) {
  const wrap = el('div', `telemetry-stat${level ? ` ${level}` : ''}`);
  const num = el('span', 'telemetry-stat-value');
  num.textContent = String(value);
  const cap = el('span', 'telemetry-stat-label');
  cap.textContent = label;
  wrap.append(num, cap);
  return wrap;
}

/**
 * @param {string} text
 * @returns {HTMLElement}
 */
function section(text) {
  const heading = el('h3', 'telemetry-section');
  heading.textContent = text;
  return heading;
}

/**
 * @param {string} text
 * @returns {HTMLElement}
 */
function hint(text) {
  const p = el('p', 'telemetry-hint');
  p.textContent = text;
  return p;
}
