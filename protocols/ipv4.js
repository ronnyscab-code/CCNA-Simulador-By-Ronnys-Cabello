/**
 * ipv4.js
 *
 * The layer-3 IPv4 packet model. Carries source/destination addresses, a TTL
 * that routers decrement (and drop at zero, in v0.6+), a protocol tag, and a
 * payload (an ICMP message today; TCP/UDP segments later). Plain data.
 */

export const IpProtocol = Object.freeze({
  ICMP: 'icmp',
  TCP: 'tcp',
  UDP: 'udp',
});

export const DEFAULT_TTL = 64;

export class IPv4Packet {
  /**
   * @param {object} params
   * @param {string} params.srcIp
   * @param {string} params.dstIp
   * @param {string} params.protocol - one of `IpProtocol`.
   * @param {object} params.payload
   * @param {number} [params.ttl]
   */
  constructor({ srcIp, dstIp, protocol, payload, ttl = DEFAULT_TTL }) {
    this.srcIp = srcIp;
    this.dstIp = dstIp;
    this.protocol = protocol;
    this.payload = payload;
    this.ttl = ttl;
  }

  /**
   * Returns a copy with TTL decremented by one — used when a router forwards
   * the packet. Returns null if the TTL would reach zero (packet expired).
   * @returns {IPv4Packet|null}
   */
  decrementTtl() {
    if (this.ttl <= 1) return null;
    return new IPv4Packet({
      srcIp: this.srcIp,
      dstIp: this.dstIp,
      protocol: this.protocol,
      payload: this.payload,
      ttl: this.ttl - 1,
    });
  }
}
