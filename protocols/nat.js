/**
 * nat.js
 *
 * Source NAT / PAT — translating private "inside" addresses to a public
 * "outside" address as traffic leaves the inside network. Two flavors, both
 * on the CCNA blueprint:
 *   - static NAT: a fixed inside-local → inside-global mapping;
 *   - PAT (overload): many inside hosts share the outside interface's
 *     address, distinguished (on real gear) by port. A match is driven by an
 *     ACL that selects which inside sources get translated.
 *
 * This module computes the translated source address; the packet engine
 * records the resulting translation so `show ip nat translations` can show
 * it. DOM-free.
 */

/**
 * Computes the translated (inside-global) source address for a packet
 * crossing an inside→outside boundary, or null if no rule applies.
 * @param {import('../devices/Device.js').Device} device
 * @param {object} params
 * @param {string} params.srcIp - the inside-local source.
 * @param {string} params.outsideIfaceIp - the router's outside interface IP.
 * @param {(aclId: string, srcIp: string) => boolean} params.aclPermits -
 *   evaluates whether the NAT ACL selects this source.
 * @returns {{insideGlobal: string, kind: string}|null}
 */
export function translateSource(device, { srcIp, outsideIfaceIp, aclPermits }) {
  const nat = device.config.nat;
  if (!nat) return null;

  // Static mapping wins over dynamic/PAT.
  const staticMap = (nat.staticMaps ?? []).find((m) => m.insideLocal === srcIp);
  if (staticMap) return { insideGlobal: staticMap.insideGlobal, kind: 'static' };

  const dyn = nat.dynamic;
  if (dyn && dyn.overload && aclPermits(dyn.aclId, srcIp)) {
    return { insideGlobal: outsideIfaceIp, kind: 'pat' };
  }
  return null;
}

/**
 * Builds a translation table row in IOS `show ip nat translations` shape.
 * @param {string} protocol
 * @param {string} insideGlobal
 * @param {string} insideLocal
 * @param {string} outsideIp
 * @returns {{protocol: string, insideGlobal: string, insideLocal: string, outsideLocal: string, outsideGlobal: string}}
 */
export function makeTranslation(protocol, insideGlobal, insideLocal, outsideIp) {
  return {
    protocol,
    insideGlobal,
    insideLocal,
    outsideLocal: outsideIp,
    outsideGlobal: outsideIp,
  };
}
