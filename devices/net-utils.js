/**
 * net-utils.js
 *
 * Pure, DOM-free helpers for the two address families the simulator cares
 * about: 48-bit MAC addresses and IPv4. These are deliberately small,
 * dependency-free, and heavily tested — the entire switching/routing/ARP
 * stack from v0.4 onward builds on the correctness of the functions here,
 * so they live in one place rather than being re-implemented per protocol.
 *
 * IPv4 is represented three ways depending on what's convenient:
 *   - dotted string  "192.168.1.1"
 *   - 32-bit integer (unsigned)
 *   - prefix length  /24
 * with converters between them.
 */

// --- MAC addresses -----------------------------------------------------

/**
 * Generates a locally-administered, unicast MAC address as a
 * colon-separated string, e.g. "02:1a:2b:3c:4d:5e".
 *
 * The first octet has the locally-administered bit (0x02) set and the
 * multicast bit (0x01) cleared, so generated addresses never collide with
 * real vendor OUIs and are always valid unicast source addresses.
 *
 * @param {() => number} [rng] - Injectable RNG (defaults to Math.random),
 *   used so tests can produce deterministic addresses.
 * @returns {string}
 */
export function generateMacAddress(rng = Math.random) {
  const octets = new Array(6);
  octets[0] = (Math.floor(rng() * 256) & 0xfe) | 0x02;
  for (let i = 1; i < 6; i += 1) {
    octets[i] = Math.floor(rng() * 256);
  }
  return octets.map((o) => o.toString(16).padStart(2, '0')).join(':');
}

/**
 * @param {string} mac
 * @returns {boolean} true if `mac` is a well-formed colon- or hyphen-
 *   separated 6-octet MAC address.
 */
export function isValidMacAddress(mac) {
  return typeof mac === 'string' && /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(mac);
}

/**
 * Normalizes a MAC to lowercase colon-separated form.
 * @param {string} mac
 * @returns {string}
 */
export function normalizeMacAddress(mac) {
  return mac.toLowerCase().replace(/-/g, ':');
}

// --- IPv4 --------------------------------------------------------------

/**
 * @param {string} ip
 * @returns {boolean} true if `ip` is a syntactically valid dotted-quad IPv4
 *   address with each octet in 0..255.
 */
export function isValidIpv4(ip) {
  if (typeof ip !== 'string') return false;
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const n = Number(part);
    return n >= 0 && n <= 255;
  });
}

/**
 * Converts a dotted-quad IPv4 string to an unsigned 32-bit integer.
 * @param {string} ip
 * @returns {number}
 */
export function ipv4ToInt(ip) {
  if (!isValidIpv4(ip)) throw new Error(`Invalid IPv4 address: ${ip}`);
  return ip.split('.').reduce((acc, part) => (acc << 8) | Number(part), 0) >>> 0;
}

/**
 * Converts an unsigned 32-bit integer to a dotted-quad IPv4 string.
 * @param {number} int
 * @returns {string}
 */
export function intToIpv4(int) {
  const value = int >>> 0;
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff].join(
    '.',
  );
}

/**
 * Validates a subnet mask (must be contiguous 1-bits followed by 0-bits),
 * e.g. 255.255.255.0 is valid, 255.0.255.0 is not.
 * @param {string} mask
 * @returns {boolean}
 */
export function isValidSubnetMask(mask) {
  if (!isValidIpv4(mask)) return false;
  const int = ipv4ToInt(mask);
  // A valid mask has the form 1...10...0. Inverting gives 0...01...1, whose
  // +1 must be a power of two (or zero for /0).
  const inverted = ~int >>> 0;
  return ((inverted + 1) & inverted) === 0;
}

/**
 * Converts a subnet mask (e.g. "255.255.255.0") to a prefix length (24).
 * @param {string} mask
 * @returns {number}
 */
export function maskToPrefix(mask) {
  if (!isValidSubnetMask(mask)) throw new Error(`Invalid subnet mask: ${mask}`);
  let int = ipv4ToInt(mask);
  let prefix = 0;
  while (int & 0x80000000) {
    prefix += 1;
    int = (int << 1) >>> 0;
  }
  return prefix;
}

/**
 * Converts a prefix length (0..32) to a dotted-quad subnet mask.
 * @param {number} prefix
 * @returns {string}
 */
export function prefixToMask(prefix) {
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    throw new Error(`Invalid prefix length: ${prefix}`);
  }
  const int = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return intToIpv4(int);
}

/**
 * Returns the network address for an IP + mask, as a dotted-quad string.
 * @param {string} ip
 * @param {string} mask
 * @returns {string}
 */
export function networkAddress(ip, mask) {
  return intToIpv4((ipv4ToInt(ip) & ipv4ToInt(mask)) >>> 0);
}

/**
 * Returns the directed broadcast address for an IP + mask.
 * @param {string} ip
 * @param {string} mask
 * @returns {string}
 */
export function broadcastAddress(ip, mask) {
  const maskInt = ipv4ToInt(mask);
  return intToIpv4(((ipv4ToInt(ip) & maskInt) | (~maskInt >>> 0)) >>> 0);
}

/**
 * Returns true if two addresses share the same subnet under a given mask —
 * the core test used by routing/ARP to decide "local delivery vs. gateway".
 * @param {string} ipA
 * @param {string} ipB
 * @param {string} mask
 * @returns {boolean}
 */
export function sameSubnet(ipA, ipB, mask) {
  return networkAddress(ipA, mask) === networkAddress(ipB, mask);
}
