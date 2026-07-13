/**
 * Frame.js
 *
 * A layer-2 Ethernet frame: source/destination MAC, an EtherType telling the
 * receiver how to interpret the payload, an optional 802.1Q VLAN tag, and the
 * payload itself (an ARP message or an IPv4 packet). Plain data — the packet
 * engine and protocol handlers read/write these fields directly.
 */

export const EtherType = Object.freeze({
  ARP: 'arp',
  IPV4: 'ipv4',
});

export const BROADCAST_MAC = 'ff:ff:ff:ff:ff:ff';

export class Frame {
  /**
   * @param {object} params
   * @param {string} params.srcMac
   * @param {string} params.dstMac - unicast MAC or `BROADCAST_MAC`.
   * @param {string} params.etherType - one of `EtherType`.
   * @param {object} params.payload - an ArpMessage or IPv4Packet.
   * @param {number|null} [params.vlan] - 802.1Q VLAN id, or null if untagged.
   */
  constructor({ srcMac, dstMac, etherType, payload, vlan = null }) {
    this.srcMac = srcMac;
    this.dstMac = dstMac;
    this.etherType = etherType;
    this.payload = payload;
    this.vlan = vlan;
  }

  /**
   * @returns {boolean}
   */
  isBroadcast() {
    return this.dstMac === BROADCAST_MAC;
  }
}
