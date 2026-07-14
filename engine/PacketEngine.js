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

import { ArpCache } from '../protocols/arp.js';
import { routeLookup, connectedInterfaceFor } from '../protocols/routing.js';
import { evaluateAcl } from '../protocols/acl.js';
import { DEFAULT_TTL } from '../protocols/ipv4.js';
import { L2Fabric } from './L2Fabric.js';
import { MacTable } from './MacTable.js';
import { computeSpanningTree } from './SpanningTree.js';
import { computeOspf } from '../protocols/ospf.js';

/** @enum {string} */
export const PingReason = Object.freeze({
  OK: 'ok',
  NO_SOURCE_IP: 'no-source-ip',
  DIFFERENT_SUBNET: 'different-subnet',
  DIFFERENT_VLAN: 'different-vlan',
  UNREACHABLE_ARP: 'unreachable-arp',
  NOT_CONNECTED: 'not-connected',
  NO_ROUTE: 'no-route',
  TTL_EXPIRED: 'ttl-expired',
  ACL_DENIED: 'acl-denied',
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
   * The current spanning tree over the switched topology. Recomputed on
   * demand (topologies are small) so it always reflects the latest cabling
   * and bridge priorities; consumed both here (to skip blocked ports) and by
   * `show spanning-tree`.
   * @returns {import('./SpanningTree.js').SpanningTreeResult}
   */
  spanningTree() {
    return computeSpanningTree(this.topology);
  }

  /**
   * The converged OSPF state (neighbors, DR/BDR, learned routes). Recomputed
   * on demand from the current topology; consumed here for forwarding and by
   * `show ip ospf neighbor` / `show ip route`.
   * @returns {import('../protocols/ospf.js').OspfResult}
   */
  ospf() {
    return computeOspf(this.topology, this.fabric);
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
    if (!srcNode.device.interfaces.some((i) => i.enabled && i.ipAddress)) {
      return fail(PingReason.NO_SOURCE_IP);
    }

    // Spanning tree, computed once for this ping, so redundant links between
    // switches don't create looping layer-2 paths.
    const blockedPorts = this.spanningTree().blockedPorts;

    // OSPF routes, computed once, so routers can forward to remote subnets
    // learned dynamically (no static route required).
    const ospfRoutes = this.ospf().routes;

    // Walk the packet hop by hop through routers. Each iteration makes one
    // forwarding decision and delivers the frame across one layer-2 segment
    // to the next hop (a router) or the final destination.
    const fullPath = [srcNodeId];
    let firstSegment = null;
    let firstHopIp = null;
    let current = srcNode;
    let ttl = DEFAULT_TTL;
    const visited = new Set([srcNodeId]);
    let dstIface = null;
    let srcIp = null; // the pinging host's source address (for ACL matching)
    let arrivalIp = null; // IP the packet arrived from (for ingress ACLs)

    // Prevent pathological loops even if TTL logic is bypassed.
    for (let guard = 0; guard < 64; guard += 1) {
      const decision = routeLookup(current.device, dstIp, ospfRoutes.get(current.id) ?? []);
      if (!decision) {
        return fail(current === srcNode ? PingReason.DIFFERENT_SUBNET : PingReason.NO_ROUTE);
      }
      if (srcIp === null) srcIp = decision.egressIface.ipAddress;

      // ACLs are enforced on router interfaces: inbound on the interface the
      // packet arrived on, outbound on the interface it leaves through.
      if (current.device.capabilities.routing) {
        const packet = { protocol: 'icmp', srcIp, dstIp };
        const acls = current.device.config.acls ?? {};
        const ingress = arrivalIp ? connectedInterfaceFor(current.device, arrivalIp) : null;
        if (ingress?.aclIn && !evaluateAcl(acls[ingress.aclIn], packet)) {
          return fail(PingReason.ACL_DENIED);
        }
        if (
          decision.egressIface.aclOut &&
          !evaluateAcl(acls[decision.egressIface.aclOut], packet)
        ) {
          return fail(PingReason.ACL_DENIED);
        }
      }

      const segment = this._deliverSegment(current.id, decision.nextHopIp, blockedPorts);
      if (segment.reason) return fail(segment.reason);

      // Learn MACs on switches within this layer-2 segment.
      this._learnAlongPath(
        segment.path,
        decision.egressIface.mac,
        segment.targetIface.mac,
        segment.vlan,
      );

      if (!firstSegment) {
        firstSegment = segment.path;
        firstHopIp = decision.nextHopIp;
      }
      for (let i = 1; i < segment.path.length; i += 1) fullPath.push(segment.path[i]);

      if (decision.nextHopIp === dstIp) {
        dstIface = segment.targetIface;
        break;
      }

      // Move to the next-hop router. It receives the frame from this device's
      // egress interface, which is what its inbound ACL will match against.
      const nextRouter = segment.ownerNode;
      if (visited.has(nextRouter.id)) return fail(PingReason.NO_ROUTE);
      visited.add(nextRouter.id);
      arrivalIp = decision.egressIface.ipAddress;
      ttl -= 1;
      if (ttl <= 0) return fail(PingReason.TTL_EXPIRED);
      current = nextRouter;
    }

    if (!dstIface) return fail(PingReason.NO_ROUTE);

    // ARP the first hop (host → gateway, or → destination when on-link) if
    // it isn't already resolved in this device's cache.
    const srcCache = this.arpCacheFor(srcNodeId);
    if (!srcCache.has(firstHopIp)) {
      events.push({ kind: 'arp-request', path: firstSegment });
      events.push({ kind: 'arp-reply', path: [...firstSegment].reverse() });
      const firstHopOwner = this._ownerOf(firstHopIp);
      const firstHopIface = firstHopOwner
        ? firstHopOwner.device.interfaces.find((i) => i.enabled && i.ipAddress === firstHopIp)
        : null;
      if (firstHopIface) srcCache.set(firstHopIp, firstHopIface.mac);
    }

    events.push({ kind: 'icmp-request', path: fullPath });
    events.push({ kind: 'icmp-reply', path: [...fullPath].reverse() });

    return {
      success: true,
      reason: PingReason.OK,
      rttMs: Math.max(1, fullPath.length - 1),
      targetMac: dstIface.mac,
      events,
    };
  }

  /**
   * Delivers a frame across one layer-2 segment from `fromNodeId` to whoever
   * owns `targetIp`, returning the node path, the owner node, its receiving
   * interface, and the frame's VLAN — or a failure reason.
   * @param {string} fromNodeId
   * @param {string} targetIp
   * @param {Set<string>|null} [blockedPorts] - STP-blocked `nodeId|port` keys.
   * @returns {{path: string[], ownerNode: object, targetIface: object, vlan: number}|{reason: string}}
   */
  _deliverSegment(fromNodeId, targetIp, blockedPorts = null) {
    const ownerNode = this._ownerOf(targetIp);
    if (!ownerNode) return { reason: PingReason.UNREACHABLE_ARP };

    // The frame's VLAN is set by the ingress access port (host or router side).
    const fromVlan = this.fabric.hostAccessVlan(fromNodeId);
    const toVlan = this.fabric.hostAccessVlan(ownerNode.id);
    if (fromVlan !== null && toVlan !== null && fromVlan !== toVlan) {
      return { reason: PingReason.DIFFERENT_VLAN };
    }
    const vlan = fromVlan ?? toVlan ?? null;

    const path = this.fabric.findPath(fromNodeId, ownerNode.id, { vlan, blockedPorts });
    if (!path) return { reason: PingReason.NOT_CONNECTED };

    const targetIface = ownerNode.device.interfaces.find(
      (i) => i.enabled && i.ipAddress === targetIp,
    );
    return { path, ownerNode, targetIface, vlan: vlan ?? 1 };
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
