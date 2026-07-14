/**
 * dhcp.js
 *
 * A compact DHCP allocator. A router (or server) hosts one or more address
 * pools (`ip dhcp pool`); a client interface set to `ip address dhcp` asks
 * for a lease. Because the simulator has full topology visibility, the
 * DORA exchange is collapsed into a direct allocation: find a reachable
 * server whose pool covers the client's segment, pick the next free host
 * address, and hand back the address plus gateway/DNS.
 *
 * DOM-free. Allocation state (which addresses are taken) is derived from the
 * live topology each time, so it always reflects current assignments.
 */

import {
  ipv4ToInt,
  intToIpv4,
  networkAddress,
  broadcastAddress,
  sameSubnet,
} from '../devices/net-utils.js';

/**
 * @param {string} ip
 * @param {{lo: string, hi: string}} range
 * @returns {boolean}
 */
function inRange(ip, range) {
  const v = ipv4ToInt(ip);
  return v >= ipv4ToInt(range.lo) && v <= ipv4ToInt(range.hi);
}

/**
 * Returns the first free host address in a pool, or null if the pool is
 * exhausted. Skips the network and broadcast addresses, anything already in
 * use, excluded ranges, and explicitly reserved addresses (e.g. the gateway).
 * @param {{network: string, mask: string}} pool
 * @param {Set<string>} used
 * @param {Array<{lo: string, hi: string}>} excluded
 * @param {string[]} reserved
 * @returns {string|null}
 */
export function nextFreeAddress(pool, used, excluded = [], reserved = []) {
  const network = networkAddress(pool.network, pool.mask);
  const broadcast = broadcastAddress(pool.network, pool.mask);
  const first = ipv4ToInt(network) + 1;
  const last = ipv4ToInt(broadcast) - 1;
  const reservedSet = new Set(reserved);

  for (let n = first; n <= last; n += 1) {
    const candidate = intToIpv4(n);
    if (used.has(candidate) || reservedSet.has(candidate)) continue;
    if (excluded.some((r) => inRange(candidate, r))) continue;
    return candidate;
  }
  return null;
}

/**
 * Finds a pool on `serverDevice` that serves the given subnet, plus the
 * server's own interface address on that subnet (used as a reserved address).
 * @param {import('../devices/Device.js').Device} serverDevice
 * @returns {Array<{name: string, pool: object, serverIp: string}>}
 */
export function poolsServedBy(serverDevice) {
  const result = [];
  const pools = serverDevice.config.dhcpPools ?? {};
  for (const [name, pool] of Object.entries(pools)) {
    if (!pool.network || !pool.mask) continue;
    const serverIface = serverDevice.interfaces.find(
      (i) => i.enabled && i.ipAddress && sameSubnet(i.ipAddress, pool.network, pool.mask),
    );
    result.push({ name, pool, serverIp: serverIface?.ipAddress ?? null });
  }
  return result;
}
