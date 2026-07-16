/**
 * generatedQuestions.js
 *
 * A large, ORIGINAL practice pool built programmatically. Nothing here is
 * copied from Cisco courseware or any third-party question dump — every item
 * is a subnetting / addressing problem whose correct answer is COMPUTED from
 * `devices/net-utils.js`, so the answer key is provably right rather than
 * hand-transcribed. Distractors are generated to be plausible-but-wrong and
 * are guaranteed distinct from the key.
 *
 * Generation is deterministic (a fixed-seed PRNG), so the pool — including
 * every question id and the position of the correct choice — is stable across
 * reloads and test runs. That stability is what lets spaced-repetition track
 * a card over time.
 *
 * DOM-free data module. Consumed alongside the curated `QUESTIONS` bank.
 */

import { DOMAINS } from './questions.js';
import {
  intToIpv4,
  ipv4ToInt,
  prefixToMask,
  networkAddress,
  broadcastAddress,
} from '../devices/net-utils.js';

const REFERENCE = '1.0 Network Fundamentals — IPv4 addressing & subnetting';

// --- deterministic PRNG (mulberry32) ------------------------------------

/**
 * @param {number} seed
 * @returns {() => number} a deterministic RNG in [0, 1).
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher–Yates shuffle driven by a supplied RNG (deterministic).
 * @param {any[]} arr
 * @param {() => number} rng
 * @returns {any[]} the same array, shuffled in place.
 */
function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const LETTERS = ['a', 'b', 'c', 'd', 'e'];

/**
 * Assembles a single-answer multiple-choice question. Distractors are
 * de-duplicated and any that collide with the key are dropped; the choices
 * are then shuffled so the key isn't always in the same slot.
 * @param {object} spec
 * @param {() => number} rng
 * @returns {object|null} a well-formed question, or null if it couldn't be
 *   built with at least two distinct choices (caller skips nulls).
 */
function mcq(spec, rng) {
  const { id, prompt, correct, distractors, explanation } = spec;
  const domain = spec.domain ?? DOMAINS.FUNDAMENTALS;
  const difficulty = spec.difficulty ?? 'Beginner';
  const reference = spec.reference ?? REFERENCE;

  const correctText = String(correct);
  const seen = new Set([correctText]);
  const options = [correctText];
  for (const d of distractors) {
    const text = String(d);
    if (!seen.has(text)) {
      seen.add(text);
      options.push(text);
    }
    if (options.length >= 4) break;
  }
  if (options.length < 2) return null;

  shuffle(options, rng);
  const choices = options.map((text, i) => ({ id: LETTERS[i], text }));
  const correctId = choices.find((c) => c.text === correctText).id;

  return {
    id,
    domain,
    difficulty,
    prompt,
    choices,
    correct: [correctId],
    multi: false,
    explanation,
    reference,
    generated: true,
  };
}

/**
 * @param {number} prefix
 * @returns {number} usable host addresses in a /prefix (network + broadcast
 *   removed). Valid for prefixes 1..30.
 */
function usableHosts(prefix) {
  return 2 ** (32 - prefix) - 2;
}

/**
 * A pool of "interesting" host IPs (private + a few public) whose octets are
 * chosen so network/broadcast math is non-trivial. Deterministic.
 * @param {() => number} rng
 * @param {number} n
 * @returns {string[]}
 */
function sampleIps(rng, n) {
  const ips = [];
  for (let i = 0; i < n; i += 1) {
    const kind = Math.floor(rng() * 3);
    let a;
    let b;
    if (kind === 0) {
      a = 10;
      b = Math.floor(rng() * 256);
    } else if (kind === 1) {
      a = 172;
      b = 16 + Math.floor(rng() * 16);
    } else {
      a = 192;
      b = 168;
    }
    const c = Math.floor(rng() * 256);
    const d = 1 + Math.floor(rng() * 254);
    ips.push(`${a}.${b}.${c}.${d}`);
  }
  return ips;
}

// --- families -----------------------------------------------------------

/** How many usable hosts does a /prefix provide? */
function hostsPerPrefix(rng) {
  const out = [];
  for (let p = 8; p <= 30; p += 1) {
    const correct = usableHosts(p);
    const q = mcq(
      {
        id: `gen-hosts-${p}`,
        difficulty: p >= 24 ? 'Beginner' : 'Intermediate',
        prompt: `How many usable host addresses does a /${p} subnet provide?`,
        correct,
        distractors: [2 ** (32 - p), correct - 1, usableHosts(p - 1), usableHosts(p + 1)],
        explanation: `A /${p} leaves ${32 - p} host bits, so 2^${32 - p} − 2 = ${correct} usable addresses (the all-zeros network and all-ones broadcast are not assignable).`,
      },
      rng,
    );
    if (q) out.push(q);
  }
  return out;
}

/** What dotted-decimal mask matches a /prefix? */
function maskForPrefix(rng) {
  const out = [];
  for (let p = 8; p <= 30; p += 1) {
    const correct = prefixToMask(p);
    const q = mcq(
      {
        id: `gen-mask-${p}`,
        prompt: `Which subnet mask corresponds to the prefix /${p}?`,
        correct,
        distractors: [prefixToMask(p + 1), prefixToMask(p - 1), prefixToMask(p + 2)],
        explanation: `/${p} sets the first ${p} bits, which in dotted-decimal is ${correct}.`,
      },
      rng,
    );
    if (q) out.push(q);
  }
  return out;
}

/** What prefix length matches a dotted-decimal mask? */
function prefixForMask(rng) {
  const out = [];
  for (let p = 8; p <= 30; p += 1) {
    const mask = prefixToMask(p);
    const q = mcq(
      {
        id: `gen-prefix-${p}`,
        prompt: `Written as a prefix length, what is the mask ${mask}?`,
        correct: `/${p}`,
        distractors: [`/${p + 1}`, `/${p - 1}`, `/${p + 2}`],
        explanation: `${mask} sets ${p} contiguous 1-bits, i.e. /${p}.`,
      },
      rng,
    );
    if (q) out.push(q);
  }
  return out;
}

/** What is the ACL/OSPF wildcard mask for a /prefix? */
function wildcardForPrefix(rng) {
  const out = [];
  for (let p = 8; p <= 30; p += 1) {
    const maskInt = ipv4ToInt(prefixToMask(p));
    const correct = intToIpv4(~maskInt >>> 0);
    const q = mcq(
      {
        id: `gen-wildcard-${p}`,
        domain: DOMAINS.CONNECTIVITY,
        difficulty: 'Intermediate',
        prompt: `In an ACL or OSPF network statement, what wildcard mask matches a /${p} (${prefixToMask(p)})?`,
        correct,
        distractors: [
          prefixToMask(p),
          intToIpv4(~ipv4ToInt(prefixToMask(p + 1)) >>> 0),
          intToIpv4(~ipv4ToInt(prefixToMask(p - 1)) >>> 0),
        ],
        explanation: `A wildcard mask is the bitwise inverse of the subnet mask. The inverse of ${prefixToMask(p)} is ${correct}.`,
        reference: '5.0 / 3.0 — wildcard masks (ACLs, OSPF)',
      },
      rng,
    );
    if (q) out.push(q);
  }
  return out;
}

/** Borrowing N bits yields how many subnets? */
function subnetsFromBits(rng) {
  const out = [];
  for (let bits = 1; bits <= 12; bits += 1) {
    const correct = 2 ** bits;
    const q = mcq(
      {
        id: `gen-subnets-${bits}`,
        prompt: `If you borrow ${bits} bit${bits === 1 ? '' : 's'} for subnetting, how many subnets can you create?`,
        correct,
        distractors: [2 ** bits - 2, 2 ** (bits - 1), 2 ** (bits + 1)],
        explanation: `Borrowing ${bits} bits gives 2^${bits} = ${correct} subnets (classless subnetting counts all subnet values).`,
      },
      rng,
    );
    if (q) out.push(q);
  }
  return out;
}

/** Given a host IP and prefix, what is the network address? */
function networkAddressQuestions(rng, count) {
  const out = [];
  const ips = sampleIps(rng, count);
  ips.forEach((ip, i) => {
    const p = 24 - (i % 9); // prefixes /16../24
    const mask = prefixToMask(p);
    const correct = networkAddress(ip, mask);
    const q = mcq(
      {
        id: `gen-net-${i}`,
        difficulty: p >= 24 ? 'Beginner' : 'Intermediate',
        prompt: `Host ${ip} has mask ${mask} (/${p}). What is its network (subnet) address?`,
        correct,
        distractors: [ip, broadcastAddress(ip, mask), networkAddress(ip, prefixToMask(p + 1))],
        explanation: `AND-ing ${ip} with ${mask} clears the ${32 - p} host bits, giving the network address ${correct}.`,
      },
      rng,
    );
    if (q) out.push(q);
  });
  return out;
}

/** Given a host IP and prefix, what is the broadcast address? */
function broadcastAddressQuestions(rng, count) {
  const out = [];
  const ips = sampleIps(rng, count);
  ips.forEach((ip, i) => {
    const p = 23 - (i % 8); // prefixes /16../23
    const mask = prefixToMask(p);
    const correct = broadcastAddress(ip, mask);
    const q = mcq(
      {
        id: `gen-bcast-${i}`,
        difficulty: 'Intermediate',
        prompt: `Host ${ip} has mask ${mask} (/${p}). What is the subnet's broadcast address?`,
        correct,
        distractors: [networkAddress(ip, mask), ip, broadcastAddress(ip, prefixToMask(p + 1))],
        explanation: `Setting all ${32 - p} host bits to 1 (keeping the network bits of ${ip}) gives the broadcast address ${correct}.`,
      },
      rng,
    );
    if (q) out.push(q);
  });
  return out;
}

/** Given a subnet, what are the first and last usable host addresses? */
function hostRangeQuestions(rng, count) {
  const out = [];
  const ips = sampleIps(rng, count);
  ips.forEach((ip, i) => {
    const p = 24 + (i % 5); // /24../28
    const mask = prefixToMask(p);
    const net = networkAddress(ip, mask);
    const bcast = broadcastAddress(ip, mask);
    const first = intToIpv4(ipv4ToInt(net) + 1);
    const last = intToIpv4(ipv4ToInt(bcast) - 1);
    const q = mcq(
      {
        id: `gen-range-${i}`,
        difficulty: 'Intermediate',
        prompt: `For the subnet ${net}/${p}, what is the range of usable host addresses?`,
        correct: `${first} – ${last}`,
        distractors: [`${net} – ${bcast}`, `${net} – ${last}`, `${first} – ${bcast}`],
        explanation: `The network address (${net}) and broadcast (${bcast}) are not assignable, so usable hosts run ${first} through ${last}.`,
      },
      rng,
    );
    if (q) out.push(q);
  });
  return out;
}

/** Which network does a given host belong to? */
function belongsToSubnetQuestions(rng, count) {
  const out = [];
  const ips = sampleIps(rng, count);
  ips.forEach((ip, i) => {
    const p = 26 - (i % 4); // /23../26
    const mask = prefixToMask(p);
    const correct = `${networkAddress(ip, mask)}/${p}`;
    const q = mcq(
      {
        id: `gen-belongs-${i}`,
        difficulty: 'Intermediate',
        prompt: `Which subnet contains the host ${ip} when the mask is ${mask} (/${p})?`,
        correct,
        distractors: [
          `${networkAddress(ip, prefixToMask(p + 1))}/${p}`,
          `${ip}/${p}`,
          `${broadcastAddress(ip, mask)}/${p}`,
        ],
        explanation: `${ip} AND ${mask} = ${networkAddress(ip, mask)}, so the host lives in ${correct}.`,
      },
      rng,
    );
    if (q) out.push(q);
  });
  return out;
}

/** Are two hosts in the same subnet under a given mask? */
function sameSubnetQuestions(rng, count) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const p = 24 + (i % 4); // /24../27
    const mask = prefixToMask(p);
    const [base] = sampleIps(rng, 1);
    const net = ipv4ToInt(networkAddress(base, mask));
    const hostBits = 32 - p;
    const size = 2 ** hostBits;
    // Half the time build a partner in the same subnet, half in the next one.
    const together = i % 2 === 0;
    const offset = together ? 1 + Math.floor(rng() * (size - 2)) : size + 1;
    const partner = intToIpv4((net + offset) >>> 0);
    const correct = together ? 'Sí, están en la misma subred' : 'No, están en subredes distintas';
    const q = mcq(
      {
        id: `gen-same-${i}`,
        difficulty: 'Intermediate',
        prompt: `With mask ${mask} (/${p}), are ${base} and ${partner} in the same subnet?`,
        correct,
        distractors: [
          together ? 'No, están en subredes distintas' : 'Sí, están en la misma subred',
        ],
        explanation: `Comparing the network portions: ${base} → ${networkAddress(base, mask)} and ${partner} → ${networkAddress(partner, mask)}. They ${together ? 'match, so the hosts share a subnet' : 'differ, so the hosts are on different subnets'}.`,
      },
      rng,
    );
    if (q) out.push(q);
  }
  return out;
}

/** Classify a given IPv4 address (private/public/special-use). */
function classifyAddressQuestions(rng) {
  const items = [
    ['10.0.0.1', 'Privada (RFC 1918)'],
    ['10.255.255.254', 'Privada (RFC 1918)'],
    ['172.16.0.1', 'Privada (RFC 1918)'],
    ['172.31.255.1', 'Privada (RFC 1918)'],
    ['192.168.1.1', 'Privada (RFC 1918)'],
    ['172.15.0.1', 'Pública'],
    ['172.32.0.1', 'Pública'],
    ['8.8.8.8', 'Pública'],
    ['200.1.1.1', 'Pública'],
    ['1.1.1.1', 'Pública'],
    ['127.0.0.1', 'Loopback'],
    ['127.255.255.255', 'Loopback'],
    ['169.254.10.5', 'APIPA (link-local)'],
    ['169.254.0.1', 'APIPA (link-local)'],
    ['224.0.0.5', 'Multicast'],
    ['239.1.1.1', 'Multicast'],
    ['255.255.255.255', 'Broadcast limitado'],
  ];
  const allLabels = [
    'Privada (RFC 1918)',
    'Pública',
    'Loopback',
    'APIPA (link-local)',
    'Multicast',
    'Broadcast limitado',
  ];
  const out = [];
  items.forEach(([ip, label], i) => {
    const distractors = shuffle(
      allLabels.filter((l) => l !== label),
      rng,
    ).slice(0, 3);
    const q = mcq(
      {
        id: `gen-class-${i}`,
        prompt: `How is the IPv4 address ${ip} best classified?`,
        correct: label,
        distractors,
        explanation: `${ip} falls in the ${label} category by its defined range.`,
      },
      rng,
    );
    if (q) out.push(q);
  });
  return out;
}

// --- assembly -----------------------------------------------------------

/**
 * Builds the full generated pool. Each family gets its own seeded RNG so the
 * output is deterministic and families don't perturb each other.
 * @returns {object[]}
 */
function buildGenerated() {
  return [
    ...hostsPerPrefix(mulberry32(1001)),
    ...maskForPrefix(mulberry32(1002)),
    ...prefixForMask(mulberry32(1003)),
    ...wildcardForPrefix(mulberry32(1004)),
    ...subnetsFromBits(mulberry32(1005)),
    ...networkAddressQuestions(mulberry32(1006), 92),
    ...broadcastAddressQuestions(mulberry32(1007), 92),
    ...hostRangeQuestions(mulberry32(1008), 70),
    ...belongsToSubnetQuestions(mulberry32(1009), 70),
    ...sameSubnetQuestions(mulberry32(1010), 60),
    ...classifyAddressQuestions(mulberry32(1011)),
  ];
}

/** The generated, computed-answer practice pool (frozen, stable). */
export const GENERATED_QUESTIONS = Object.freeze(buildGenerated());
