/**
 * questions.js
 *
 * The CCNA Trainer question bank. Every question here is ORIGINAL — written
 * from scratch against the publicly published CCNA 200-301 exam blueprint
 * (the topic outline), not copied from Cisco materials or any third-party
 * question dump (ExamTopics, Boson, 9tut, ...). They test understanding of
 * the concepts, and each carries an explanation and a blueprint reference.
 *
 * Question shape:
 *   {
 *     id, domain, difficulty,
 *     prompt,
 *     choices: [{ id, text }],
 *     correct: [choiceId, ...],   // one or more
 *     multi: boolean,             // true = "select all that apply"
 *     explanation, reference
 *   }
 *
 * DOM-free data module.
 */

/** The six CCNA 200-301 blueprint domains. */
export const DOMAINS = Object.freeze({
  FUNDAMENTALS: 'Network Fundamentals',
  ACCESS: 'Network Access',
  CONNECTIVITY: 'IP Connectivity',
  SERVICES: 'IP Services',
  SECURITY: 'Security Fundamentals',
  AUTOMATION: 'Automation & Programmability',
});

export const QUESTIONS = Object.freeze([
  // --- Network Fundamentals ---
  {
    id: 'nf-collision-vs-broadcast',
    domain: DOMAINS.FUNDAMENTALS,
    difficulty: 'Beginner',
    prompt:
      'You replace a hub with a switch. How does this change the collision and broadcast domains for the connected hosts?',
    choices: [
      { id: 'a', text: 'One collision domain, one broadcast domain' },
      { id: 'b', text: 'A separate collision domain per port, still one broadcast domain' },
      { id: 'c', text: 'A separate broadcast domain per port, one collision domain' },
      { id: 'd', text: 'A separate collision and broadcast domain per port' },
    ],
    correct: ['b'],
    multi: false,
    explanation:
      'A switch microsegments the LAN: each port is its own collision domain (full-duplex, no contention). All ports remain in one broadcast domain unless VLANs are configured.',
    reference: '1.0 Network Fundamentals — switching concepts',
  },
  {
    id: 'nf-private-ranges',
    domain: DOMAINS.FUNDAMENTALS,
    difficulty: 'Beginner',
    prompt: 'Which of these addresses are in RFC 1918 private ranges? (Select all that apply.)',
    choices: [
      { id: 'a', text: '10.240.5.1' },
      { id: 'b', text: '172.32.0.10' },
      { id: 'c', text: '192.168.100.7' },
      { id: 'd', text: '172.16.254.9' },
    ],
    correct: ['a', 'c', 'd'],
    multi: true,
    explanation:
      'Private ranges are 10.0.0.0/8, 172.16.0.0/12 (172.16–172.31), and 192.168.0.0/16. 172.32.0.10 is outside the 172.16–172.31 span, so it is public.',
    reference: '1.0 Network Fundamentals — private IPv4 addressing',
  },
  {
    id: 'nf-subnet-hosts',
    domain: DOMAINS.FUNDAMENTALS,
    difficulty: 'Intermediate',
    prompt: 'How many usable host addresses does a /27 subnet provide?',
    choices: [
      { id: 'a', text: '30' },
      { id: 'b', text: '32' },
      { id: 'c', text: '14' },
      { id: 'd', text: '62' },
    ],
    correct: ['a'],
    multi: false,
    explanation:
      'A /27 leaves 5 host bits: 2^5 = 32 addresses, minus the network and broadcast addresses = 30 usable hosts.',
    reference: '1.0 Network Fundamentals — subnetting',
  },
  {
    id: 'nf-tcp-vs-udp',
    domain: DOMAINS.FUNDAMENTALS,
    difficulty: 'Beginner',
    prompt: 'Which statement best distinguishes TCP from UDP?',
    choices: [
      { id: 'a', text: 'TCP is faster because it has no headers' },
      {
        id: 'b',
        text: 'TCP is connection-oriented and retransmits lost segments; UDP is connectionless and does not',
      },
      { id: 'c', text: 'UDP guarantees ordered delivery; TCP does not' },
      { id: 'd', text: 'They are interchangeable at layer 2' },
    ],
    correct: ['b'],
    multi: false,
    explanation:
      'TCP establishes a connection (three-way handshake), sequences bytes, and retransmits loss. UDP is connectionless with no delivery guarantee — lighter weight, used for latency-sensitive traffic.',
    reference: '1.0 Network Fundamentals — transport layer',
  },
  {
    id: 'nf-ipv6-slaac',
    domain: DOMAINS.FUNDAMENTALS,
    difficulty: 'Intermediate',
    prompt:
      'Which IPv6 address type is automatically assigned to every IPv6-enabled interface and is only reachable on the local link?',
    choices: [
      { id: 'a', text: 'Global unicast' },
      { id: 'b', text: 'Unique local' },
      { id: 'c', text: 'Link-local (FE80::/10)' },
      { id: 'd', text: 'Anycast' },
    ],
    correct: ['c'],
    multi: false,
    explanation:
      'Every IPv6 interface forms a link-local address in FE80::/10 automatically. It is used for neighbor discovery and next-hop addressing and is never routed off the link.',
    reference: '1.0 Network Fundamentals — IPv6 addressing',
  },

  // --- Network Access ---
  {
    id: 'na-trunk-native',
    domain: DOMAINS.ACCESS,
    difficulty: 'Intermediate',
    prompt: 'On an 802.1Q trunk, how are frames in the native VLAN transmitted by default?',
    choices: [
      { id: 'a', text: 'Tagged with VLAN 1' },
      { id: 'b', text: 'Untagged' },
      { id: 'c', text: 'Double-tagged' },
      { id: 'd', text: 'Dropped' },
    ],
    correct: ['b'],
    multi: false,
    explanation:
      'The native VLAN is carried untagged across an 802.1Q trunk. A native-VLAN mismatch between the two ends can merge broadcast domains, which is why it should match on both sides.',
    reference: '2.0 Network Access — 802.1Q trunking',
  },
  {
    id: 'na-stp-root',
    domain: DOMAINS.ACCESS,
    difficulty: 'Intermediate',
    prompt: 'How is the STP root bridge elected?',
    choices: [
      { id: 'a', text: 'The switch with the most ports' },
      { id: 'b', text: 'The switch with the lowest bridge ID (priority, then MAC address)' },
      { id: 'c', text: 'The switch with the highest IP address' },
      { id: 'd', text: 'The first switch powered on' },
    ],
    correct: ['b'],
    multi: false,
    explanation:
      'The bridge ID is priority (default 32768) followed by the switch MAC. The lowest bridge ID wins; lowering a switch’s priority is how you deterministically choose the root.',
    reference: '2.0 Network Access — spanning tree',
  },
  {
    id: 'na-access-vs-trunk',
    domain: DOMAINS.ACCESS,
    difficulty: 'Beginner',
    prompt:
      'A PC is plugged into a switch port. Which port mode is appropriate for a single end host in one VLAN?',
    choices: [
      { id: 'a', text: 'Trunk' },
      { id: 'b', text: 'Access' },
      { id: 'c', text: 'Dynamic desirable' },
      { id: 'd', text: 'Routed' },
    ],
    correct: ['b'],
    multi: false,
    explanation:
      'An access port belongs to exactly one VLAN and sends/receives untagged frames — the correct mode for a normal end device. Trunks carry multiple VLANs between switches.',
    reference: '2.0 Network Access — VLANs and access ports',
  },
  {
    id: 'na-portsecurity',
    domain: DOMAINS.ACCESS,
    difficulty: 'Intermediate',
    prompt:
      'What does switchport port-security with the default violation mode do when an unexpected MAC appears?',
    choices: [
      { id: 'a', text: 'Logs the event but keeps forwarding' },
      { id: 'b', text: 'Shuts the port into err-disabled state' },
      { id: 'c', text: 'Reboots the switch' },
      { id: 'd', text: 'Moves the port to VLAN 1' },
    ],
    correct: ['b'],
    multi: false,
    explanation:
      'The default violation mode is shutdown: the port goes err-disabled and must be recovered (shut/no shut or errdisable recovery). Restrict and protect are the less-drastic alternatives.',
    reference: '2.0 Network Access — port security',
  },

  // --- IP Connectivity ---
  {
    id: 'ip-longest-prefix',
    domain: DOMAINS.CONNECTIVITY,
    difficulty: 'Intermediate',
    prompt:
      'A router has routes to 10.1.0.0/16, 10.1.1.0/24, and 0.0.0.0/0. Which is used to forward a packet to 10.1.1.55?',
    choices: [
      { id: 'a', text: '0.0.0.0/0' },
      { id: 'b', text: '10.1.0.0/16' },
      { id: 'c', text: '10.1.1.0/24' },
      { id: 'd', text: 'It load-balances across all three' },
    ],
    correct: ['c'],
    multi: false,
    explanation:
      'Routers forward using the longest-prefix match. 10.1.1.0/24 is more specific than /16 or the default route, so it wins.',
    reference: '3.0 IP Connectivity — routing decision',
  },
  {
    id: 'ip-ad',
    domain: DOMAINS.CONNECTIVITY,
    difficulty: 'Intermediate',
    prompt:
      'Two routes to the same prefix exist: one OSPF, one static. Which does the router install, and why?',
    choices: [
      { id: 'a', text: 'OSPF, because it has a lower metric' },
      {
        id: 'b',
        text: 'The static route, because it has a lower administrative distance (1 vs 110)',
      },
      { id: 'c', text: 'Both, always' },
      { id: 'd', text: 'Whichever was configured last' },
    ],
    correct: ['b'],
    multi: false,
    explanation:
      'When sources differ, administrative distance decides. A static route (AD 1) is preferred over OSPF (AD 110). Metric only breaks ties within the same source.',
    reference: '3.0 IP Connectivity — administrative distance',
  },
  {
    id: 'ip-ospf-neighbor',
    domain: DOMAINS.CONNECTIVITY,
    difficulty: 'Advanced',
    prompt:
      'Which two must match for two OSPF routers to form an adjacency on an Ethernet link? (Select all that apply.)',
    choices: [
      { id: 'a', text: 'Area ID' },
      { id: 'b', text: 'Hostname' },
      { id: 'c', text: 'Subnet / interface must be in the same network' },
      { id: 'd', text: 'Router process ID' },
    ],
    correct: ['a', 'c'],
    multi: true,
    explanation:
      'Neighbors must agree on area, subnet/mask on the link, hello/dead timers, authentication, and area type. The OSPF process ID is locally significant and need not match; hostnames are irrelevant.',
    reference: '3.0 IP Connectivity — OSPF adjacencies',
  },
  {
    id: 'ip-default-route',
    domain: DOMAINS.CONNECTIVITY,
    difficulty: 'Beginner',
    prompt: 'What does the route 0.0.0.0/0 represent?',
    choices: [
      { id: 'a', text: 'The loopback network' },
      { id: 'b', text: 'A default route matching any destination not matched more specifically' },
      { id: 'c', text: 'A blackhole for all traffic' },
      { id: 'd', text: 'The local broadcast' },
    ],
    correct: ['b'],
    multi: false,
    explanation:
      '0.0.0.0/0 is the default route (the "gateway of last resort"). Because it is the least specific prefix, it is used only when nothing more specific matches.',
    reference: '3.0 IP Connectivity — default routing',
  },

  // --- IP Services ---
  {
    id: 'svc-dhcp-dora',
    domain: DOMAINS.SERVICES,
    difficulty: 'Beginner',
    prompt: 'Put the DHCP lease process in order.',
    choices: [
      { id: 'a', text: 'Discover, Offer, Request, Acknowledge' },
      { id: 'b', text: 'Request, Offer, Discover, Acknowledge' },
      { id: 'c', text: 'Offer, Discover, Acknowledge, Request' },
      { id: 'd', text: 'Discover, Request, Offer, Acknowledge' },
    ],
    correct: ['a'],
    multi: false,
    explanation:
      'DHCP follows DORA: the client broadcasts Discover, the server sends an Offer, the client Requests the offered address, and the server Acknowledges the lease.',
    reference: '4.0 IP Services — DHCP',
  },
  {
    id: 'svc-nat-pat',
    domain: DOMAINS.SERVICES,
    difficulty: 'Intermediate',
    prompt: 'How does PAT (NAT overload) let many private hosts share one public IP?',
    choices: [
      { id: 'a', text: 'By assigning each host the same port' },
      {
        id: 'b',
        text: 'By translating source addresses and tracking flows using unique source port numbers',
      },
      { id: 'c', text: 'By encrypting the payload' },
      { id: 'd', text: 'By bridging the private and public subnets' },
    ],
    correct: ['b'],
    multi: false,
    explanation:
      'PAT rewrites the private source IP to the public IP and uses distinct source port numbers to keep each conversation separate in the translation table, so one public address serves many hosts.',
    reference: '4.0 IP Services — NAT/PAT',
  },
  {
    id: 'svc-ntp',
    domain: DOMAINS.SERVICES,
    difficulty: 'Beginner',
    prompt: 'Why is NTP important on network devices?',
    choices: [
      { id: 'a', text: 'It speeds up routing convergence' },
      {
        id: 'b',
        text: 'It synchronizes clocks so logs, certificates, and time-based policies are consistent',
      },
      { id: 'c', text: 'It assigns IP addresses' },
      { id: 'd', text: 'It compresses traffic' },
    ],
    correct: ['b'],
    multi: false,
    explanation:
      'Accurate, synchronized time makes log correlation, certificate validation, and scheduled/time-based ACLs reliable across devices.',
    reference: '4.0 IP Services — NTP',
  },

  // --- Security Fundamentals ---
  {
    id: 'sec-acl-order',
    domain: DOMAINS.SECURITY,
    difficulty: 'Intermediate',
    prompt: 'What happens at the end of every IPv4 access control list?',
    choices: [
      { id: 'a', text: 'An implicit permit any' },
      { id: 'b', text: 'An implicit deny any' },
      { id: 'c', text: 'The list loops back to the top' },
      { id: 'd', text: 'The packet is logged and permitted' },
    ],
    correct: ['b'],
    multi: false,
    explanation:
      'Every ACL ends with an implicit "deny any". If no earlier statement matches, the packet is dropped — which is why an ACL with only deny statements blocks everything.',
    reference: '5.0 Security Fundamentals — ACLs',
  },
  {
    id: 'sec-aaa',
    domain: DOMAINS.SECURITY,
    difficulty: 'Beginner',
    prompt: 'In AAA, what does the first "A" (Authentication) establish?',
    choices: [
      { id: 'a', text: 'What the user is allowed to do' },
      { id: 'b', text: 'Who the user is' },
      { id: 'c', text: 'A record of what the user did' },
      { id: 'd', text: 'The bandwidth allotted to the user' },
    ],
    correct: ['b'],
    multi: false,
    explanation:
      'Authentication verifies identity (who you are). Authorization decides what you may do; Accounting records what you did.',
    reference: '5.0 Security Fundamentals — AAA',
  },
  {
    id: 'sec-dhcp-snooping',
    domain: DOMAINS.SECURITY,
    difficulty: 'Advanced',
    prompt: 'DHCP snooping mitigates rogue DHCP servers by doing what?',
    choices: [
      { id: 'a', text: 'Encrypting DHCP messages' },
      { id: 'b', text: 'Only allowing DHCP server replies on ports marked trusted' },
      { id: 'c', text: 'Disabling DHCP entirely' },
      { id: 'd', text: 'Assigning static IPs to all hosts' },
    ],
    correct: ['b'],
    multi: false,
    explanation:
      'DHCP snooping classifies ports as trusted or untrusted and drops server-sourced messages (OFFER/ACK) arriving on untrusted ports, blocking rogue DHCP servers.',
    reference: '5.0 Security Fundamentals — layer 2 security',
  },

  // --- Automation & Programmability ---
  {
    id: 'auto-controller',
    domain: DOMAINS.AUTOMATION,
    difficulty: 'Intermediate',
    prompt: 'In a controller-based (SDN) architecture, what is centralized on the controller?',
    choices: [
      { id: 'a', text: 'The data plane (packet forwarding)' },
      { id: 'b', text: 'The control plane (forwarding decisions/policy)' },
      { id: 'c', text: 'The physical cabling' },
      { id: 'd', text: 'The power supply' },
    ],
    correct: ['b'],
    multi: false,
    explanation:
      'SDN separates planes and centralizes the control plane on a controller, which programs the devices’ data planes (often via a southbound API), enabling consistent, policy-driven configuration.',
    reference: '6.0 Automation — controller-based networking',
  },
  {
    id: 'auto-rest-json',
    domain: DOMAINS.AUTOMATION,
    difficulty: 'Beginner',
    prompt: 'Which data format is most commonly used in REST APIs for network automation?',
    choices: [
      { id: 'a', text: 'JSON' },
      { id: 'b', text: 'A binary routing table dump' },
      { id: 'c', text: 'PostScript' },
      { id: 'd', text: 'A packet capture' },
    ],
    correct: ['a'],
    multi: false,
    explanation:
      'REST APIs typically exchange JSON (and sometimes XML/YAML). JSON’s key/value structure maps cleanly to configuration and state data.',
    reference: '6.0 Automation — data formats and APIs',
  },
  {
    id: 'auto-idempotent',
    domain: DOMAINS.AUTOMATION,
    difficulty: 'Advanced',
    prompt: 'A configuration tool is "idempotent." What does that mean?',
    choices: [
      { id: 'a', text: 'It runs only once and then deletes itself' },
      {
        id: 'b',
        text: 'Applying the same configuration repeatedly yields the same end state without extra changes',
      },
      { id: 'c', text: 'It requires a reboot after every run' },
      { id: 'd', text: 'It randomizes device settings' },
    ],
    correct: ['b'],
    multi: false,
    explanation:
      'Idempotency means re-running a playbook/config converges to the desired state and makes no changes if the device is already compliant — a core property of tools like Ansible.',
    reference: '6.0 Automation — configuration management',
  },
]);

/**
 * @returns {string[]} the distinct domains present in the bank.
 */
export function domainsInBank() {
  return [...new Set(QUESTIONS.map((q) => q.domain))];
}
