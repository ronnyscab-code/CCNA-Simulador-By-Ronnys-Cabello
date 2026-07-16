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
export function generateAddressingScenarios(count = 5) {
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
export function generateGatewayScenarios(count = 5) {
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
export function generateShutdownScenarios(count = 4) {
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
export function generateVlanScenarios(count = 4) {
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
export function generateWrongSubnetScenarios(count = 4) {
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
 * The full catalog: authored scenarios first, then the generated drill
 * families (five different skills, not one repeated template).
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
  ];
}
