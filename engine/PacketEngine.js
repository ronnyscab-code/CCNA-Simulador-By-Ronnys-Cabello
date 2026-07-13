/**
 * PacketEngine.js
 *
 * Simulates the packet exchanges the CLI can trigger — for v0.4, an ICMP
 * `ping` between two hosts in the same subnet. It models the real sequence a
 * device follows:
 *
 *   1. Choose the egress interface whose subnet contains the destination.
 *   2. Resolve the destination MAC with ARP (request → reply) if the ARP
 *      cache doesn't already have it.
 *   3. Send the ICMP echo request and receive the echo reply.
 *
 * Each step becomes an animation "event" (a kind + the node path the frame
 * travels), so the UI can draw the packet moving across the topology. The
 * engine is otherwise pure/synchronous and DOM-free: it returns a result and
 * a list of events; `ui/PacketAnimator.js` plays them.
 *
 * Cross-subnet routing (via a default gateway / routing table) and MAC-table
 * learning arrive in v0.5–v0.6; this engine deliberately covers the
 * single-broadcast-domain case end to end first.
 */

import { sameSubnet } from '../devices/net-utils.js';
import { ArpCache } from '../protocols/arp.js';
import { L2Fabric } from './L2Fabric.js';
import { MacTable } from './MacTable.js';

/** @enum {string} */
export const PingReason = Object.freeze({
  OK: 'ok',
  NO_SOURCE_IP: 'no-source-ip',
  DIFFERENT_SUBNET: 'different-subnet',
  DIFFERENT_VLAN: 'different-vlan',
  UNREACHABLE_ARP: 'unreachable-arp',
  NOT_CONNECTED: 'not-connected',
});

export class PacketEngine {
  /**
   * @param {import('../topology/Topology.js').Topology} topology
   */
  constructor(topology) {
    this.topology = topology;
    this.fabric = new L2Fabric(topology);
    /** @type {Map<string, ArpCache>} nodeId → cache */
    this.arpCaches = new Map();
    /** @type {Map<string, MacTable>} switch nodeId → CAM table */
    this.macTables = new Map();
  }

  /**
   * @param {string} nodeId
   * @returns {ArpCache}
   */
  arpCacheFor(nodeId) {
    if (!this.arpCaches.has(nodeId)) this.arpCaches.set(nodeId, new ArpCache());
    return this.arpCaches.get(nodeId);
  }

  /**
   * @param {string} nodeId
   * @returns {MacTable}
   */
  macTableFor(nodeId) {
    if (!this.macTables.has(nodeId)) this.macTables.set(nodeId, new MacTable());
    return this.macTables.get(nodeId);
  }

  /**
   * Clears all dynamic state (ARP caches, MAC tables). Called on `reload`.
   */
  reset() {
    this.arpCaches.clear();
    this.macTables.clear();
  }

  /**
   * Simulates a ping from a source node to a destination IP.
   * @param {string} srcNodeId
   * @param {string} dstIp
   * @returns {{success: boolean, reason: string, rttMs: number, targetMac: string|null, events: Array<{kind: string, path: string[]}>}}
   */
  ping(srcNodeId, dstIp) {
    const srcNode = this.topology.getNode(srcNodeId);
    const events = [];
    const fail = (reason) => ({ success: false, reason, rttMs: 0, targetMac: null, events });

    if (!srcNode || !srcNode.device) return fail(PingReason.NOT_CONNECTED);

    const egress = this._egressInterface(srcNode.device, dstIp);
    if (!egress) {
      // No local subnet matches — with no L3 routing yet, this is unreachable.
      const hasIp = srcNode.device.interfaces.some((i) => i.enabled && i.ipAddress);
      return fail(hasIp ? PingReason.DIFFERENT_SUBNET : PingReason.NO_SOURCE_IP);
    }

    const dstNode = this._ownerOf(dstIp);
    if (!dstNode) return fail(PingReason.UNREACHABLE_ARP);

    const path = this.fabric.findPath(srcNodeId, dstNode.id);
    if (!path) return fail(PingReason.NOT_CONNECTED);

    // VLAN segregation: two hosts reachable at the physical layer still can't
    // talk if their switch access ports are in different VLANs.
    const srcVlan = this.fabric.hostAccessVlan(srcNodeId);
    const dstVlan = this.fabric.hostAccessVlan(dstNode.id);
    if (srcVlan !== null && dstVlan !== null && srcVlan !== dstVlan) {
      return fail(PingReason.DIFFERENT_VLAN);
    }
    const frameVlan = srcVlan ?? dstVlan ?? 1;

    const dstIface = dstNode.device.interfaces.find((i) => i.enabled && i.ipAddress === dstIp);
    const srcMac = egress.mac;
    const dstMac = dstIface.mac;
    const srcCache = this.arpCacheFor(srcNodeId);
    const dstCache = this.arpCacheFor(dstNode.id);

    // Switches along the path learn both endpoints' MACs (source learned as
    // the frame travels each direction). This populates `show mac
    // address-table`.
    this._learnAlongPath(path, srcMac, dstMac, frameVlan);

    // ARP resolution (only if not already cached).
    if (!srcCache.has(dstIp)) {
      events.push({ kind: 'arp-request', path });
      events.push({ kind: 'arp-reply', path: [...path].reverse() });
      srcCache.set(dstIp, dstMac);
      dstCache.set(egress.ipAddress, srcMac);
    }

    // ICMP echo request + reply.
    events.push({ kind: 'icmp-request', path });
    events.push({ kind: 'icmp-reply', path: [...path].reverse() });

    // Round-trip time scales with the number of hops, for a bit of realism.
    const hops = Math.max(1, path.length - 1);
    return {
      success: true,
      reason: PingReason.OK,
      rttMs: hops,
      targetMac: dstIface.mac,
      events,
    };
  }

  /**
   * Populates the MAC table of every switch on the path. For a switch at
   * position i in `[src, ...switches..., dst]`, the source MAC is learned on
   * the port facing the previous hop and the destination MAC on the port
   * facing the next hop — exactly what a real switch records as the two
   * frames (request then reply) pass through it.
   * @param {string[]} path
   * @param {string} srcMac
   * @param {string} dstMac
   * @param {number} vlan
   */
  _learnAlongPath(path, srcMac, dstMac, vlan) {
    for (let i = 1; i < path.length - 1; i += 1) {
      const node = this.topology.getNode(path[i]);
      if (!node || node.deviceType !== 'switch') continue;
      const table = this.macTableFor(node.id);
      const portToSrc = this.fabric.portFacing(node.id, path[i - 1]);
      const portToDst = this.fabric.portFacing(node.id, path[i + 1]);
      if (portToSrc) table.learn(vlan, srcMac, portToSrc);
      if (portToDst) table.learn(vlan, dstMac, portToDst);
    }
  }

  /**
   * The interface whose subnet contains `dstIp` (enabled and addressed).
   * @param {import('../devices/Device.js').Device} device
   * @param {string} dstIp
   * @returns {import('../devices/NetworkInterface.js').NetworkInterface|null}
   */
  _egressInterface(device, dstIp) {
    return (
      device.interfaces.find(
        (iface) =>
          iface.enabled &&
          iface.ipAddress &&
          iface.subnetMask &&
          sameSubnet(iface.ipAddress, dstIp, iface.subnetMask),
      ) ?? null
    );
  }

  /**
   * The node that owns `ip` on an enabled interface, if any.
   * @param {string} ip
   * @returns {import('../topology/Node.js').Node|null}
   */
  _ownerOf(ip) {
    return (
      this.topology
        .getNodes()
        .find(
          (node) =>
            node.device && node.device.interfaces.some((i) => i.enabled && i.ipAddress === ip),
        ) ?? null
    );
  }
}
