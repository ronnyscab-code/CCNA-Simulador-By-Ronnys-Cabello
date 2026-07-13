/**
 * L2Fabric.js
 *
 * Computes layer-2 reachability over the topology. Switches, access points,
 * and clouds are *transparent bridges*: a frame entering one is relayed out
 * its other ports. Routers and endpoints are L2 endpoints — a frame destined
 * to them is consumed, not relayed (routers move traffic at L3, which is
 * v0.6). So two hosts can talk at layer 2 only if a path between them runs
 * through bridges the whole way.
 *
 * This is the piece that lets a `ping` between two PCs on the same subnet
 * work whether they are on one cable or separated by a stack of switches,
 * and it yields the node path the packet animator draws.
 */

/** Device types that relay frames at layer 2. */
const BRIDGE_TYPES = new Set(['switch', 'accesspoint', 'cloud']);

export class L2Fabric {
  /**
   * @param {import('../topology/Topology.js').Topology} topology
   */
  constructor(topology) {
    this.topology = topology;
  }

  /**
   * @param {import('../topology/Node.js').Node} node
   * @returns {boolean}
   */
  static isBridge(node) {
    return Boolean(node) && BRIDGE_TYPES.has(node.deviceType);
  }

  /**
   * Returns the neighbors of a node as { nodeId, localPort, remotePort }.
   * @param {string} nodeId
   * @returns {Array<{nodeId: string, localPort: string|null, remotePort: string|null}>}
   */
  neighbors(nodeId) {
    return this.topology.getEdgesForNode(nodeId).map((edge) => {
      const otherId = edge.otherNodeId(nodeId);
      return {
        nodeId: otherId,
        localPort: this.topology.portForNode(edge, nodeId),
        remotePort: this.topology.portForNode(edge, otherId),
      };
    });
  }

  /**
   * Finds a layer-2 path (list of node ids) from `srcId` to `dstId`, passing
   * only through transparent bridges in between. Returns null if the two are
   * not in the same broadcast domain.
   * @param {string} srcId
   * @param {string} dstId
   * @returns {string[]|null}
   */
  findPath(srcId, dstId) {
    if (srcId === dstId) return [srcId];

    const queue = [[srcId]];
    const visited = new Set([srcId]);

    while (queue.length > 0) {
      const path = queue.shift();
      const current = path[path.length - 1];

      for (const { nodeId: nextId } of this.neighbors(current)) {
        if (visited.has(nextId)) continue;

        if (nextId === dstId) {
          return [...path, nextId];
        }

        // Only continue exploring through bridges; endpoints/routers that
        // aren't the destination are dead ends at layer 2.
        const nextNode = this.topology.getNode(nextId);
        if (L2Fabric.isBridge(nextNode)) {
          visited.add(nextId);
          queue.push([...path, nextId]);
        }
      }
    }

    return null;
  }

  /**
   * The access VLAN a host effectively belongs to: the `switchport access
   * vlan` of the switch port it plugs into. Returns null if the host's
   * neighbor is not a switch (a direct host-host or host-router link has no
   * VLAN concept). Multi-homed hosts use their first switch link.
   * @param {string} hostId
   * @returns {number|null}
   */
  hostAccessVlan(hostId) {
    for (const edge of this.topology.getEdgesForNode(hostId)) {
      const otherId = edge.otherNodeId(hostId);
      const other = this.topology.getNode(otherId);
      if (!other || !L2Fabric.isBridge(other) || other.deviceType !== 'switch') continue;
      const switchPort = this.topology.portForNode(edge, otherId);
      const iface = switchPort ? other.device.getInterface(switchPort) : null;
      if (iface && iface.switchportMode === 'access') {
        return iface.accessVlan ?? 1;
      }
    }
    return null;
  }

  /**
   * The switch port on `switchId` that faces `neighborId`, or null.
   * @param {string} switchId
   * @param {string} neighborId
   * @returns {string|null}
   */
  portFacing(switchId, neighborId) {
    for (const edge of this.topology.getEdgesForNode(switchId)) {
      if (edge.otherNodeId(switchId) === neighborId) {
        return this.topology.portForNode(edge, switchId);
      }
    }
    return null;
  }

  /**
   * Every host/router reachable at layer 2 from `srcId` (its broadcast
   * domain), excluding the bridges themselves — the set an ARP broadcast
   * would reach.
   * @param {string} srcId
   * @returns {string[]}
   */
  broadcastDomain(srcId) {
    const members = [];
    const queue = [srcId];
    const visited = new Set([srcId]);

    while (queue.length > 0) {
      const current = queue.shift();
      for (const { nodeId: nextId } of this.neighbors(current)) {
        if (visited.has(nextId)) continue;
        visited.add(nextId);
        const nextNode = this.topology.getNode(nextId);
        if (L2Fabric.isBridge(nextNode)) {
          queue.push(nextId);
        } else {
          members.push(nextId);
        }
      }
    }
    return members;
  }
}
