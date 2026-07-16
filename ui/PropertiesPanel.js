/**
 * PropertiesPanel.js
 *
 * Right-hand inspector for the currently selected device. Shows the
 * device's hostname, per-interface configuration (admin state, IP, mask),
 * and — for endpoints — the default gateway. Every edit is applied through
 * a `HistoryManager` command, so configuring an interface here is undoable
 * exactly like a canvas action.
 *
 * Like the rest of `ui/`, this is the only kind of module allowed to touch
 * the DOM; it reads/writes the topology solely through commands and events.
 */

import {
  ConfigureInterfaceCommand,
  SetDevicePropertyCommand,
} from '../topology/TopologyCommands.js';
import { isValidIpv4, isValidSubnetMask } from '../devices/net-utils.js';

const ENDPOINT_TYPES = new Set(['pc', 'laptop', 'server', 'printer']);

export class PropertiesPanel {
  /**
   * @param {object} deps
   * @param {import('../topology/Topology.js').Topology} deps.topology
   * @param {import('./SelectionManager.js').SelectionManager} deps.selection
   * @param {import('./HistoryManager.js').HistoryManager} deps.history
   * @param {import('./CanvasManager.js').CanvasManager} deps.canvasManager
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
          ? 'Multiple items selected. Select a single device to edit it.'
          : 'Select a device to edit its configuration.'
      }</p>`;
      return;
    }

    this.body.innerHTML = '';
    this.body.appendChild(this._renderDeviceSection(node));
    if (ENDPOINT_TYPES.has(node.deviceType)) {
      this.body.appendChild(this._renderGatewaySection(node));
    }
    this.body.appendChild(this._renderInterfacesSection(node));
  }

  /**
   * @param {import('../topology/Node.js').Node} node
   * @returns {HTMLElement}
   */
  _renderDeviceSection(node) {
    const group = el('div', 'prop-group');

    const chip = el('span', 'prop-device-type');
    chip.textContent = node.deviceType;
    group.appendChild(chip);

    if (this.terminals) {
      const cliBtn = el('button', 'btn prop-cli-btn');
      cliBtn.type = 'button';
      cliBtn.textContent = 'Open CLI';
      cliBtn.addEventListener('click', () => this.terminals.open(node.id));
      group.appendChild(cliBtn);
    }

    const field = el('div', 'prop-field');
    const label = el('label');
    label.textContent = 'Hostname';
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
   * @param {import('../topology/Node.js').Node} node
   * @returns {HTMLElement}
   */
  _renderGatewaySection(node) {
    const group = el('div', 'prop-group');
    const title = el('div', 'prop-group-title');
    title.textContent = 'IP configuration';
    group.appendChild(title);

    const field = el('div', 'prop-field');
    const label = el('label');
    label.textContent = 'Default gateway';
    const input = el('input', 'prop-input');
    input.type = 'text';
    input.placeholder = 'e.g. 192.168.1.1';
    input.value = node.device.defaultGateway ?? '';
    input.addEventListener('change', () => {
      const value = input.value.trim();
      if (value && !isValidIpv4(value)) {
        input.classList.add('invalid');
        return;
      }
      input.classList.remove('invalid');
      if ((node.device.defaultGateway ?? '') === value) return;
      this.history.execute(
        new SetDevicePropertyCommand(this.topology, node.id, 'defaultGateway', value || null),
      );
    });
    field.append(label, input);
    group.appendChild(field);

    return group;
  }

  /**
   * @param {import('../topology/Node.js').Node} node
   * @returns {HTMLElement}
   */
  _renderInterfacesSection(node) {
    const group = el('div', 'prop-group');
    const title = el('div', 'prop-group-title');
    title.textContent = `Interfaces (${node.device.interfaces.length})`;
    group.appendChild(title);

    for (const iface of node.device.interfaces) {
      group.appendChild(this._renderInterfaceCard(node, iface));
    }
    return group;
  }

  /**
   * @param {import('../topology/Node.js').Node} node
   * @param {import('../devices/NetworkInterface.js').NetworkInterface} iface
   * @returns {HTMLElement}
   */
  _renderInterfaceCard(node, iface) {
    const card = el('div', 'iface-card');

    const header = el('div', 'iface-header');
    const name = el('span', 'iface-name');
    name.textContent = iface.name;
    header.appendChild(name);

    const remote = this._remoteEndpointLabel(node.id, iface.name);
    if (remote) {
      const link = el('span', 'iface-link');
      link.textContent = `→ ${remote}`;
      header.appendChild(link);
    }
    card.appendChild(header);

    // Admin state toggle
    const toggle = el('label', 'iface-toggle');
    const dot = el('span', `iface-status-dot${iface.enabled ? ' up' : ''}`);
    const checkbox = el('input');
    checkbox.type = 'checkbox';
    checkbox.checked = iface.enabled;
    checkbox.addEventListener('change', () => {
      this.history.execute(
        new ConfigureInterfaceCommand(this.topology, node.id, iface.name, {
          enabled: checkbox.checked,
        }),
      );
    });
    const toggleText = el('span');
    toggleText.textContent = iface.enabled ? 'no shutdown' : 'shutdown';
    toggle.append(checkbox, dot, toggleText);
    card.appendChild(toggle);

    // Layer-2 switch ports don't carry an IP — show their switchport role and
    // VLAN. Routed interfaces (routers) and endpoints (PCs) get IP + mask.
    const caps = node.device.capabilities ?? {};
    const isL3 = caps.routing || caps.endpoint;
    if (!isL3 && caps.switching) {
      card.appendChild(this._switchportField(node, iface));
    } else {
      card.appendChild(
        this._ipField(node, iface, 'IP address', 'ipAddress', 'e.g. 192.168.1.10', isValidIpv4),
      );
      card.appendChild(
        this._ipField(
          node,
          iface,
          'Subnet mask',
          'subnetMask',
          'e.g. 255.255.255.0',
          isValidSubnetMask,
        ),
      );
    }

    return card;
  }

  /**
   * Switch-port controls: access/trunk mode and, for access ports, the VLAN.
   * @param {import('../topology/Node.js').Node} node
   * @param {import('../devices/NetworkInterface.js').NetworkInterface} iface
   * @returns {HTMLElement}
   */
  _switchportField(node, iface) {
    const wrap = el('div');

    const modeField = el('div', 'prop-field');
    const modeLabel = el('label');
    modeLabel.textContent = 'Modo del puerto';
    const mode = el('select', 'prop-input');
    for (const value of ['access', 'trunk']) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = value === 'access' ? 'Acceso (una VLAN)' : 'Troncal (varias VLANs)';
      if ((iface.switchportMode ?? 'access') === value) opt.selected = true;
      mode.appendChild(opt);
    }
    mode.addEventListener('change', () => {
      this.history.execute(
        new ConfigureInterfaceCommand(this.topology, node.id, iface.name, {
          switchportMode: mode.value,
        }),
      );
    });
    modeField.append(modeLabel, mode);
    wrap.appendChild(modeField);

    if ((iface.switchportMode ?? 'access') === 'access') {
      const vlanField = el('div', 'prop-field');
      const vlanLabel = el('label');
      vlanLabel.textContent = 'VLAN de acceso';
      const vlan = el('input', 'prop-input');
      vlan.type = 'number';
      vlan.min = '1';
      vlan.max = '4094';
      vlan.value = String(iface.accessVlan ?? 1);
      vlan.addEventListener('change', () => {
        const n = Number(vlan.value);
        if (!Number.isInteger(n) || n < 1 || n > 4094) {
          vlan.classList.add('invalid');
          return;
        }
        vlan.classList.remove('invalid');
        this.history.execute(
          new ConfigureInterfaceCommand(this.topology, node.id, iface.name, { accessVlan: n }),
        );
      });
      vlanField.append(vlanLabel, vlan);
      wrap.appendChild(vlanField);
    }

    return wrap;
  }

  /**
   * Builds a validated text field bound to one interface property.
   * @param {import('../topology/Node.js').Node} node
   * @param {import('../devices/NetworkInterface.js').NetworkInterface} iface
   * @param {string} labelText
   * @param {'ipAddress'|'subnetMask'} property
   * @param {string} placeholder
   * @param {(value: string) => boolean} validate
   * @returns {HTMLElement}
   */
  _ipField(node, iface, labelText, property, placeholder, validate) {
    const field = el('div', 'prop-field');
    const label = el('label');
    label.textContent = labelText;
    const input = el('input', 'prop-input');
    input.type = 'text';
    input.placeholder = placeholder;
    input.value = iface[property] ?? '';
    input.addEventListener('change', () => {
      const value = input.value.trim();
      if (value && !validate(value)) {
        input.classList.add('invalid');
        return;
      }
      input.classList.remove('invalid');
      const next = value || null;
      if ((iface[property] ?? null) === next) return;
      this.history.execute(
        new ConfigureInterfaceCommand(this.topology, node.id, iface.name, { [property]: next }),
      );
    });
    field.append(label, input);
    return field;
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

/**
 * Tiny DOM element helper.
 * @param {string} tag
 * @param {string} [className]
 * @returns {HTMLElement}
 */
function el(tag, className) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  return element;
}
