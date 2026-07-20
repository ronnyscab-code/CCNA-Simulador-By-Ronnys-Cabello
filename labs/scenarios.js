/**
 * scenarios.js
 *
 * The troubleshooting scenario catalog. Each scenario ships a deliberately
 * broken topology (`createTopology`) plus the checks that define "fixed",
 * hints, and an explanation shown on success. Authored scenarios cover the
 * core CCNA fault types; `generateAddressingScenarios` produces a family of
 * parametric connectivity drills so the catalog can grow into the hundreds
 * without hand-writing each one.
 *
 * DOM-free. Consumed by `scenarios/ScenarioEngine.js` and the Labs UI.
 */

import { TopologyBuilder } from './builders.js';
import {
  pingSucceeds,
  pingFails,
  interfaceEnabled,
  interfaceHasIp,
  defaultGatewayIs,
  accessVlanIs,
  ospfNeighborUp,
} from '../scenarios/checks.js';

const MASK24 = '255.255.255.0';
const MASK30 = '255.255.255.252';

/**
 * 1 — A shut-down router interface breaks connectivity between two subnets.
 */
function shutdownInterface() {
  return {
    id: 'shutdown-interface',
    title: 'The interface that went dark',
    difficulty: 'Beginner',
    objective: 'Get PC1 (192.168.1.10) to ping PC2 (192.168.2.10).',
    description:
      'R1 routes between two LANs, but PC1 cannot reach PC2. The addressing is correct — something is administratively down.',
    createTopology() {
      const b = new TopologyBuilder();
      b.pc('pc1', 'PC1', { x: 120, y: 200 })
        .router('r1', 'R1', { x: 360, y: 200 })
        .pc('pc2', 'PC2', { x: 600, y: 200 });
      b.link('pc1', 'FastEthernet0', 'r1', 'GigabitEthernet0/0');
      b.link('r1', 'GigabitEthernet0/1', 'pc2', 'FastEthernet0');
      b.ip('pc1', 'FastEthernet0', '192.168.1.10', MASK24).gateway('pc1', '192.168.1.1');
      b.ip('pc2', 'FastEthernet0', '192.168.2.10', MASK24).gateway('pc2', '192.168.2.1');
      b.ip('r1', 'GigabitEthernet0/0', '192.168.1.1', MASK24);
      // The fault: the LAN toward PC2 is shut down.
      b.ip('r1', 'GigabitEthernet0/1', '192.168.2.1', MASK24, { enabled: false });
      return b.build();
    },
    checks: [
      interfaceEnabled('R1', 'GigabitEthernet0/1', { points: 1 }),
      pingSucceeds('PC1', '192.168.2.10', { points: 2 }),
    ],
    hints: [
      'Check the status of R1’s interfaces — one LAN is unreachable.',
      'On R1: interface GigabitEthernet0/1, then `no shutdown`.',
    ],
    explanation:
      'R1 had the correct IP on Gi0/1 but the port was administratively down. `no shutdown` brings the interface (and the directly-connected route to 192.168.2.0/24) up, restoring end-to-end reachability.',
  };
}

/**
 * 2 — A router interface is missing its IP address.
 */
function missingIpAddress() {
  return {
    id: 'missing-ip-address',
    title: 'The gateway with no address',
    difficulty: 'Beginner',
    objective: 'Restore connectivity so PC1 can ping PC2 (192.168.2.10).',
    description:
      'PC1’s default gateway should be 192.168.1.1 on R1, but R1’s LAN interface toward PC1 has no IP configured.',
    createTopology() {
      const b = new TopologyBuilder();
      b.pc('pc1', 'PC1', { x: 120, y: 200 })
        .router('r1', 'R1', { x: 360, y: 200 })
        .pc('pc2', 'PC2', { x: 600, y: 200 });
      b.link('pc1', 'FastEthernet0', 'r1', 'GigabitEthernet0/0');
      b.link('r1', 'GigabitEthernet0/1', 'pc2', 'FastEthernet0');
      b.ip('pc1', 'FastEthernet0', '192.168.1.10', MASK24).gateway('pc1', '192.168.1.1');
      b.ip('pc2', 'FastEthernet0', '192.168.2.10', MASK24).gateway('pc2', '192.168.2.1');
      // The fault: Gi0/0 is up but unaddressed.
      b.ip('r1', 'GigabitEthernet0/0', null, null, { enabled: true });
      b.ip('r1', 'GigabitEthernet0/1', '192.168.2.1', MASK24);
      return b.build();
    },
    checks: [
      interfaceHasIp('R1', 'GigabitEthernet0/0', '192.168.1.1', MASK24, { points: 1 }),
      pingSucceeds('PC1', '192.168.2.10', { points: 2 }),
    ],
    hints: [
      'PC1’s gateway is 192.168.1.1 — does any interface actually own that address?',
      'On R1: interface GigabitEthernet0/0, then `ip address 192.168.1.1 255.255.255.0`.',
    ],
    explanation:
      'Without an IP on Gi0/0, R1 had no route to 192.168.1.0/24 and no gateway for PC1 to use. Assigning 192.168.1.1/24 creates the connected route and the working default gateway.',
  };
}

/**
 * 3 — Two hosts that should share a VLAN are split across two.
 */
function vlanMismatch() {
  return {
    id: 'vlan-mismatch',
    title: 'Same subnet, different VLAN',
    difficulty: 'Intermediate',
    objective: 'Let PC1 and PC2 (same subnet) reach each other again.',
    description:
      'PC1 and PC2 are both in 192.168.10.0/24 on SW1, yet they can’t ping. Their switch ports disagree about which VLAN they belong to.',
    createTopology() {
      const b = new TopologyBuilder();
      b.pc('pc1', 'PC1', { x: 120, y: 160 })
        .switch('sw1', 'SW1', { x: 360, y: 260 })
        .pc('pc2', 'PC2', { x: 600, y: 160 });
      b.link('pc1', 'FastEthernet0', 'sw1', 'FastEthernet0/1');
      b.link('pc2', 'FastEthernet0', 'sw1', 'FastEthernet0/2');
      b.ip('pc1', 'FastEthernet0', '192.168.10.11', MASK24);
      b.ip('pc2', 'FastEthernet0', '192.168.10.12', MASK24);
      b.accessVlan('sw1', 'FastEthernet0/1', 10);
      // The fault: PC2’s port is in the wrong VLAN.
      b.accessVlan('sw1', 'FastEthernet0/2', 20);
      return b.build();
    },
    checks: [
      accessVlanIs('SW1', 'FastEthernet0/2', 10, { points: 1 }),
      pingSucceeds('PC1', '192.168.10.12', { points: 2 }),
    ],
    hints: [
      'Compare the access VLAN of the two switch ports with `show vlan brief`.',
      'On SW1: interface FastEthernet0/2, then `switchport access vlan 10`.',
    ],
    explanation:
      'Access ports only forward within their own VLAN. PC2’s port was in VLAN 20 while PC1’s was in VLAN 10, so their frames never met. Moving Fa0/2 back to VLAN 10 reunites them in one broadcast domain.',
  };
}

/**
 * 4 — OSPF is missing a network statement, so a remote subnet isn't learned.
 */
function ospfMissingNetwork() {
  return {
    id: 'ospf-missing-network',
    title: 'The subnet OSPF forgot',
    difficulty: 'Intermediate',
    objective: 'Make PC1 able to ping PC2 (192.168.2.10) using OSPF.',
    description:
      'R1 and R2 run OSPF and are neighbors, but PC1 still can’t reach PC2. R2 isn’t advertising the LAN that PC2 lives on.',
    createTopology() {
      const b = new TopologyBuilder();
      b.pc('pc1', 'PC1', { x: 100, y: 220 })
        .router('r1', 'R1', { x: 300, y: 220 })
        .router('r2', 'R2', { x: 540, y: 220 })
        .pc('pc2', 'PC2', { x: 760, y: 220 });
      b.link('pc1', 'FastEthernet0', 'r1', 'GigabitEthernet0/0');
      b.link('r1', 'GigabitEthernet0/1', 'r2', 'GigabitEthernet0/0');
      b.link('r2', 'GigabitEthernet0/1', 'pc2', 'FastEthernet0');
      b.ip('pc1', 'FastEthernet0', '192.168.1.10', MASK24).gateway('pc1', '192.168.1.1');
      b.ip('pc2', 'FastEthernet0', '192.168.2.10', MASK24).gateway('pc2', '192.168.2.1');
      b.ip('r1', 'GigabitEthernet0/0', '192.168.1.1', MASK24);
      b.ip('r1', 'GigabitEthernet0/1', '10.0.0.1', '255.255.255.252');
      b.ip('r2', 'GigabitEthernet0/0', '10.0.0.2', '255.255.255.252');
      b.ip('r2', 'GigabitEthernet0/1', '192.168.2.1', MASK24);
      b.ospf('r1', 1, [
        { address: '192.168.1.0', wildcard: '0.0.0.255', area: 0 },
        { address: '10.0.0.0', wildcard: '0.0.0.3', area: 0 },
      ]);
      // The fault: R2 advertises the transit link but NOT its 192.168.2.0 LAN.
      b.ospf('r2', 1, [{ address: '10.0.0.0', wildcard: '0.0.0.3', area: 0 }]);
      return b.build();
    },
    checks: [
      ospfNeighborUp('R1', { points: 1 }),
      pingSucceeds('PC1', '192.168.2.10', { points: 2 }),
    ],
    hints: [
      'R1 and R2 are neighbors — but does R1’s routing table have 192.168.2.0/24?',
      'On R2: router ospf 1, then `network 192.168.2.0 0.0.0.255 area 0`.',
    ],
    explanation:
      'OSPF only advertises subnets covered by a `network` statement. R2’s LAN (192.168.2.0/24) wasn’t advertised, so R1 never learned a route to it. Adding the network statement floods the LSA and R1 installs the O route.',
  };
}

/**
 * 5 — Restrict access with an ACL: block the guest, allow the trusted PC.
 */
function aclRestrictGuest() {
  return {
    id: 'acl-restrict-guest',
    title: 'Keep the guest out',
    difficulty: 'Advanced',
    objective:
      'On R1, block GUEST (192.168.1.66) from reaching the server while PC1 (192.168.1.10) still can.',
    description:
      'Both PC1 and a GUEST laptop share the office LAN and can currently reach the 192.168.2.10 server. Policy says the guest must be blocked — apply an access list on R1 so PC1 still works but the guest does not.',
    createTopology() {
      const b = new TopologyBuilder();
      b.pc('pc1', 'PC1', { x: 100, y: 140 })
        .pc('guest', 'GUEST', { x: 100, y: 300 })
        .switch('sw1', 'SW1', { x: 320, y: 220 })
        .router('r1', 'R1', { x: 540, y: 220 })
        .pc('srv', 'SERVER', { x: 760, y: 220 });
      b.link('pc1', 'FastEthernet0', 'sw1', 'FastEthernet0/1');
      b.link('guest', 'FastEthernet0', 'sw1', 'FastEthernet0/2');
      b.link('sw1', 'FastEthernet0/3', 'r1', 'GigabitEthernet0/0');
      b.link('r1', 'GigabitEthernet0/1', 'srv', 'FastEthernet0');
      b.ip('pc1', 'FastEthernet0', '192.168.1.10', MASK24).gateway('pc1', '192.168.1.1');
      b.ip('guest', 'FastEthernet0', '192.168.1.66', MASK24).gateway('guest', '192.168.1.1');
      b.ip('r1', 'GigabitEthernet0/0', '192.168.1.1', MASK24);
      b.ip('r1', 'GigabitEthernet0/1', '192.168.2.1', MASK24);
      b.ip('srv', 'FastEthernet0', '192.168.2.10', MASK24).gateway('srv', '192.168.2.1');
      // No ACL yet — the guest can currently reach the server (the problem).
      return b.build();
    },
    checks: [
      pingSucceeds('PC1', '192.168.2.10', { points: 1 }),
      pingFails('GUEST', '192.168.2.10', { points: 2 }),
    ],
    hints: [
      'A standard ACL matches the source address. Deny the guest, then permit everyone else.',
      'On R1: `access-list 10 deny host 192.168.1.66`, `access-list 10 permit any`, then on Gi0/1 `ip access-group 10 out`.',
    ],
    explanation:
      'A standard ACL filters by source. Denying 192.168.1.66 and permitting everyone else, applied outbound toward the server, drops only the guest’s traffic. Order matters: the permit-any must come after the deny, and remember the implicit deny at the end.',
  };
}

/**
 * FAMILY 1 — "assign the missing address": two PCs on a switch in the same
 * /24, PC2 missing its IP. Pure same-subnet host-addressing practice.
 * @param {number} count
 * @returns {object[]}
 */
export function generateAddressingScenarios(count = 8) {
  const scenarios = [];
  for (let i = 0; i < count; i += 1) {
    const subnet = `192.168.${10 + i}`;
    const pc1Ip = `${subnet}.11`;
    const pc2Ip = `${subnet}.12`;
    scenarios.push({
      id: `addressing-${10 + i}`,
      title: `Direccionamiento: falta la IP de PC2 (${subnet}.0/24)`,
      difficulty: 'Beginner',
      objective: `Configura PC2 para que haga ping a PC1 (${pc1Ip}).`,
      description: `PC1 y PC2 están en el mismo switch dentro de ${subnet}.0/24. PC1 ya tiene IP; PC2 no. Asígnale a PC2 una dirección válida (${pc2Ip}) y la conectividad volverá.`,
      generated: true,
      createTopology() {
        const b = new TopologyBuilder();
        b.pc('pc1', 'PC1', { x: 120, y: 160 })
          .switch('sw1', 'SW1', { x: 360, y: 260 })
          .pc('pc2', 'PC2', { x: 600, y: 160 });
        b.link('pc1', 'FastEthernet0', 'sw1', 'FastEthernet0/1');
        b.link('pc2', 'FastEthernet0', 'sw1', 'FastEthernet0/2');
        b.ip('pc1', 'FastEthernet0', pc1Ip, MASK24);
        b.ip('pc2', 'FastEthernet0', null, null, { enabled: true }); // fault: no IP
        return b.build();
      },
      checks: [
        interfaceHasIp('PC2', 'FastEthernet0', pc2Ip, MASK24, { points: 1 }),
        pingSucceeds('PC1', pc2Ip, { points: 1 }),
      ],
      hints: [
        `Ambos hosts deben estar en ${subnet}.0/24 con máscara ${MASK24}.`,
        `En PC2: interface FastEthernet0, luego \`ip address ${pc2Ip} ${MASK24}\`.`,
      ],
      explanation: `Con ambas PC en ${subnet}.0/24 y conectadas al mismo switch (VLAN 1), comparten dominio de difusión y el ping funciona — el tráfico de la misma subred no necesita gateway.`,
    });
  }
  return scenarios;
}

/**
 * FAMILY 2 — "the missing default gateway": two LANs joined by R1. PC2 is
 * addressed but has no default gateway, so it can't leave its subnet.
 * @param {number} count
 * @returns {object[]}
 */
export function generateGatewayScenarios(count = 8) {
  const scenarios = [];
  for (let i = 0; i < count; i += 1) {
    const lanA = `192.168.${40 + i}`; // PC1's LAN
    const lanB = `192.168.${60 + i}`; // PC2's LAN
    const pc1Ip = `${lanA}.10`;
    const pc2Ip = `${lanB}.10`;
    const gwB = `${lanB}.1`;
    scenarios.push({
      id: `gateway-${40 + i}`,
      title: `Puerta de enlace: PC2 no puede salir de su subred (${lanB}.0/24)`,
      difficulty: 'Beginner',
      objective: `Configura PC2 para que haga ping a PC1 (${pc1Ip}) a través de R1.`,
      description: `PC1 (${lanA}.0/24) y PC2 (${lanB}.0/24) están en subredes distintas unidas por R1. PC2 ya tiene IP, pero le falta la puerta de enlace, así que no puede alcanzar otra red.`,
      generated: true,
      createTopology() {
        const b = new TopologyBuilder();
        b.pc('pc1', 'PC1', { x: 120, y: 200 })
          .router('r1', 'R1', { x: 360, y: 200 })
          .pc('pc2', 'PC2', { x: 600, y: 200 });
        b.link('pc1', 'FastEthernet0', 'r1', 'GigabitEthernet0/0');
        b.link('r1', 'GigabitEthernet0/1', 'pc2', 'FastEthernet0');
        b.ip('pc1', 'FastEthernet0', pc1Ip, MASK24).gateway('pc1', `${lanA}.1`);
        b.ip('r1', 'GigabitEthernet0/0', `${lanA}.1`, MASK24);
        b.ip('r1', 'GigabitEthernet0/1', gwB, MASK24);
        b.ip('pc2', 'FastEthernet0', pc2Ip, MASK24); // fault: no default gateway
        return b.build();
      },
      checks: [
        defaultGatewayIs('PC2', gwB, { points: 1 }),
        pingSucceeds('PC2', pc1Ip, { points: 2 }),
      ],
      hints: [
        `PC2 está en ${lanB}.0/24; su router local es ${gwB}.`,
        `En PC2 define la puerta de enlace predeterminada como ${gwB}.`,
      ],
      explanation: `Un host solo alcanza otras subredes enviando el tráfico a su puerta de enlace. Sin gateway, PC2 no sabía a quién entregar los paquetes hacia ${lanA}.0/24. Apuntándola a ${gwB} (R1) el ping funciona.`,
    });
  }
  return scenarios;
}

/**
 * FAMILY 3 — "the interface that went dark": R1 routes between two LANs but
 * the port toward PC2 is administratively shut. `no shutdown` fixes it.
 * @param {number} count
 * @returns {object[]}
 */
export function generateShutdownScenarios(count = 6) {
  const scenarios = [];
  for (let i = 0; i < count; i += 1) {
    const lanA = `10.${1 + i}.1`;
    const lanB = `10.${1 + i}.2`;
    const pc1Ip = `${lanA}.10`;
    const pc2Ip = `${lanB}.10`;
    scenarios.push({
      id: `shutdown-${1 + i}`,
      title: `Interfaz apagada: reactiva el enlace hacia PC2 (${lanB}.0/24)`,
      difficulty: 'Beginner',
      objective: `Consigue que PC1 (${pc1Ip}) haga ping a PC2 (${pc2Ip}).`,
      description: `R1 enruta entre ${lanA}.0/24 y ${lanB}.0/24. El direccionamiento es correcto, pero la interfaz de R1 hacia PC2 está administrativamente apagada.`,
      generated: true,
      createTopology() {
        const b = new TopologyBuilder();
        b.pc('pc1', 'PC1', { x: 120, y: 200 })
          .router('r1', 'R1', { x: 360, y: 200 })
          .pc('pc2', 'PC2', { x: 600, y: 200 });
        b.link('pc1', 'FastEthernet0', 'r1', 'GigabitEthernet0/0');
        b.link('r1', 'GigabitEthernet0/1', 'pc2', 'FastEthernet0');
        b.ip('pc1', 'FastEthernet0', pc1Ip, MASK24).gateway('pc1', `${lanA}.1`);
        b.ip('pc2', 'FastEthernet0', pc2Ip, MASK24).gateway('pc2', `${lanB}.1`);
        b.ip('r1', 'GigabitEthernet0/0', `${lanA}.1`, MASK24);
        b.ip('r1', 'GigabitEthernet0/1', `${lanB}.1`, MASK24, { enabled: false }); // fault
        return b.build();
      },
      checks: [
        interfaceEnabled('R1', 'GigabitEthernet0/1', { points: 1 }),
        pingSucceeds('PC1', pc2Ip, { points: 2 }),
      ],
      hints: [
        'Revisa el estado de las interfaces de R1 con `show ip interface brief`.',
        'En R1: interface GigabitEthernet0/1, luego `no shutdown`.',
      ],
      explanation: `Gi0/1 tenía la IP correcta pero estaba apagada, así que la ruta conectada a ${lanB}.0/24 no existía. \`no shutdown\` levanta la interfaz y restaura la conectividad de extremo a extremo.`,
    });
  }
  return scenarios;
}

/**
 * FAMILY 4 — "same subnet, different VLAN": two hosts that should share a
 * VLAN on SW1 are split apart. Move PC2's port back to PC1's VLAN.
 * @param {number} count
 * @returns {object[]}
 */
export function generateVlanScenarios(count = 6) {
  const scenarios = [];
  for (let i = 0; i < count; i += 1) {
    const subnet = `192.168.${30 + i}`;
    const rightVlan = 10 + i * 10;
    const wrongVlan = rightVlan + 5;
    const pc2Ip = `${subnet}.12`;
    scenarios.push({
      id: `vlan-${30 + i}`,
      title: `VLAN incorrecta: reúne a los hosts (VLAN ${rightVlan})`,
      difficulty: 'Intermediate',
      objective: `Haz que PC1 y PC2 (misma subred ${subnet}.0/24) vuelvan a alcanzarse.`,
      description: `PC1 y PC2 están en ${subnet}.0/24 en SW1, pero no se hacen ping. Sus puertos de acceso no coinciden en la VLAN: uno está en la VLAN ${rightVlan} y el otro en la ${wrongVlan}.`,
      generated: true,
      createTopology() {
        const b = new TopologyBuilder();
        b.pc('pc1', 'PC1', { x: 120, y: 160 })
          .switch('sw1', 'SW1', { x: 360, y: 260 })
          .pc('pc2', 'PC2', { x: 600, y: 160 });
        b.link('pc1', 'FastEthernet0', 'sw1', 'FastEthernet0/1');
        b.link('pc2', 'FastEthernet0', 'sw1', 'FastEthernet0/2');
        b.ip('pc1', 'FastEthernet0', `${subnet}.11`, MASK24);
        b.ip('pc2', 'FastEthernet0', pc2Ip, MASK24);
        b.accessVlan('sw1', 'FastEthernet0/1', rightVlan);
        b.accessVlan('sw1', 'FastEthernet0/2', wrongVlan); // fault
        return b.build();
      },
      checks: [
        accessVlanIs('SW1', 'FastEthernet0/2', rightVlan, { points: 1 }),
        pingSucceeds('PC1', pc2Ip, { points: 2 }),
      ],
      hints: [
        'Compara la VLAN de acceso de los dos puertos con `show vlan brief`.',
        `En SW1: interface FastEthernet0/2, luego \`switchport access vlan ${rightVlan}\`.`,
      ],
      explanation: `Los puertos de acceso solo reenvían dentro de su VLAN. Con Fa0/2 en la VLAN ${wrongVlan}, sus tramas nunca llegaban a PC1. Al devolver el puerto a la VLAN ${rightVlan} ambos vuelven a compartir dominio de difusión.`,
    });
  }
  return scenarios;
}

/**
 * FAMILY 5 — "wrong subnet": PC2 is addressed, but in the wrong /24 (a typo
 * in the third octet), so it isn't on PC1's subnet. Fix PC2's address.
 * @param {number} count
 * @returns {object[]}
 */
export function generateWrongSubnetScenarios(count = 6) {
  const scenarios = [];
  for (let i = 0; i < count; i += 1) {
    const subnet = `172.16.${20 + i}`;
    const pc1Ip = `${subnet}.11`;
    const correctIp = `${subnet}.12`;
    const wrongIp = `172.16.${120 + i}.12`; // right host, wrong subnet
    scenarios.push({
      id: `wrong-subnet-${20 + i}`,
      title: `Subred equivocada: corrige la IP de PC2 (${subnet}.0/24)`,
      difficulty: 'Beginner',
      objective: `Corrige la dirección de PC2 para que haga ping a PC1 (${pc1Ip}).`,
      description: `PC1 y PC2 comparten switch y deberían estar en ${subnet}.0/24, pero PC2 quedó configurada como ${wrongIp} — una subred distinta. Ajusta su IP a ${correctIp}.`,
      generated: true,
      createTopology() {
        const b = new TopologyBuilder();
        b.pc('pc1', 'PC1', { x: 120, y: 160 })
          .switch('sw1', 'SW1', { x: 360, y: 260 })
          .pc('pc2', 'PC2', { x: 600, y: 160 });
        b.link('pc1', 'FastEthernet0', 'sw1', 'FastEthernet0/1');
        b.link('pc2', 'FastEthernet0', 'sw1', 'FastEthernet0/2');
        b.ip('pc1', 'FastEthernet0', pc1Ip, MASK24);
        b.ip('pc2', 'FastEthernet0', wrongIp, MASK24); // fault: wrong subnet
        return b.build();
      },
      checks: [
        interfaceHasIp('PC2', 'FastEthernet0', correctIp, MASK24, { points: 1 }),
        pingSucceeds('PC1', correctIp, { points: 1 }),
      ],
      hints: [
        `PC1 está en ${subnet}.0/24; PC2 debe estar en esa misma subred, no en ${wrongIp}.`,
        `En PC2: interface FastEthernet0, luego \`ip address ${correctIp} ${MASK24}\`.`,
      ],
      explanation: `Aunque PC2 tenía una IP válida, estaba en otra /24, así que para PC1 era un destino remoto sin ruta. Al reasignar ${correctIp} ambos quedan en ${subnet}.0/24 y el ping de la misma subred funciona.`,
    });
  }
  return scenarios;
}

/**
 * FAMILY 6 — "no default route": R1 is a border router that knows its LAN and
 * the link to R2, but has no gateway of last resort, so it can't reach the
 * Internet host behind R2. Fix: a default route toward R2.
 * @param {number} count
 * @returns {object[]}
 */
export function generateDefaultRouteScenarios(count = 4) {
  const scenarios = [];
  for (let i = 0; i < count; i += 1) {
    const lan = `192.168.${80 + i}`;
    const pc1Ip = `${lan}.10`;
    const t1 = `10.10.${i}.1`;
    const t2 = `10.10.${i}.2`;
    const inet = '8.8.8.8';
    scenarios.push({
      id: `default-route-${80 + i}`,
      title: `Ruta por defecto: R1 no sale a Internet (${lan}.0/24)`,
      difficulty: 'Intermediate',
      objective: `Configura R1 para que PC1 (${pc1Ip}) alcance el host de Internet ${inet}.`,
      description: `R1 es el router de borde: conoce su LAN y el enlace a R2, pero no tiene ruta para lo desconocido, así que el tráfico a ${inet} no sale.`,
      generated: true,
      createTopology() {
        const b = new TopologyBuilder();
        b.pc('pc1', 'PC1', { x: 80, y: 220 })
          .router('r1', 'R1', { x: 280, y: 220 })
          .router('r2', 'R2', { x: 520, y: 220 })
          .pc('inet', 'INET', { x: 740, y: 220 });
        b.link('pc1', 'FastEthernet0', 'r1', 'GigabitEthernet0/0');
        b.link('r1', 'GigabitEthernet0/1', 'r2', 'GigabitEthernet0/0');
        b.link('r2', 'GigabitEthernet0/1', 'inet', 'FastEthernet0');
        b.ip('pc1', 'FastEthernet0', pc1Ip, MASK24).gateway('pc1', `${lan}.1`);
        b.ip('r1', 'GigabitEthernet0/0', `${lan}.1`, MASK24);
        b.ip('r1', 'GigabitEthernet0/1', t1, MASK30);
        b.ip('r2', 'GigabitEthernet0/0', t2, MASK30);
        b.ip('r2', 'GigabitEthernet0/1', '8.8.8.1', MASK24);
        b.ip('inet', 'FastEthernet0', inet, MASK24).gateway('inet', '8.8.8.1');
        b.topology.getNode('r2').device.config.staticRoutes.push({
          prefix: `${lan}.0`,
          mask: MASK24,
          nextHop: t1,
        });
        return b.build();
      },
      checks: [pingSucceeds('PC1', inet, { points: 2 })],
      hints: [
        'En routers se usa `ip route`, no `ip default-gateway` (eso es para hosts).',
        `En R1: \`ip route 0.0.0.0 0.0.0.0 ${t2}\`.`,
      ],
      explanation: `La ruta por defecto (0.0.0.0/0) es el "gateway of last resort". Apuntándola a ${t2} (R2), R1 reenvía todo lo desconocido y PC1 alcanza ${inet}.`,
    });
  }
  return scenarios;
}

/**
 * FAMILY 7 — "wrong next-hop": R1 has a static route to the remote LAN, but it
 * points at a neighbor that doesn't exist, so the packet is dropped. Fix the
 * next-hop.
 * @param {number} count
 * @returns {object[]}
 */
export function generateWrongNextHopScenarios(count = 4) {
  const scenarios = [];
  for (let i = 0; i < count; i += 1) {
    const lan = `192.168.${90 + i}`;
    const remote = `172.20.${i}`;
    const t1 = `10.20.${i}.1`;
    const t2 = `10.20.${i}.2`;
    const badNextHop = `10.20.${i}.9`;
    const pc1Ip = `${lan}.10`;
    const pc2Ip = `${remote}.10`;
    scenarios.push({
      id: `wrong-nexthop-${90 + i}`,
      title: `Siguiente salto equivocado: la ruta existe pero apunta mal (${remote}.0/24)`,
      difficulty: 'Intermediate',
      objective: `Corrige la ruta estática de R1 para que PC1 (${pc1Ip}) haga ping a PC2 (${pc2Ip}).`,
      description: `R1 SÍ tiene una ruta a ${remote}.0/24, pero apunta a ${badNextHop}, que no existe. El vecino real R2 es ${t2}.`,
      generated: true,
      createTopology() {
        const b = new TopologyBuilder();
        b.pc('pc1', 'PC1', { x: 80, y: 220 })
          .router('r1', 'R1', { x: 280, y: 220 })
          .router('r2', 'R2', { x: 520, y: 220 })
          .pc('pc2', 'PC2', { x: 740, y: 220 });
        b.link('pc1', 'FastEthernet0', 'r1', 'GigabitEthernet0/0');
        b.link('r1', 'GigabitEthernet0/1', 'r2', 'GigabitEthernet0/0');
        b.link('r2', 'GigabitEthernet0/1', 'pc2', 'FastEthernet0');
        b.ip('pc1', 'FastEthernet0', pc1Ip, MASK24).gateway('pc1', `${lan}.1`);
        b.ip('pc2', 'FastEthernet0', pc2Ip, MASK24).gateway('pc2', `${remote}.1`);
        b.ip('r1', 'GigabitEthernet0/0', `${lan}.1`, MASK24);
        b.ip('r1', 'GigabitEthernet0/1', t1, MASK30);
        b.ip('r2', 'GigabitEthernet0/0', t2, MASK30);
        b.ip('r2', 'GigabitEthernet0/1', `${remote}.1`, MASK24);
        b.topology.getNode('r1').device.config.staticRoutes.push({
          prefix: `${remote}.0`,
          mask: MASK24,
          nextHop: badNextHop, // fault
        });
        b.topology.getNode('r2').device.config.staticRoutes.push({
          prefix: `${lan}.0`,
          mask: MASK24,
          nextHop: t1,
        });
        return b.build();
      },
      checks: [pingSucceeds('PC1', pc2Ip, { points: 2 })],
      hints: [
        'La ruta aparece en `show ip route` pero el siguiente salto es inalcanzable.',
        `En R1: \`no ip route ${remote}.0 ${MASK24} ${badNextHop}\`, luego \`ip route ${remote}.0 ${MASK24} ${t2}\`.`,
      ],
      explanation: `El siguiente salto (${badNextHop}) no existía, así que R1 no podía entregar el paquete. Apuntando la ruta al vecino real (${t2}) la conectividad se restablece.`,
    });
  }
  return scenarios;
}

/**
 * FAMILY 8 — "trunk needed": two PCs in the same VLAN on different switches
 * can't reach each other because the inter-switch link is an access port.
 * Fix: make it a trunk.
 * @param {number} count
 * @returns {object[]}
 */
export function generateTrunkScenarios(count = 4) {
  const scenarios = [];
  for (let i = 0; i < count; i += 1) {
    const subnet = `192.168.${50 + i}`;
    const vlan = 10 + i;
    const pc1Ip = `${subnet}.11`;
    const pc2Ip = `${subnet}.12`;
    scenarios.push({
      id: `trunk-${50 + i}`,
      title: `Troncal ausente: la VLAN ${vlan} no cruza entre switches (${subnet}.0/24)`,
      difficulty: 'Intermediate',
      objective: `Haz que PC1 (${pc1Ip}) y PC2 (${pc2Ip}), ambos en la VLAN ${vlan}, vuelvan a alcanzarse.`,
      description: `PC1 y PC2 están en la VLAN ${vlan} pero en switches distintos. El enlace SW1–SW2 (Gi0/1) sigue en modo acceso (VLAN 1), así que la VLAN ${vlan} no lo atraviesa.`,
      generated: true,
      createTopology() {
        const b = new TopologyBuilder();
        b.pc('pc1', 'PC1', { x: 100, y: 160 })
          .switch('sw1', 'SW1', { x: 300, y: 260 })
          .switch('sw2', 'SW2', { x: 520, y: 260 })
          .pc('pc2', 'PC2', { x: 720, y: 160 });
        b.link('pc1', 'FastEthernet0', 'sw1', 'FastEthernet0/1');
        b.link('sw1', 'GigabitEthernet0/1', 'sw2', 'GigabitEthernet0/1');
        b.link('sw2', 'FastEthernet0/1', 'pc2', 'FastEthernet0');
        b.ip('pc1', 'FastEthernet0', pc1Ip, MASK24);
        b.ip('pc2', 'FastEthernet0', pc2Ip, MASK24);
        b.accessVlan('sw1', 'FastEthernet0/1', vlan);
        b.accessVlan('sw2', 'FastEthernet0/1', vlan);
        b.accessVlan('sw1', 'GigabitEthernet0/1', 1);
        b.accessVlan('sw2', 'GigabitEthernet0/1', 1);
        return b.build();
      },
      checks: [pingSucceeds('PC1', pc2Ip, { points: 2 })],
      hints: [
        'Un enlace entre switches que lleva varias VLANs debe ser troncal (802.1Q).',
        'En SW1 y SW2: `interface Gi0/1`, `switchport mode trunk`.',
      ],
      explanation: `Un puerto de acceso solo transporta una VLAN. Convirtiendo Gi0/1 en troncal en ambos extremos, la VLAN ${vlan} cruza el enlace y PC1 alcanza a PC2.`,
    });
  }
  return scenarios;
}

/**
 * FAMILY 9 — "OSPF transit not advertised": R1's OSPF doesn't cover the transit
 * link, so no adjacency forms and it never learns R2's LAN. Fix: add the
 * transit network statement.
 * @param {number} count
 * @returns {object[]}
 */
export function generateOspfTransitScenarios(count = 4) {
  const scenarios = [];
  for (let i = 0; i < count; i += 1) {
    const lan = `192.168.${100 + i}`;
    const remote = `172.30.${i}`;
    const t1 = `10.30.${i}.1`;
    const t2 = `10.30.${i}.2`;
    const transitNet = `10.30.${i}.0`;
    const pc1Ip = `${lan}.10`;
    const pc2Ip = `${remote}.10`;
    scenarios.push({
      id: `ospf-transit-${100 + i}`,
      title: `Tránsito OSPF sin anunciar: no hay vecindad (${remote}.0/24)`,
      difficulty: 'Advanced',
      objective: `Consigue que R1 forme vecindad OSPF y PC1 (${pc1Ip}) alcance a PC2 (${pc2Ip}).`,
      description: `R1 solo anuncia su LAN en OSPF; le falta el enlace de tránsito ${transitNet}/30. Sin él no envía HELLO por ahí, no hay adyacencia y nunca aprende ${remote}.0/24.`,
      generated: true,
      createTopology() {
        const b = new TopologyBuilder();
        b.pc('pc1', 'PC1', { x: 80, y: 220 })
          .router('r1', 'R1', { x: 280, y: 220 })
          .router('r2', 'R2', { x: 520, y: 220 })
          .pc('pc2', 'PC2', { x: 740, y: 220 });
        b.link('pc1', 'FastEthernet0', 'r1', 'GigabitEthernet0/0');
        b.link('r1', 'GigabitEthernet0/1', 'r2', 'GigabitEthernet0/0');
        b.link('r2', 'GigabitEthernet0/1', 'pc2', 'FastEthernet0');
        b.ip('pc1', 'FastEthernet0', pc1Ip, MASK24).gateway('pc1', `${lan}.1`);
        b.ip('pc2', 'FastEthernet0', pc2Ip, MASK24).gateway('pc2', `${remote}.1`);
        b.ip('r1', 'GigabitEthernet0/0', `${lan}.1`, MASK24);
        b.ip('r1', 'GigabitEthernet0/1', t1, MASK30);
        b.ip('r2', 'GigabitEthernet0/0', t2, MASK30);
        b.ip('r2', 'GigabitEthernet0/1', `${remote}.1`, MASK24);
        b.ospf('r1', 1, [{ address: `${lan}.0`, wildcard: '0.0.0.255', area: 0 }]); // falta el tránsito
        b.ospf('r2', 1, [
          { address: transitNet, wildcard: '0.0.0.3', area: 0 },
          { address: `${remote}.0`, wildcard: '0.0.0.255', area: 0 },
        ]);
        return b.build();
      },
      checks: [ospfNeighborUp('R1', { points: 1 }), pingSucceeds('PC1', pc2Ip, { points: 2 })],
      hints: [
        'Sin `network` que cubra la interfaz de tránsito, OSPF no forma adyacencia por ahí.',
        `En R1: \`router ospf 1\`, \`network ${transitNet} 0.0.0.3 area 0\`.`,
      ],
      explanation: `La wildcard de un /30 es 0.0.0.3. Anunciando ${transitNet} 0.0.0.3, R1 forma la adyacencia con R2, aprende ${remote}.0/24 y el ping funciona.`,
    });
  }
  return scenarios;
}

/**
 * FAMILY 10 — "wrong default gateway": PC2 is addressed but its default
 * gateway points at an address that doesn't exist, so it can't leave its LAN.
 * @param {number} count
 * @returns {object[]}
 */
export function generateWrongGatewayScenarios(count = 4) {
  const scenarios = [];
  for (let i = 0; i < count; i += 1) {
    const lanA = `192.168.${110 + i}`;
    const lanB = `192.168.${130 + i}`;
    const pc1Ip = `${lanA}.10`;
    const pc2Ip = `${lanB}.10`;
    const goodGw = `${lanB}.1`;
    const badGw = `${lanB}.254`;
    scenarios.push({
      id: `wrong-gateway-${110 + i}`,
      title: `Puerta de enlace equivocada: PC2 apunta mal (${lanB}.0/24)`,
      difficulty: 'Beginner',
      objective: `Corrige la puerta de enlace de PC2 para que haga ping a PC1 (${pc1Ip}).`,
      description: `PC2 (${lanB}.0/24) tiene puerta de enlace ${badGw}, pero ese router no existe. El router real de su LAN es R1 en ${goodGw}.`,
      generated: true,
      createTopology() {
        const b = new TopologyBuilder();
        b.pc('pc1', 'PC1', { x: 120, y: 200 })
          .router('r1', 'R1', { x: 360, y: 200 })
          .pc('pc2', 'PC2', { x: 600, y: 200 });
        b.link('pc1', 'FastEthernet0', 'r1', 'GigabitEthernet0/0');
        b.link('r1', 'GigabitEthernet0/1', 'pc2', 'FastEthernet0');
        b.ip('pc1', 'FastEthernet0', pc1Ip, MASK24).gateway('pc1', `${lanA}.1`);
        b.ip('r1', 'GigabitEthernet0/0', `${lanA}.1`, MASK24);
        b.ip('r1', 'GigabitEthernet0/1', goodGw, MASK24);
        b.ip('pc2', 'FastEthernet0', pc2Ip, MASK24).gateway('pc2', badGw); // fault
        return b.build();
      },
      checks: [
        defaultGatewayIs('PC2', goodGw, { points: 1 }),
        pingSucceeds('PC2', pc1Ip, { points: 2 }),
      ],
      hints: [
        `La puerta de enlace debe ser una IP que exista en ${lanB}.0/24: el router R1 (${goodGw}).`,
        `En PC2 cambia la puerta de enlace de ${badGw} a ${goodGw}.`,
      ],
      explanation: `PC2 no podía resolver por ARP una puerta de enlace inexistente (${badGw}). Apuntándola al router real (${goodGw}) el tráfico sale de la LAN y el ping funciona.`,
    });
  }
  return scenarios;
}

/**
 * FAMILY 11 — "router IP in the wrong subnet": R1's LAN interface (the PCs'
 * gateway) is addressed in a different subnet, so the hosts can't reach it.
 * @param {number} count
 * @returns {object[]}
 */
export function generateWrongRouterIpScenarios(count = 4) {
  const scenarios = [];
  for (let i = 0; i < count; i += 1) {
    const lanA = `192.168.${140 + i}`;
    const lanB = `192.168.${160 + i}`;
    const pc1Ip = `${lanA}.10`;
    const pc2Ip = `${lanB}.10`;
    const goodIp = `${lanA}.1`;
    const wrongIp = `10.9.${i}.1`;
    scenarios.push({
      id: `wrong-router-ip-${140 + i}`,
      title: `IP de router en subred equivocada (${lanA}.0/24)`,
      difficulty: 'Intermediate',
      objective: `Corrige la IP de Gi0/0 en R1 para que PC1 (${pc1Ip}) alcance a PC2 (${pc2Ip}).`,
      description: `PC1 usa como puerta de enlace ${goodIp}, pero Gi0/0 de R1 quedó configurada como ${wrongIp} — otra subred. PC1 no puede alcanzar su gateway.`,
      generated: true,
      createTopology() {
        const b = new TopologyBuilder();
        b.pc('pc1', 'PC1', { x: 120, y: 200 })
          .router('r1', 'R1', { x: 360, y: 200 })
          .pc('pc2', 'PC2', { x: 600, y: 200 });
        b.link('pc1', 'FastEthernet0', 'r1', 'GigabitEthernet0/0');
        b.link('r1', 'GigabitEthernet0/1', 'pc2', 'FastEthernet0');
        b.ip('pc1', 'FastEthernet0', pc1Ip, MASK24).gateway('pc1', goodIp);
        b.ip('r1', 'GigabitEthernet0/0', wrongIp, MASK24); // fault: wrong subnet
        b.ip('r1', 'GigabitEthernet0/1', `${lanB}.1`, MASK24);
        b.ip('pc2', 'FastEthernet0', pc2Ip, MASK24).gateway('pc2', `${lanB}.1`);
        return b.build();
      },
      checks: [
        interfaceHasIp('R1', 'GigabitEthernet0/0', goodIp, MASK24, { points: 1 }),
        pingSucceeds('PC1', pc2Ip, { points: 2 }),
      ],
      hints: [
        `Gi0/0 debe estar en la misma subred que PC1 (${lanA}.0/24) y ser su gateway ${goodIp}.`,
        `En R1: interface Gi0/0, \`ip address ${goodIp} ${MASK24}\`.`,
      ],
      explanation: `Con Gi0/0 en ${wrongIp}, R1 no tenía interfaz en ${lanA}.0/24 y PC1 no podía alcanzar su puerta de enlace. Reasignando ${goodIp} se crea la ruta conectada y el ping funciona.`,
    });
  }
  return scenarios;
}

/**
 * FAMILY 12 — "wrong subnet mask": PC2 has the right address but a mask that
 * puts its own gateway/peer out of subnet, so it can't reach it locally.
 * @param {number} count
 * @returns {object[]}
 */
export function generateWrongMaskScenarios(count = 4) {
  const scenarios = [];
  for (let i = 0; i < count; i += 1) {
    const subnet = `192.168.${170 + i}`;
    const pc1Ip = `${subnet}.10`;
    const pc2Ip = `${subnet}.130`;
    const wrongMask = '255.255.255.128'; // /25 splits .10 and .130 apart
    scenarios.push({
      id: `wrong-mask-${170 + i}`,
      title: `Máscara incorrecta: PC2 no ve a PC1 (${subnet}.0/24)`,
      difficulty: 'Intermediate',
      objective: `Corrige la máscara de PC2 para que haga ping a PC1 (${pc1Ip}).`,
      description: `PC1 y PC2 deberían estar en ${subnet}.0/24, pero PC2 (${pc2Ip}) tiene máscara ${wrongMask} (/25). Con esa máscara, PC1 le queda "fuera de su subred".`,
      generated: true,
      createTopology() {
        const b = new TopologyBuilder();
        b.pc('pc1', 'PC1', { x: 120, y: 160 })
          .switch('sw1', 'SW1', { x: 360, y: 260 })
          .pc('pc2', 'PC2', { x: 600, y: 160 });
        b.link('pc1', 'FastEthernet0', 'sw1', 'FastEthernet0/1');
        b.link('pc2', 'FastEthernet0', 'sw1', 'FastEthernet0/2');
        b.ip('pc1', 'FastEthernet0', pc1Ip, MASK24);
        b.ip('pc2', 'FastEthernet0', pc2Ip, wrongMask); // fault: wrong mask
        return b.build();
      },
      checks: [
        interfaceHasIp('PC2', 'FastEthernet0', pc2Ip, MASK24, { points: 1 }),
        pingSucceeds('PC2', pc1Ip, { points: 2 }),
      ],
      hints: [
        `Ambos hosts están en un /24; la máscara de PC2 debe ser ${MASK24}, no ${wrongMask}.`,
        `En PC2: interface FastEthernet0, luego \`ip address ${pc2Ip} ${MASK24}\`.`,
      ],
      explanation: `Con máscara /25, PC2 calculaba que ${pc1Ip} estaba en otra subred y buscaba un gateway inexistente. Con ${MASK24} ambos vuelven a la misma /24 y el ping local funciona.`,
    });
  }
  return scenarios;
}

/**
 * FAMILY 13 — "an ACL blocks everyone": a correctly-addressed network fails
 * because a misapplied ACL denies all traffic outbound. Remove/fix it.
 * @param {number} count
 * @returns {object[]}
 */
export function generateAclBlockScenarios(count = 4) {
  const scenarios = [];
  for (let i = 0; i < count; i += 1) {
    const lanA = `192.168.${180 + i}`;
    const lanB = `192.168.${190 + i}`;
    const pc1Ip = `${lanA}.10`;
    const pc2Ip = `${lanB}.10`;
    scenarios.push({
      id: `acl-block-${180 + i}`,
      title: `ACL que bloquea todo: nadie pasa (${lanB}.0/24)`,
      difficulty: 'Advanced',
      objective: `Restaura la conectividad para que PC1 (${pc1Ip}) haga ping a PC2 (${pc2Ip}).`,
      description: `El direccionamiento es correcto, pero una ACL aplicada en Gi0/1 de R1 (saliente) deniega TODO el tráfico. Quita o corrige la ACL.`,
      generated: true,
      createTopology() {
        const b = new TopologyBuilder();
        b.pc('pc1', 'PC1', { x: 120, y: 200 })
          .router('r1', 'R1', { x: 360, y: 200 })
          .pc('pc2', 'PC2', { x: 600, y: 200 });
        b.link('pc1', 'FastEthernet0', 'r1', 'GigabitEthernet0/0');
        b.link('r1', 'GigabitEthernet0/1', 'pc2', 'FastEthernet0');
        b.ip('pc1', 'FastEthernet0', pc1Ip, MASK24).gateway('pc1', `${lanA}.1`);
        b.ip('pc2', 'FastEthernet0', pc2Ip, MASK24).gateway('pc2', `${lanB}.1`);
        b.ip('r1', 'GigabitEthernet0/0', `${lanA}.1`, MASK24);
        b.ip('r1', 'GigabitEthernet0/1', `${lanB}.1`, MASK24);
        const r1 = b.topology.getNode('r1').device;
        r1.config.acls['10'] = {
          type: 'standard',
          entries: [
            { type: 'standard', action: 'deny', srcIp: '0.0.0.0', srcWildcard: '255.255.255.255' },
          ],
        };
        r1.getInterface('GigabitEthernet0/1').aclOut = '10'; // fault: blocks everything
        return b.build();
      },
      checks: [pingSucceeds('PC1', pc2Ip, { points: 2 })],
      hints: [
        'La ruta y el direccionamiento están bien: revisa `show ip interface Gi0/1` y `show access-lists`.',
        'En R1: interface Gi0/1, `no ip access-group 10 out` (o corrige la ACL para permitir el tráfico).',
      ],
      explanation: `La ACL 10 tenía un \`deny any\` aplicado saliente, así que descartaba todos los paquetes hacia ${lanB}.0/24. Al quitar el \`ip access-group\` (o permitir el tráfico) la conectividad se restablece.`,
    });
  }
  return scenarios;
}

/**
 * The full catalog: authored scenarios first, then the generated drill
 * families (thirteen different skills, not one repeated template).
 * @returns {object[]}
 */
export function allScenarios() {
  return [
    shutdownInterface(),
    missingIpAddress(),
    vlanMismatch(),
    ospfMissingNetwork(),
    aclRestrictGuest(),
    ...generateAddressingScenarios(),
    ...generateGatewayScenarios(),
    ...generateShutdownScenarios(),
    ...generateVlanScenarios(),
    ...generateWrongSubnetScenarios(),
    ...generateDefaultRouteScenarios(),
    ...generateWrongNextHopScenarios(),
    ...generateTrunkScenarios(),
    ...generateOspfTransitScenarios(),
    ...generateWrongGatewayScenarios(),
    ...generateWrongRouterIpScenarios(),
    ...generateWrongMaskScenarios(),
    ...generateAclBlockScenarios(),
  ];
}
