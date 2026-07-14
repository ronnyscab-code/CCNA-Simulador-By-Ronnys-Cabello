/**
 * builders.js
 *
 * A concise, fluent helper for authoring scenario topologies in code. It
 * wraps the real `Topology`/`Node`/`Edge` classes so scenarios read like a
 * lab sheet instead of a wall of JSON, while still producing a genuine
 * `Topology` the engine can run.
 *
 * DOM-free; used only by `labs/` scenario definitions.
 */

import { Topology } from '../topology/Topology.js';
import { Node } from '../topology/Node.js';
import { Edge } from '../topology/Edge.js';

export class TopologyBuilder {
  constructor() {
    this.topology = new Topology();
    this._edgeSeq = 0;
  }

  /**
   * Adds a device node.
   * @param {string} id
   * @param {string} deviceType
   * @param {string} hostname
   * @param {{x?: number, y?: number}} [pos]
   * @returns {TopologyBuilder}
   */
  device(id, deviceType, hostname, { x = 0, y = 0 } = {}) {
    this.topology.addNode(new Node({ id, deviceType, hostname, x, y }));
    return this;
  }

  pc(id, hostname, pos) {
    return this.device(id, 'pc', hostname, pos);
  }

  router(id, hostname, pos) {
    return this.device(id, 'router', hostname, pos);
  }

  switch(id, hostname, pos) {
    return this.device(id, 'switch', hostname, pos);
  }

  /**
   * Cables two devices together on explicit ports.
   * @param {string} aId
   * @param {string} aPort
   * @param {string} bId
   * @param {string} bPort
   * @returns {TopologyBuilder}
   */
  link(aId, aPort, bId, bPort) {
    this._edgeSeq += 1;
    this.topology.addEdge(
      new Edge({
        id: `e${this._edgeSeq}`,
        sourceNodeId: aId,
        targetNodeId: bId,
        sourcePort: aPort,
        targetPort: bPort,
      }),
    );
    return this;
  }

  /**
   * Configures an interface's IP/mask and admin state.
   * @param {string} nodeId
   * @param {string} ifaceName
   * @param {string|null} ip
   * @param {string|null} mask
   * @param {{enabled?: boolean}} [opts]
   * @returns {TopologyBuilder}
   */
  ip(nodeId, ifaceName, ip, mask, { enabled = true } = {}) {
    const iface = this.topology.getNode(nodeId).device.getInterface(ifaceName);
    if (ip && mask) iface.setIp(ip, mask);
    iface.enabled = enabled;
    return this;
  }

  /**
   * Sets an interface's admin state without touching its addressing.
   * @param {string} nodeId
   * @param {string} ifaceName
   * @param {boolean} enabled
   * @returns {TopologyBuilder}
   */
  adminState(nodeId, ifaceName, enabled) {
    this.topology.getNode(nodeId).device.getInterface(ifaceName).enabled = enabled;
    return this;
  }

  /**
   * @param {string} nodeId
   * @param {string} gatewayIp
   * @returns {TopologyBuilder}
   */
  gateway(nodeId, gatewayIp) {
    this.topology.getNode(nodeId).device.defaultGateway = gatewayIp;
    return this;
  }

  /**
   * Makes a switch port an access port in a VLAN.
   * @param {string} nodeId
   * @param {string} ifaceName
   * @param {number} vlan
   * @returns {TopologyBuilder}
   */
  accessVlan(nodeId, ifaceName, vlan) {
    const iface = this.topology.getNode(nodeId).device.getInterface(ifaceName);
    iface.switchportMode = 'access';
    iface.accessVlan = vlan;
    return this;
  }

  /**
   * Enables OSPF on a router with the given network statements.
   * @param {string} nodeId
   * @param {number} processId
   * @param {Array<{address: string, wildcard: string, area: number}>} networks
   * @returns {TopologyBuilder}
   */
  ospf(nodeId, processId, networks) {
    this.topology.getNode(nodeId).device.config.ospf = { processId, routerId: null, networks };
    return this;
  }

  /**
   * @returns {Topology}
   */
  build() {
    return this.topology;
  }
}
