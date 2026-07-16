/**
 * PropertiesPanel.js
 *
 * Right-hand inspector for the currently selected device — Packet-Tracer
 * style: it is a launcher + read-only status view, NOT a config form. All
 * configuration is done through the device CLI (`Open CLI`), so this panel
 * shows the device type, its display name, a prominent CLI button, and a
 * read-only summary of each interface's state (up/down and IP or VLAN).
 *
 * Like the rest of `ui/`, this is the only kind of module allowed to touch
 * the DOM; it reads the topology and reacts to its events.
 */

import { maskToPrefix } from '../devices/net-utils.js';
import { modelLabel } from '../devices/models.js';

export class PropertiesPanel {
  /**
   * @param {object} deps
   * @param {import('../topology/Topology.js').Topology} deps.topology
   * @param {import('./SelectionManager.js').SelectionManager} deps.selection
   * @param {import('./HistoryManager.js').HistoryManager} deps.history
   * @param {import('./CanvasManager.js').CanvasManager} deps.canvasManager
   * @param {import('./TerminalManager.js').TerminalManager} [deps.terminals]
   */
  constructor({ topology, selection, history, canvasManager, terminals = null }) {
    this.topology = topology;
    this.selection = selection;
    this.history = history;
    this.canvasManager = canvasManager;
    this.terminals = terminals;

    this.body = document.getElementById('properties-body');

    this.selection.addEventListener('change', () => this.render());
    this.topology.addEventListener('nodeUpdated', () => this.render());
    this.topology.addEventListener('edgeAdded', () => this.render());
    this.topology.addEventListener('edgeRemoved', () => this.render());
    this.topology.addEventListener('nodeRemoved', () => this.render());
    this.topology.addEventListener('loaded', () => this.render());

    this.render();
  }

  /**
   * @returns {import('../topology/Node.js').Node|null} the single selected
   *   node with a device, or null if the selection is empty / multiple /
   *   deviceless.
   */
  _selectedDeviceNode() {
    const ids = this.selection.getSelectedNodeIds();
    if (ids.length !== 1) return null;
    const node = this.topology.getNode(ids[0]);
    return node && node.device ? node : null;
  }

  render() {
    const node = this._selectedDeviceNode();
    if (!node) {
      const count = this.selection.size();
      this.body.innerHTML = `<p class="panel-empty">${
        count > 1
          ? 'Selecciona un solo dispositivo.'
          : 'Selecciona un dispositivo y ábrelo con Open CLI para configurarlo.'
      }</p>`;
      return;
    }

    this.body.innerHTML = '';
    this.body.appendChild(this._renderHeader(node));
    this.body.appendChild(this._renderStatus(node));
  }

  /**
   * Device type chip, a prominent Open CLI button, and the display name.
   * @param {import('../topology/Node.js').Node} node
   * @returns {HTMLElement}
   */
  _renderHeader(node) {
    const group = el('div', 'prop-group');

    const chip = el('span', 'prop-device-type');
    chip.textContent = node.deviceType;
    group.appendChild(chip);

    if (node.device.model) {
      const modelChip = el('span', 'prop-device-model');
      modelChip.textContent = modelLabel(node.deviceType, node.device.model);
      group.appendChild(modelChip);
    }

    if (this.terminals) {
      const cliBtn = el('button', 'btn prop-cli-btn labs-check');
      cliBtn.type = 'button';
      cliBtn.textContent = '⌨  Open CLI';
      cliBtn.addEventListener('click', () => this.terminals.open(node.id));
      group.appendChild(cliBtn);
    }

    const field = el('div', 'prop-field');
    const label = el('label');
    label.textContent = 'Nombre (etiqueta)';
    const input = el('input', 'prop-input');
    input.type = 'text';
    input.value = node.hostname;
    input.addEventListener('change', () => {
      this.canvasManager.renameNode(node.id, input.value);
    });
    field.append(label, input);
    group.appendChild(field);

    return group;
  }

  /**
   * Read-only interface status: name, up/down, and IP (routed/host) or VLAN
   * (switch). Configuration itself is done in the CLI.
   * @param {import('../topology/Node.js').Node} node
   * @returns {HTMLElement}
   */
  _renderStatus(node) {
    const group = el('div', 'prop-group');
    const caps = node.device.capabilities ?? {};
    const isL3 = caps.routing || caps.endpoint;

    const title = el('div', 'prop-group-title');
    title.textContent = `Interfaces (${node.device.interfaces.length}) · solo lectura`;
    group.appendChild(title);

    if (isL3 && node.device.defaultGateway) {
      const gw = el('div', 'iface-status-line');
      gw.innerHTML = `<span class="iface-name">Gateway</span><span class="iface-detail">${escapeHtml(node.device.defaultGateway)}</span>`;
      group.appendChild(gw);
    }

    for (const iface of node.device.interfaces) {
      const row = el('div', 'iface-status-line');
      const remote = this._remoteEndpointLabel(node.id, iface.name);

      const detail = isL3
        ? iface.ipAddress
          ? `${iface.ipAddress}/${safePrefix(iface.subnetMask)}`
          : 'sin IP'
        : iface.switchportMode === 'trunk'
          ? 'trunk'
          : `vlan ${iface.accessVlan ?? 1}`;

      row.innerHTML =
        `<span class="iface-status-dot${iface.enabled ? ' up' : ''}"></span>` +
        `<span class="iface-name">${escapeHtml(shortIface(iface.name))}</span>` +
        `<span class="iface-detail">${escapeHtml(detail)}${remote ? ` → ${escapeHtml(remote)}` : ''}</span>`;
      group.appendChild(row);
    }

    const tip = el('p', 'panel-empty');
    tip.style.marginTop = 'var(--space-3)';
    tip.textContent =
      'Configura todo por la consola: pulsa Open CLI y usa comandos IOS (conf t, ip address, switchport…).';
    group.appendChild(tip);

    return group;
  }

  /**
   * Returns the hostname of the device connected to a given interface, or
   * null if that interface has no cable.
   * @param {string} nodeId
   * @param {string} interfaceName
   * @returns {string|null}
   */
  _remoteEndpointLabel(nodeId, interfaceName) {
    for (const edge of this.topology.getEdgesForNode(nodeId)) {
      if (this.topology.portForNode(edge, nodeId) === interfaceName) {
        const otherId = edge.otherNodeId(nodeId);
        const other = this.topology.getNode(otherId);
        return other ? other.hostname : null;
      }
    }
    return null;
  }
}

// --- helpers -------------------------------------------------------------

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
 * Abbreviates an IOS interface name (GigabitEthernet0/0 → Gi0/0).
 * @param {string} name
 * @returns {string}
 */
function shortIface(name) {
  return name
    .replace(/^GigabitEthernet/, 'Gi')
    .replace(/^FastEthernet/, 'Fa')
    .replace(/^Ethernet/, 'Et')
    .replace(/^Serial/, 'Se');
}

/**
 * @param {string|null} mask
 * @returns {string}
 */
function safePrefix(mask) {
  try {
    return String(maskToPrefix(mask));
  } catch {
    return '?';
  }
}

/**
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
