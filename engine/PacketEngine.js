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

/** @enum {string} */
export const PingReason = Object.freeze({
  OK: 'ok',
  NO_SOURCE_IP: 'no-source-ip',
  DIFFERENT_SUBNET: 'different-subnet',
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
   * Clears all dynamic state (ARP caches). Called on `reload`.
   */
  reset() {
    this.arpCaches.clear();
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

    const dstIface = dstNode.device.interfaces.find((i) => i.enabled && i.ipAddress === dstIp);
    const srcCache = this.arpCacheFor(srcNodeId);
    const dstCache = this.arpCacheFor(dstNode.id);

    // ARP resolution (only if not already cached).
    if (!srcCache.has(dstIp)) {
      events.push({ kind: 'arp-request', path });
      events.push({ kind: 'arp-reply', path: [...path].reverse() });
      srcCache.set(dstIp, dstIface.mac);
      dstCache.set(egress.ipAddress, egress.mac);
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
