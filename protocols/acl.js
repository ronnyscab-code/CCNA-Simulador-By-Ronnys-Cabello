/**
 * acl.js
 *
 * IPv4 access control lists — the packet filter every CCNA candidate learns.
 * An ACL is an ordered list of permit/deny entries; the first match wins, and
 * there is an implicit `deny any` at the end. Standard ACLs match the source
 * address only; extended ACLs also match protocol and destination.
 *
 * The data model is stored on `device.config.acls` (keyed by ACL number/name)
 * and applied to an interface via `iface.aclIn` / `iface.aclOut`. The packet
 * engine consults `evaluateAcl` as traffic enters/leaves router interfaces.
 *
 * DOM-free.
 */

import { ipv4ToInt } from '../devices/net-utils.js';

export const AclAction = Object.freeze({ PERMIT: 'permit', DENY: 'deny' });

/**
 * Whether an address matches a `source`/`wildcard` pair. A null wildcard (or
 * a `host`/`any` sentinel resolved by the caller) is treated as an exact or
 * full match respectively.
 * @param {string} address
 * @param {string} source - the ACE source address (or "0.0.0.0" for any).
 * @param {string} wildcard - inverse mask ("0.0.0.0" = exact, "255.255.255.255" = any).
 * @returns {boolean}
 */
export function wildcardMatch(address, source, wildcard) {
  const wild = ipv4ToInt(wildcard);
  const mask = ~wild >>> 0; // bits that must match
  return (ipv4ToInt(address) & mask) === (ipv4ToInt(source) & mask);
}

/**
 * Does a single ACE match the packet?
 * @param {object} ace
 * @param {{protocol: string, srcIp: string, dstIp: string}} packet
 * @returns {boolean}
 */
function aceMatches(ace, packet) {
  if (!wildcardMatch(packet.srcIp, ace.srcIp, ace.srcWildcard)) return false;

  if (ace.type === 'extended') {
    // "ip" matches any L3 protocol; otherwise the protocol must equal.
    if (ace.protocol !== 'ip' && ace.protocol !== packet.protocol) return false;
    if (ace.dstIp !== undefined && !wildcardMatch(packet.dstIp, ace.dstIp, ace.dstWildcard)) {
      return false;
    }
  }
  return true;
}

/**
 * Evaluates an ACL against a packet: returns true to permit, false to deny.
 * First match wins; an empty/undefined ACL implicitly denies (matching IOS,
 * where an applied-but-empty ACL drops everything).
 * @param {{entries: object[]}|undefined} acl
 * @param {{protocol: string, srcIp: string, dstIp: string}} packet
 * @returns {boolean}
 */
export function evaluateAcl(acl, packet) {
  if (!acl || !acl.entries || acl.entries.length === 0) return false;
  for (const ace of acl.entries) {
    if (aceMatches(ace, packet)) return ace.action === AclAction.PERMIT;
  }
  return false; // implicit deny any
}

/**
 * Renders an ACL in IOS `show access-lists` style.
 * @param {string|number} id
 * @param {{type: string, entries: object[]}} acl
 * @returns {string[]}
 */
export function renderAcl(id, acl) {
  const kind = acl.type === 'extended' ? 'extended' : 'standard';
  const lines = [`${kind === 'standard' ? 'Standard' : 'Extended'} IP access list ${id}`];
  for (const ace of acl.entries) {
    if (ace.type === 'extended') {
      lines.push(
        `    ${ace.action} ${ace.protocol} ${describeHost(ace.srcIp, ace.srcWildcard)} ${describeHost(ace.dstIp, ace.dstWildcard)}`,
      );
    } else {
      lines.push(`    ${ace.action} ${describeHost(ace.srcIp, ace.srcWildcard)}`);
    }
  }
  return lines;
}

/**
 * @param {string} ip
 * @param {string} wildcard
 * @returns {string}
 */
function describeHost(ip, wildcard) {
  if (ip === '0.0.0.0' && wildcard === '255.255.255.255') return 'any';
  if (wildcard === '0.0.0.0') return `host ${ip}`;
  return `${ip} ${wildcard}`;
}
