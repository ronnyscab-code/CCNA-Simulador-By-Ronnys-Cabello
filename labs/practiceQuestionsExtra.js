/**
 * practiceQuestionsExtra.js
 *
 * A second batch of ORIGINAL hands-on practice questions, kept in its own file
 * so `practiceQuestions.js` stays readable. Same shape as the base bank, plus
 * a test-only `solve(topology)` on every lab that has `checks`: it applies the
 * canonical fix so the test suite can prove each lab is actually solvable by
 * the CLI (it reaches a state where every check passes). `solve` is ignored by
 * the UI.
 *
 * All content is written from scratch against the public CCNA 200-301
 * blueprint — nothing copied from Cisco or any third-party question bank.
 *
 * DOM-free.
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

const M24 = '255.255.255.0';
const M30 = '255.255.255.252';

const DOMAINS = {
  FUND: 'Network Fundamentals',
  ACCESS: 'Network Access',
  CONN: 'IP Connectivity',
  SVC: 'IP Services',
  SEC: 'Security Fundamentals',
};

/** @param {import('../topology/Topology.js').Topology} t @param {string} id */
const dev = (t, id) => t.getNode(id).device;

/**
 * @returns {object[]} the extra practice questions.
 */
export function extraPracticeQuestions() {
  return [
    // --- Addressing & connectivity -------------------------------------

    {
      id: 'pqx-assign-ip',
      domain: DOMAINS.FUND,
      difficulty: 'Beginner',
      prompt:
        'PC2 no tiene dirección IP y está en el mismo switch que PC1 (192.168.5.11/24). ¿Qué comando le asigna 192.168.5.12/24?',
      choices: [
        { id: 'a', text: 'ip address 192.168.5.12 255.255.255.0' },
        { id: 'b', text: 'ip 192.168.5.12 255.255.255.0' },
        { id: 'c', text: 'ip address 192.168.5.12 /24' },
        { id: 'd', text: 'ip default-gateway 192.168.5.12' },
      ],
      correct: ['a'],
      explanation:
        'En la interfaz: `ip address <ip> <máscara>`. Con ambos hosts en 192.168.5.0/24 y en el mismo switch (VLAN 1) el ping funciona sin gateway.',
      labHint: 'En PC2: `conf t`, `interface Fa0`, `ip address 192.168.5.12 255.255.255.0`.',
      createTopology() {
        const b = new TopologyBuilder();
        b.pc('pc1', 'PC1', { x: 120, y: 160 })
          .switch('sw1', 'SW1', { x: 360, y: 260 })
          .pc('pc2', 'PC2', { x: 600, y: 160 });
        b.link('pc1', 'FastEthernet0', 'sw1', 'FastEthernet0/1');
        b.link('pc2', 'FastEthernet0', 'sw1', 'FastEthernet0/2');
        b.ip('pc1', 'FastEthernet0', '192.168.5.11', M24);
        return b.build();
      },
      checks: [
        interfaceHasIp('PC2', 'FastEthernet0', '192.168.5.12', M24),
        pingSucceeds('PC1', '192.168.5.12'),
      ],
      solve(t) {
        dev(t, 'pc2').getInterface('FastEthernet0').setIp('192.168.5.12', M24);
      },
    },

    {
      id: 'pqx-wrong-subnet',
      domain: DOMAINS.FUND,
      difficulty: 'Beginner',
      prompt:
        'PC2 quedó configurada como 192.168.40.12/24, pero debe compartir subred con PC1 (192.168.1.11/24) en el mismo switch. ¿Qué IP corrige el problema?',
      choices: [
        { id: 'a', text: 'ip address 192.168.1.12 255.255.255.0' },
        { id: 'b', text: 'ip address 192.168.40.1 255.255.255.0' },
        { id: 'c', text: 'ip address 192.168.1.12 255.255.255.128' },
        { id: 'd', text: 'ip default-gateway 192.168.1.1' },
      ],
      correct: ['a'],
      explanation:
        'PC2 estaba en otra /24, así que para PC1 era un destino remoto sin ruta. Al reasignarla dentro de 192.168.1.0/24 ambos quedan en la misma subred.',
      labHint: 'En PC2: `interface Fa0`, `ip address 192.168.1.12 255.255.255.0`.',
      createTopology() {
        const b = new TopologyBuilder();
        b.pc('pc1', 'PC1', { x: 120, y: 160 })
          .switch('sw1', 'SW1', { x: 360, y: 260 })
          .pc('pc2', 'PC2', { x: 600, y: 160 });
        b.link('pc1', 'FastEthernet0', 'sw1', 'FastEthernet0/1');
        b.link('pc2', 'FastEthernet0', 'sw1', 'FastEthernet0/2');
        b.ip('pc1', 'FastEthernet0', '192.168.1.11', M24);
        b.ip('pc2', 'FastEthernet0', '192.168.40.12', M24);
        return b.build();
      },
      checks: [
        interfaceHasIp('PC2', 'FastEthernet0', '192.168.1.12', M24),
        pingSucceeds('PC1', '192.168.1.12'),
      ],
      solve(t) {
        dev(t, 'pc2').getInterface('FastEthernet0').setIp('192.168.1.12', M24);
      },
    },

    {
      id: 'pqx-gateway-remote',
      domain: DOMAINS.FUND,
      difficulty: 'Beginner',
      prompt:
        'PC2 (10.2.2.10/24) tiene IP pero no alcanza PC1 en 10.1.1.0/24 a través de R1. ¿Qué le falta a PC2?',
      choices: [
        { id: 'a', text: 'ip default-gateway 10.2.2.1' },
        { id: 'b', text: 'ip route 10.1.1.0 255.255.255.0 10.2.2.1' },
        { id: 'c', text: 'no shutdown' },
        { id: 'd', text: 'ip default-gateway 10.1.1.1' },
      ],
      correct: ['a'],
      explanation:
        'Un host llega a otras subredes por su puerta de enlace: el router de SU red, 10.2.2.1. Apuntar al router remoto (10.1.1.1) no sirve.',
      labHint: 'En PC2: `conf t`, `ip default-gateway 10.2.2.1`.',
      createTopology() {
        const b = new TopologyBuilder();
        b.pc('pc1', 'PC1', { x: 120, y: 200 })
          .router('r1', 'R1', { x: 360, y: 200 })
          .pc('pc2', 'PC2', { x: 600, y: 200 });
        b.link('pc1', 'FastEthernet0', 'r1', 'GigabitEthernet0/0');
        b.link('r1', 'GigabitEthernet0/1', 'pc2', 'FastEthernet0');
        b.ip('pc1', 'FastEthernet0', '10.1.1.10', M24).gateway('pc1', '10.1.1.1');
        b.ip('r1', 'GigabitEthernet0/0', '10.1.1.1', M24);
        b.ip('r1', 'GigabitEthernet0/1', '10.2.2.1', M24);
        b.ip('pc2', 'FastEthernet0', '10.2.2.10', M24); // sin gateway
        return b.build();
      },
      checks: [defaultGatewayIs('PC2', '10.2.2.1'), pingSucceeds('PC2', '10.1.1.10')],
      solve(t) {
        dev(t, 'pc2').defaultGateway = '10.2.2.1';
      },
    },

    {
      id: 'pqx-router-ip',
      domain: DOMAINS.CONN,
      difficulty: 'Beginner',
      prompt:
        'La interfaz Gi0/0 de R1 (puerta de enlace de PC1) está activa pero sin dirección. ¿Qué comando le asigna 192.168.1.1/24?',
      choices: [
        { id: 'a', text: 'ip address 192.168.1.1 255.255.255.0' },
        { id: 'b', text: 'ip address 192.168.1.1 255.255.255.255' },
        { id: 'c', text: 'ip default-gateway 192.168.1.1' },
        { id: 'd', text: 'network 192.168.1.0 255.255.255.0' },
      ],
      correct: ['a'],
      explanation:
        'Sin IP en Gi0/0, R1 no tiene la ruta conectada a 192.168.1.0/24 ni gateway para PC1. `ip address 192.168.1.1 255.255.255.0` la crea.',
      labHint: 'En R1: `interface Gi0/0`, `ip address 192.168.1.1 255.255.255.0`.',
      createTopology() {
        const b = new TopologyBuilder();
        b.pc('pc1', 'PC1', { x: 120, y: 200 })
          .router('r1', 'R1', { x: 360, y: 200 })
          .pc('pc2', 'PC2', { x: 600, y: 200 });
        b.link('pc1', 'FastEthernet0', 'r1', 'GigabitEthernet0/0');
        b.link('r1', 'GigabitEthernet0/1', 'pc2', 'FastEthernet0');
        b.ip('pc1', 'FastEthernet0', '192.168.1.10', M24).gateway('pc1', '192.168.1.1');
        b.ip('pc2', 'FastEthernet0', '192.168.2.10', M24).gateway('pc2', '192.168.2.1');
        b.ip('r1', 'GigabitEthernet0/0', null, null, { enabled: true }); // sin IP
        b.ip('r1', 'GigabitEthernet0/1', '192.168.2.1', M24);
        return b.build();
      },
      checks: [
        interfaceHasIp('R1', 'GigabitEthernet0/0', '192.168.1.1', M24),
        pingSucceeds('PC1', '192.168.2.10'),
      ],
      solve(t) {
        dev(t, 'r1').getInterface('GigabitEthernet0/0').setIp('192.168.1.1', M24);
      },
    },

    {
      id: 'pqx-noshut-g00',
      domain: DOMAINS.CONN,
      difficulty: 'Beginner',
      prompt:
        'PC1 no llega a PC2. En R1, Gi0/0 (hacia PC1) tiene la IP correcta pero `show ip interface brief` la muestra "administratively down". ¿Qué comando la activa?',
      choices: [
        { id: 'a', text: 'no shutdown' },
        { id: 'b', text: 'enable' },
        { id: 'c', text: 'no ip address' },
        { id: 'd', text: 'switchport mode access' },
      ],
      correct: ['a'],
      explanation:
        'Las interfaces de router arrancan apagadas. `no shutdown` en config-if la levanta y aparece la ruta conectada.',
      labHint: 'En R1: `interface Gi0/0`, `no shutdown`.',
      createTopology() {
        const b = new TopologyBuilder();
        b.pc('pc1', 'PC1', { x: 120, y: 200 })
          .router('r1', 'R1', { x: 360, y: 200 })
          .pc('pc2', 'PC2', { x: 600, y: 200 });
        b.link('pc1', 'FastEthernet0', 'r1', 'GigabitEthernet0/0');
        b.link('r1', 'GigabitEthernet0/1', 'pc2', 'FastEthernet0');
        b.ip('pc1', 'FastEthernet0', '192.168.1.10', M24).gateway('pc1', '192.168.1.1');
        b.ip('pc2', 'FastEthernet0', '192.168.2.10', M24).gateway('pc2', '192.168.2.1');
        b.ip('r1', 'GigabitEthernet0/0', '192.168.1.1', M24, { enabled: false });
        b.ip('r1', 'GigabitEthernet0/1', '192.168.2.1', M24);
        return b.build();
      },
      checks: [interfaceEnabled('R1', 'GigabitEthernet0/0'), pingSucceeds('PC1', '192.168.2.10')],
      solve(t) {
        dev(t, 'r1').getInterface('GigabitEthernet0/0').enabled = true;
      },
    },

    {
      id: 'pqx-default-route',
      domain: DOMAINS.CONN,
      difficulty: 'Intermediate',
      prompt:
        'R1 es el router de borde: todo lo desconocido debe ir a R2 (siguiente salto 10.0.0.2). ¿Qué ruta por defecto lo consigue?',
      choices: [
        { id: 'a', text: 'ip route 0.0.0.0 0.0.0.0 10.0.0.2' },
        { id: 'b', text: 'ip route 10.0.0.2 0.0.0.0 0.0.0.0' },
        { id: 'c', text: 'ip default-gateway 10.0.0.2' },
        { id: 'd', text: 'network 0.0.0.0 0.0.0.0 area 0' },
      ],
      correct: ['a'],
      explanation:
        'La ruta por defecto (gateway of last resort) es `ip route 0.0.0.0 0.0.0.0 <siguiente-salto>`. En routers se usa `ip route`, no `ip default-gateway` (eso es para hosts/switches).',
      labHint: 'En R1: `ip route 0.0.0.0 0.0.0.0 10.0.0.2`. Luego `ping 8.8.8.8` desde PC1.',
      createTopology() {
        const b = new TopologyBuilder();
        b.pc('pc1', 'PC1', { x: 80, y: 220 })
          .router('r1', 'R1', { x: 280, y: 220 })
          .router('r2', 'R2', { x: 520, y: 220 })
          .pc('inet', 'INET', { x: 740, y: 220 });
        b.link('pc1', 'FastEthernet0', 'r1', 'GigabitEthernet0/0');
        b.link('r1', 'GigabitEthernet0/1', 'r2', 'GigabitEthernet0/0');
        b.link('r2', 'GigabitEthernet0/1', 'inet', 'FastEthernet0');
        b.ip('pc1', 'FastEthernet0', '192.168.1.10', M24).gateway('pc1', '192.168.1.1');
        b.ip('r1', 'GigabitEthernet0/0', '192.168.1.1', M24);
        b.ip('r1', 'GigabitEthernet0/1', '10.0.0.1', M30);
        b.ip('r2', 'GigabitEthernet0/0', '10.0.0.2', M30);
        b.ip('r2', 'GigabitEthernet0/1', '8.8.8.1', M24);
        b.ip('inet', 'FastEthernet0', '8.8.8.8', M24).gateway('inet', '8.8.8.1');
        dev(b.topology, 'r2').config.staticRoutes.push({
          prefix: '192.168.1.0',
          mask: M24,
          nextHop: '10.0.0.1',
        });
        return b.build();
      },
      checks: [pingSucceeds('PC1', '8.8.8.8')],
      solve(t) {
        dev(t, 'r1').config.staticRoutes.push({
          prefix: '0.0.0.0',
          mask: '0.0.0.0',
          nextHop: '10.0.0.2',
        });
      },
    },

    {
      id: 'pqx-wrong-nexthop',
      domain: DOMAINS.CONN,
      difficulty: 'Intermediate',
      prompt:
        'R1 SÍ tiene una ruta estática a 192.168.2.0/24, pero PC2 no responde: apunta a un siguiente salto que no existe (10.0.0.9). El vecino real R2 es 10.0.0.2. ¿Cuál es la ruta correcta?',
      choices: [
        { id: 'a', text: 'ip route 192.168.2.0 255.255.255.0 10.0.0.2' },
        { id: 'b', text: 'ip route 192.168.2.0 255.255.255.0 10.0.0.9' },
        { id: 'c', text: 'ip route 192.168.2.0 255.255.255.0 192.168.2.1' },
        { id: 'd', text: 'ip default-gateway 10.0.0.2' },
      ],
      correct: ['a'],
      explanation:
        'La ruta existía pero el siguiente salto era inalcanzable, así que el paquete no salía. Debe apuntar a la IP real del vecino: 10.0.0.2. Quita la mala con `no ip route …` y añade la correcta.',
      labHint:
        'En R1: `no ip route 192.168.2.0 255.255.255.0 10.0.0.9`, luego `ip route 192.168.2.0 255.255.255.0 10.0.0.2`.',
      createTopology() {
        const b = new TopologyBuilder();
        b.pc('pc1', 'PC1', { x: 80, y: 220 })
          .router('r1', 'R1', { x: 280, y: 220 })
          .router('r2', 'R2', { x: 520, y: 220 })
          .pc('pc2', 'PC2', { x: 740, y: 220 });
        b.link('pc1', 'FastEthernet0', 'r1', 'GigabitEthernet0/0');
        b.link('r1', 'GigabitEthernet0/1', 'r2', 'GigabitEthernet0/0');
        b.link('r2', 'GigabitEthernet0/1', 'pc2', 'FastEthernet0');
        b.ip('pc1', 'FastEthernet0', '192.168.1.10', M24).gateway('pc1', '192.168.1.1');
        b.ip('pc2', 'FastEthernet0', '192.168.2.10', M24).gateway('pc2', '192.168.2.1');
        b.ip('r1', 'GigabitEthernet0/0', '192.168.1.1', M24);
        b.ip('r1', 'GigabitEthernet0/1', '10.0.0.1', M30);
        b.ip('r2', 'GigabitEthernet0/0', '10.0.0.2', M30);
        b.ip('r2', 'GigabitEthernet0/1', '192.168.2.1', M24);
        dev(b.topology, 'r1').config.staticRoutes.push({
          prefix: '192.168.2.0',
          mask: M24,
          nextHop: '10.0.0.9', // siguiente salto equivocado
        });
        dev(b.topology, 'r2').config.staticRoutes.push({
          prefix: '192.168.1.0',
          mask: M24,
          nextHop: '10.0.0.1',
        });
        return b.build();
      },
      checks: [pingSucceeds('PC1', '192.168.2.10')],
      solve(t) {
        const routes = dev(t, 'r1').config.staticRoutes;
        routes.length = 0;
        routes.push({ prefix: '192.168.2.0', mask: M24, nextHop: '10.0.0.2' });
      },
    },

    {
      id: 'pqx-vlan-move',
      domain: DOMAINS.ACCESS,
      difficulty: 'Intermediate',
      prompt:
        'PC1 y PC2 (192.168.30.0/24) cuelgan de SW1 pero no se hacen ping: Fa0/1 está en VLAN 30 y Fa0/2 en VLAN 99. ¿Qué comando en Fa0/2 los reúne?',
      choices: [
        { id: 'a', text: 'switchport access vlan 30' },
        { id: 'b', text: 'switchport mode trunk' },
        { id: 'c', text: 'switchport access vlan 99' },
        { id: 'd', text: 'no switchport' },
      ],
      correct: ['a'],
      explanation:
        'Los puertos de acceso solo reenvían dentro de su VLAN. Devolver Fa0/2 a la VLAN 30 los pone en el mismo dominio de difusión.',
      labHint:
        'En SW1: `interface Fa0/2`, `switchport access vlan 30`. Verifica con `show vlan brief`.',
      createTopology() {
        const b = new TopologyBuilder();
        b.pc('pc1', 'PC1', { x: 120, y: 160 })
          .switch('sw1', 'SW1', { x: 360, y: 260 })
          .pc('pc2', 'PC2', { x: 600, y: 160 });
        b.link('pc1', 'FastEthernet0', 'sw1', 'FastEthernet0/1');
        b.link('pc2', 'FastEthernet0', 'sw1', 'FastEthernet0/2');
        b.ip('pc1', 'FastEthernet0', '192.168.30.11', M24);
        b.ip('pc2', 'FastEthernet0', '192.168.30.12', M24);
        b.accessVlan('sw1', 'FastEthernet0/1', 30);
        b.accessVlan('sw1', 'FastEthernet0/2', 99);
        return b.build();
      },
      checks: [accessVlanIs('SW1', 'FastEthernet0/2', 30), pingSucceeds('PC1', '192.168.30.12')],
      solve(t) {
        const iface = dev(t, 'sw1').getInterface('FastEthernet0/2');
        iface.switchportMode = 'access';
        iface.accessVlan = 30;
      },
    },

    {
      id: 'pqx-trunk-link',
      domain: DOMAINS.ACCESS,
      difficulty: 'Intermediate',
      prompt:
        'PC1 y PC2 están en la VLAN 20 pero en switches distintos. El enlace SW1–SW2 (Gi0/1) sigue en modo acceso VLAN 1. ¿Qué comando (en ambos extremos) permite que la VLAN 20 cruce?',
      choices: [
        { id: 'a', text: 'switchport mode trunk' },
        { id: 'b', text: 'switchport access vlan 20' },
        { id: 'c', text: 'channel-group 1 mode on' },
        { id: 'd', text: 'no shutdown' },
      ],
      correct: ['a'],
      explanation:
        'Un enlace que transporta varias VLANs entre switches debe ser troncal (802.1Q): `switchport mode trunk` en ambos extremos. Un acceso solo lleva una VLAN.',
      labHint: 'En SW1 y SW2: `interface Gi0/1`, `switchport mode trunk`.',
      createTopology() {
        const b = new TopologyBuilder();
        b.pc('pc1', 'PC1', { x: 100, y: 160 })
          .switch('sw1', 'SW1', { x: 300, y: 260 })
          .switch('sw2', 'SW2', { x: 520, y: 260 })
          .pc('pc2', 'PC2', { x: 720, y: 160 });
        b.link('pc1', 'FastEthernet0', 'sw1', 'FastEthernet0/1');
        b.link('sw1', 'GigabitEthernet0/1', 'sw2', 'GigabitEthernet0/1');
        b.link('sw2', 'FastEthernet0/1', 'pc2', 'FastEthernet0');
        b.ip('pc1', 'FastEthernet0', '192.168.20.11', M24);
        b.ip('pc2', 'FastEthernet0', '192.168.20.12', M24);
        b.accessVlan('sw1', 'FastEthernet0/1', 20);
        b.accessVlan('sw2', 'FastEthernet0/1', 20);
        b.accessVlan('sw1', 'GigabitEthernet0/1', 1);
        b.accessVlan('sw2', 'GigabitEthernet0/1', 1);
        return b.build();
      },
      checks: [pingSucceeds('PC1', '192.168.20.12')],
      solve(t) {
        dev(t, 'sw1').getInterface('GigabitEthernet0/1').switchportMode = 'trunk';
        dev(t, 'sw2').getInterface('GigabitEthernet0/1').switchportMode = 'trunk';
      },
    },

    {
      id: 'pqx-ospf-transit',
      domain: DOMAINS.CONN,
      difficulty: 'Advanced',
      prompt:
        'R1 no forma vecindad OSPF con R2 y no aprende 192.168.2.0/24. En R1 solo está `network 192.168.1.0 0.0.0.255 area 0`: falta anunciar el enlace de tránsito 10.0.0.0/30. ¿Qué comando lo arregla?',
      choices: [
        { id: 'a', text: 'network 10.0.0.0 0.0.0.3 area 0' },
        { id: 'b', text: 'network 10.0.0.0 0.0.0.255 area 0' },
        { id: 'c', text: 'network 10.0.0.0 255.255.255.252 area 0' },
        { id: 'd', text: 'ip route 10.0.0.0 255.255.255.252 area 0' },
      ],
      correct: ['a'],
      explanation:
        'Si el `network` no cubre la interfaz de tránsito, OSPF no envía HELLO por ahí, no hay adyacencia y R1 nunca aprende las rutas de R2. La wildcard de un /30 es 0.0.0.3.',
      labHint:
        'En R1: `router ospf 1`, `network 10.0.0.0 0.0.0.3 area 0`. Verifica `show ip ospf neighbor`.',
      createTopology() {
        const b = new TopologyBuilder();
        b.pc('pc1', 'PC1', { x: 80, y: 220 })
          .router('r1', 'R1', { x: 280, y: 220 })
          .router('r2', 'R2', { x: 520, y: 220 })
          .pc('pc2', 'PC2', { x: 740, y: 220 });
        b.link('pc1', 'FastEthernet0', 'r1', 'GigabitEthernet0/0');
        b.link('r1', 'GigabitEthernet0/1', 'r2', 'GigabitEthernet0/0');
        b.link('r2', 'GigabitEthernet0/1', 'pc2', 'FastEthernet0');
        b.ip('pc1', 'FastEthernet0', '192.168.1.10', M24).gateway('pc1', '192.168.1.1');
        b.ip('pc2', 'FastEthernet0', '192.168.2.10', M24).gateway('pc2', '192.168.2.1');
        b.ip('r1', 'GigabitEthernet0/0', '192.168.1.1', M24);
        b.ip('r1', 'GigabitEthernet0/1', '10.0.0.1', M30);
        b.ip('r2', 'GigabitEthernet0/0', '10.0.0.2', M30);
        b.ip('r2', 'GigabitEthernet0/1', '192.168.2.1', M24);
        b.ospf('r1', 1, [{ address: '192.168.1.0', wildcard: '0.0.0.255', area: 0 }]); // falta el tránsito
        b.ospf('r2', 1, [
          { address: '10.0.0.0', wildcard: '0.0.0.3', area: 0 },
          { address: '192.168.2.0', wildcard: '0.0.0.255', area: 0 },
        ]);
        return b.build();
      },
      checks: [ospfNeighborUp('R1'), pingSucceeds('PC1', '192.168.2.10')],
      solve(t) {
        dev(t, 'r1').config.ospf.networks.push({
          address: '10.0.0.0',
          wildcard: '0.0.0.3',
          area: 0,
        });
      },
    },

    {
      id: 'pqx-ospf-noshut',
      domain: DOMAINS.CONN,
      difficulty: 'Advanced',
      prompt:
        'La adyacencia OSPF entre R1 y R2 no se forma. La configuración `network` es correcta en ambos, pero el enlace de tránsito Gi0/1 de R1 está apagado. ¿Qué comando lo soluciona?',
      choices: [
        { id: 'a', text: 'no shutdown' },
        { id: 'b', text: 'clear ip ospf process' },
        { id: 'c', text: 'network 10.0.0.0 0.0.0.3 area 0' },
        { id: 'd', text: 'ip ospf hello-interval 5' },
      ],
      correct: ['a'],
      explanation:
        'Sin interfaz activa no hay adyacencia: OSPF no envía HELLO por un puerto down. `no shutdown` en Gi0/1 levanta el enlace y los vecinos se forman.',
      labHint: 'En R1: `interface Gi0/1`, `no shutdown`. Verifica con `show ip ospf neighbor`.',
      createTopology() {
        const b = new TopologyBuilder();
        b.pc('pc1', 'PC1', { x: 80, y: 220 })
          .router('r1', 'R1', { x: 280, y: 220 })
          .router('r2', 'R2', { x: 520, y: 220 })
          .pc('pc2', 'PC2', { x: 740, y: 220 });
        b.link('pc1', 'FastEthernet0', 'r1', 'GigabitEthernet0/0');
        b.link('r1', 'GigabitEthernet0/1', 'r2', 'GigabitEthernet0/0');
        b.link('r2', 'GigabitEthernet0/1', 'pc2', 'FastEthernet0');
        b.ip('pc1', 'FastEthernet0', '192.168.1.10', M24).gateway('pc1', '192.168.1.1');
        b.ip('pc2', 'FastEthernet0', '192.168.2.10', M24).gateway('pc2', '192.168.2.1');
        b.ip('r1', 'GigabitEthernet0/0', '192.168.1.1', M24);
        b.ip('r1', 'GigabitEthernet0/1', '10.0.0.1', M30, { enabled: false }); // apagada
        b.ip('r2', 'GigabitEthernet0/0', '10.0.0.2', M30);
        b.ip('r2', 'GigabitEthernet0/1', '192.168.2.1', M24);
        b.ospf('r1', 1, [
          { address: '192.168.1.0', wildcard: '0.0.0.255', area: 0 },
          { address: '10.0.0.0', wildcard: '0.0.0.3', area: 0 },
        ]);
        b.ospf('r2', 1, [
          { address: '192.168.2.0', wildcard: '0.0.0.255', area: 0 },
          { address: '10.0.0.0', wildcard: '0.0.0.3', area: 0 },
        ]);
        return b.build();
      },
      checks: [ospfNeighborUp('R1'), pingSucceeds('PC1', '192.168.2.10')],
      solve(t) {
        dev(t, 'r1').getInterface('GigabitEthernet0/1').enabled = true;
      },
    },

    {
      id: 'pqx-acl-apply',
      domain: DOMAINS.SEC,
      difficulty: 'Advanced',
      prompt:
        'Creaste la ACL 10 (deny host 192.168.1.66 / permit any) en R1 pero GUEST sigue llegando al servidor. ¿Qué falta?',
      choices: [
        { id: 'a', text: 'Aplicarla: interface Gi0/1, ip access-group 10 out' },
        { id: 'b', text: 'access-list 10 permit any' },
        { id: 'c', text: 'no shutdown en Gi0/1' },
        { id: 'd', text: 'Nada: la ACL actúa sola al crearse' },
      ],
      correct: ['a'],
      explanation:
        'Una ACL no filtra hasta aplicarse a una interfaz con `ip access-group` en una dirección. Aquí, saliente hacia el servidor: `ip access-group 10 out` en Gi0/1.',
      labHint:
        'En R1: `interface Gi0/1`, `ip access-group 10 out`. Prueba ping desde PC1 y desde GUEST.',
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
        b.ip('pc1', 'FastEthernet0', '192.168.1.10', M24).gateway('pc1', '192.168.1.1');
        b.ip('guest', 'FastEthernet0', '192.168.1.66', M24).gateway('guest', '192.168.1.1');
        b.ip('r1', 'GigabitEthernet0/0', '192.168.1.1', M24);
        b.ip('r1', 'GigabitEthernet0/1', '192.168.2.1', M24);
        b.ip('srv', 'FastEthernet0', '192.168.2.10', M24).gateway('srv', '192.168.2.1');
        dev(b.topology, 'r1').config.acls['10'] = {
          type: 'standard',
          entries: [
            { type: 'standard', action: 'deny', srcIp: '192.168.1.66', srcWildcard: '0.0.0.0' },
            {
              type: 'standard',
              action: 'permit',
              srcIp: '0.0.0.0',
              srcWildcard: '255.255.255.255',
            },
          ],
        };
        return b.build();
      },
      checks: [pingSucceeds('PC1', '192.168.2.10'), pingFails('GUEST', '192.168.2.10')],
      solve(t) {
        dev(t, 'r1').getInterface('GigabitEthernet0/1').aclOut = '10';
      },
    },

    // --- Conceptual (explorable, no auto-check) -------------------------

    {
      id: 'pqx-c-dhcp-exclude',
      domain: DOMAINS.SVC,
      difficulty: 'Intermediate',
      prompt:
        'Antes de crear el pool DHCP quieres reservar 192.168.1.1–192.168.1.10 para equipos fijos. ¿Qué comando global las excluye del reparto?',
      choices: [
        { id: 'a', text: 'ip dhcp excluded-address 192.168.1.1 192.168.1.10' },
        { id: 'b', text: 'ip dhcp pool exclude 192.168.1.1 192.168.1.10' },
        { id: 'c', text: 'no ip dhcp 192.168.1.1 192.168.1.10' },
        { id: 'd', text: 'reserve 192.168.1.1 192.168.1.10' },
      ],
      correct: ['a'],
      explanation:
        '`ip dhcp excluded-address <inicio> <fin>` en configuración global evita que el servidor entregue ese rango (típico para gateway, servidores e impresoras).',
      labHint:
        'En R1: `ip dhcp excluded-address 192.168.1.1 192.168.1.10`, luego `ip dhcp pool LAN`.',
      createTopology() {
        return simpleRouterLan();
      },
      checks: [],
    },

    {
      id: 'pqx-c-nat-static',
      domain: DOMAINS.SVC,
      difficulty: 'Advanced',
      prompt:
        'Un servidor interno 192.168.1.10 debe ser accesible desde Internet siempre por la IP pública 203.0.113.10. ¿Qué comando crea esa traducción fija?',
      choices: [
        { id: 'a', text: 'ip nat inside source static 192.168.1.10 203.0.113.10' },
        { id: 'b', text: 'ip nat inside source list 1 interface Gi0/1 overload' },
        { id: 'c', text: 'ip nat outside source static 203.0.113.10 192.168.1.10' },
        { id: 'd', text: 'ip route 203.0.113.10 192.168.1.10' },
      ],
      correct: ['a'],
      explanation:
        'NAT estático hace un mapeo uno-a-uno permanente: `ip nat inside source static <priv> <pub>`. A diferencia de PAT (overload), no comparte la IP ni usa puertos.',
      labHint:
        'Marca inside/outside en las interfaces y usa `ip nat inside source static 192.168.1.10 203.0.113.10`.',
      createTopology() {
        return simpleRouterLan();
      },
      checks: [],
    },

    {
      id: 'pqx-c-acl-ext-http',
      domain: DOMAINS.SEC,
      difficulty: 'Advanced',
      prompt:
        'Quieres bloquear solo el tráfico HTTP (puerto 80) de la red 192.168.1.0/24 hacia el servidor 192.168.2.10, permitiendo lo demás. ¿Qué ACL extendida es correcta?',
      choices: [
        {
          id: 'a',
          text: 'access-list 100 deny tcp 192.168.1.0 0.0.0.255 host 192.168.2.10 eq 80 / permit ip any any',
        },
        { id: 'b', text: 'access-list 10 deny 192.168.1.0 0.0.0.255' },
        { id: 'c', text: 'access-list 100 deny ip any any eq 80' },
        { id: 'd', text: 'access-list 100 permit tcp any any eq 80' },
      ],
      correct: ['a'],
      explanation:
        'Una ACL extendida filtra por protocolo, origen, destino y puerto. `deny tcp <origen> host <destino> eq 80` bloquea HTTP; el `permit ip any any` final deja pasar el resto (si no, el deny implícito cortaría todo).',
      labHint:
        'Las ACL extendidas (100–199) permiten `eq 80`, `eq 443`, etc. El orden y el permit final importan.',
      createTopology() {
        return simpleRouterLan();
      },
      checks: [],
    },

    {
      id: 'pqx-c-port-security',
      domain: DOMAINS.SEC,
      difficulty: 'Intermediate',
      prompt:
        'En un puerto de acceso quieres que el switch aprenda automáticamente la primera MAC y la fije en la config. ¿Qué comando lo hace?',
      choices: [
        { id: 'a', text: 'switchport port-security mac-address sticky' },
        { id: 'b', text: 'switchport port-security maximum 10' },
        { id: 'c', text: 'switchport mode trunk' },
        { id: 'd', text: 'mac address-table static' },
      ],
      correct: ['a'],
      explanation:
        'Con port-security activado, `mac-address sticky` aprende dinámicamente la MAC y la guarda en running-config, evitando teclearla a mano. Se combina con `maximum` y `violation`.',
      labHint: 'Requiere `switchport mode access` y `switchport port-security` antes del `sticky`.',
      createTopology() {
        return twoPcSwitch();
      },
      checks: [],
    },

    {
      id: 'pqx-c-portfast',
      domain: DOMAINS.ACCESS,
      difficulty: 'Intermediate',
      prompt:
        'En un puerto de acceso conectado a un PC quieres que pase a reenviar de inmediato (sin los ~30 s de STP). ¿Qué comando se usa?',
      choices: [
        { id: 'a', text: 'spanning-tree portfast' },
        { id: 'b', text: 'spanning-tree bpduguard disable' },
        { id: 'c', text: 'switchport mode trunk' },
        { id: 'd', text: 'no spanning-tree vlan 1' },
      ],
      correct: ['a'],
      explanation:
        'PortFast salta los estados listening/learning en puertos de borde (hacia hosts), pasando directo a forwarding. No debe usarse hacia otros switches (riesgo de bucle).',
      labHint: 'Solo en puertos de acceso a hosts. Suele acompañarse de BPDU Guard.',
      createTopology() {
        return twoPcSwitch();
      },
      checks: [],
    },

    {
      id: 'pqx-c-native-vlan',
      domain: DOMAINS.ACCESS,
      difficulty: 'Intermediate',
      prompt:
        'En un enlace troncal quieres cambiar la VLAN nativa a la 99 (debe coincidir en ambos extremos). ¿Qué comando la fija?',
      choices: [
        { id: 'a', text: 'switchport trunk native vlan 99' },
        { id: 'b', text: 'switchport access vlan 99' },
        { id: 'c', text: 'native vlan 99' },
        { id: 'd', text: 'switchport trunk allowed vlan 99' },
      ],
      correct: ['a'],
      explanation:
        'La VLAN nativa (tráfico sin etiqueta en un trunk 802.1Q) se define con `switchport trunk native vlan <id>`. Debe coincidir en ambos extremos o el switch reporta un mismatch.',
      labHint:
        'No confundir con `allowed vlan` (qué VLANs pasan) ni con `access vlan` (puertos de acceso).',
      createTopology() {
        return twoSwitchTrunk();
      },
      checks: [],
    },

    {
      id: 'pqx-c-wildcard-26',
      domain: DOMAINS.CONN,
      difficulty: 'Intermediate',
      prompt:
        'En una sentencia `network` de OSPF necesitas la máscara wildcard para una red /26. ¿Cuál es?',
      choices: [
        { id: 'a', text: '0.0.0.63' },
        { id: 'b', text: '0.0.0.64' },
        { id: 'c', text: '255.255.255.192' },
        { id: 'd', text: '0.0.0.255' },
      ],
      correct: ['a'],
      explanation:
        'La wildcard es la inversa de la máscara. /26 = 255.255.255.192; invertida es 0.0.0.63 (2^6−1 = 63 en el último octeto).',
      labHint: 'Regla rápida: wildcard = 255.255.255.255 − máscara. Para /26: 255−192 = 63.',
      createTopology() {
        return twoPcSwitch();
      },
      checks: [],
    },

    {
      id: 'pqx-c-save-config',
      domain: DOMAINS.SVC,
      difficulty: 'Beginner',
      prompt:
        'Terminaste de configurar R1 y quieres que los cambios sobrevivan a un reinicio. ¿Qué comando guarda la running-config en la startup-config?',
      choices: [
        { id: 'a', text: 'copy running-config startup-config' },
        { id: 'b', text: 'write erase' },
        { id: 'c', text: 'reload' },
        { id: 'd', text: 'copy startup-config running-config' },
      ],
      correct: ['a'],
      explanation:
        '`copy running-config startup-config` (abreviado `wr`) guarda en NVRAM. La opción d hace lo contrario (recarga la guardada) y `write erase` la borra.',
      labHint: 'En modo privilegiado (#): `copy running-config startup-config` o `wr`.',
      createTopology() {
        return simpleRouterLan();
      },
      checks: [],
    },

    {
      id: 'pqx-c-hosts-27',
      domain: DOMAINS.FUND,
      difficulty: 'Beginner',
      prompt: '¿Cuántas direcciones de host utilizables ofrece una subred /27?',
      choices: [
        { id: 'a', text: '30' },
        { id: 'b', text: '32' },
        { id: 'c', text: '14' },
        { id: 'd', text: '62' },
      ],
      correct: ['a'],
      explanation:
        'Un /27 deja 5 bits de host: 2^5 = 32 direcciones, menos red y broadcast = 30 hosts utilizables. Máscara 255.255.255.224.',
      labHint:
        'Practica: direcciona dos PCs dentro de un /27 (máscara 255.255.255.224) y verifica el ping.',
      createTopology() {
        return twoPcSwitch();
      },
      checks: [],
    },

    // --- More hands-on (CLI-verifiable) --------------------------------

    {
      id: 'pqx-wrong-gateway',
      domain: DOMAINS.FUND,
      difficulty: 'Beginner',
      prompt:
        'PC2 (10.5.5.10/24) tiene puerta de enlace 10.5.5.254, pero ese router no existe. El router real de su LAN es R1 en 10.5.5.1. ¿Qué comando lo corrige?',
      choices: [
        { id: 'a', text: 'ip default-gateway 10.5.5.1' },
        { id: 'b', text: 'ip default-gateway 10.5.5.254' },
        { id: 'c', text: 'ip route 0.0.0.0 0.0.0.0 10.5.5.1' },
        { id: 'd', text: 'no shutdown' },
      ],
      correct: ['a'],
      explanation:
        'La puerta de enlace debe ser una IP que exista en la LAN (10.5.5.1, R1). Apuntando a una inexistente, PC2 no puede resolverla por ARP y no sale de su subred.',
      labHint: 'En PC2: `conf t`, `ip default-gateway 10.5.5.1`.',
      createTopology() {
        const b = new TopologyBuilder();
        b.pc('pc1', 'PC1', { x: 120, y: 200 })
          .router('r1', 'R1', { x: 360, y: 200 })
          .pc('pc2', 'PC2', { x: 600, y: 200 });
        b.link('pc1', 'FastEthernet0', 'r1', 'GigabitEthernet0/0');
        b.link('r1', 'GigabitEthernet0/1', 'pc2', 'FastEthernet0');
        b.ip('pc1', 'FastEthernet0', '10.4.4.10', M24).gateway('pc1', '10.4.4.1');
        b.ip('r1', 'GigabitEthernet0/0', '10.4.4.1', M24);
        b.ip('r1', 'GigabitEthernet0/1', '10.5.5.1', M24);
        b.ip('pc2', 'FastEthernet0', '10.5.5.10', M24).gateway('pc2', '10.5.5.254'); // fault
        return b.build();
      },
      checks: [defaultGatewayIs('PC2', '10.5.5.1'), pingSucceeds('PC2', '10.4.4.10')],
      solve(t) {
        dev(t, 'pc2').defaultGateway = '10.5.5.1';
      },
    },

    {
      id: 'pqx-router-ip-wrong-subnet',
      domain: DOMAINS.CONN,
      difficulty: 'Intermediate',
      prompt:
        'PC1 usa como gateway 192.168.7.1, pero Gi0/0 de R1 quedó como 10.9.9.1 (otra subred). ¿Qué comando en R1 lo arregla?',
      choices: [
        { id: 'a', text: 'ip address 192.168.7.1 255.255.255.0' },
        { id: 'b', text: 'ip address 10.9.9.1 255.255.255.0' },
        { id: 'c', text: 'ip default-gateway 192.168.7.1' },
        { id: 'd', text: 'no shutdown' },
      ],
      correct: ['a'],
      explanation:
        'La interfaz LAN del router debe estar en la misma subred que los hosts y ser su gateway (192.168.7.1). En otra subred, PC1 no puede alcanzar su puerta de enlace.',
      labHint: 'En R1: `interface Gi0/0`, `ip address 192.168.7.1 255.255.255.0`.',
      createTopology() {
        const b = new TopologyBuilder();
        b.pc('pc1', 'PC1', { x: 120, y: 200 })
          .router('r1', 'R1', { x: 360, y: 200 })
          .pc('pc2', 'PC2', { x: 600, y: 200 });
        b.link('pc1', 'FastEthernet0', 'r1', 'GigabitEthernet0/0');
        b.link('r1', 'GigabitEthernet0/1', 'pc2', 'FastEthernet0');
        b.ip('pc1', 'FastEthernet0', '192.168.7.10', M24).gateway('pc1', '192.168.7.1');
        b.ip('r1', 'GigabitEthernet0/0', '10.9.9.1', M24); // fault: wrong subnet
        b.ip('r1', 'GigabitEthernet0/1', '192.168.8.1', M24);
        b.ip('pc2', 'FastEthernet0', '192.168.8.10', M24).gateway('pc2', '192.168.8.1');
        return b.build();
      },
      checks: [
        interfaceHasIp('R1', 'GigabitEthernet0/0', '192.168.7.1', M24),
        pingSucceeds('PC1', '192.168.8.10'),
      ],
      solve(t) {
        dev(t, 'r1').getInterface('GigabitEthernet0/0').setIp('192.168.7.1', M24);
      },
    },

    {
      id: 'pqx-second-lan-shutdown',
      domain: DOMAINS.CONN,
      difficulty: 'Beginner',
      prompt:
        'R1 conecta dos LANs. PC1 alcanza R1 pero no a PC2. `show ip interface brief` muestra Gi0/1 administratively down. ¿Qué comando la levanta?',
      choices: [
        { id: 'a', text: 'no shutdown' },
        { id: 'b', text: 'no ip address' },
        { id: 'c', text: 'shutdown' },
        { id: 'd', text: 'switchport mode access' },
      ],
      correct: ['a'],
      explanation:
        'La interfaz hacia PC2 estaba apagada. `no shutdown` la levanta y crea la ruta conectada a esa LAN.',
      labHint: 'En R1: `interface Gi0/1`, `no shutdown`.',
      createTopology() {
        const b = new TopologyBuilder();
        b.pc('pc1', 'PC1', { x: 120, y: 200 })
          .router('r1', 'R1', { x: 360, y: 200 })
          .pc('pc2', 'PC2', { x: 600, y: 200 });
        b.link('pc1', 'FastEthernet0', 'r1', 'GigabitEthernet0/0');
        b.link('r1', 'GigabitEthernet0/1', 'pc2', 'FastEthernet0');
        b.ip('pc1', 'FastEthernet0', '192.168.3.10', M24).gateway('pc1', '192.168.3.1');
        b.ip('pc2', 'FastEthernet0', '192.168.4.10', M24).gateway('pc2', '192.168.4.1');
        b.ip('r1', 'GigabitEthernet0/0', '192.168.3.1', M24);
        b.ip('r1', 'GigabitEthernet0/1', '192.168.4.1', M24, { enabled: false }); // fault
        return b.build();
      },
      checks: [interfaceEnabled('R1', 'GigabitEthernet0/1'), pingSucceeds('PC1', '192.168.4.10')],
      solve(t) {
        dev(t, 'r1').getInterface('GigabitEthernet0/1').enabled = true;
      },
    },

    // --- More conceptual (explorable) ---------------------------------

    {
      id: 'pqx-c-hosts-30',
      domain: DOMAINS.FUND,
      difficulty: 'Beginner',
      prompt: '¿Cuántas direcciones de host utilizables ofrece una subred /30?',
      choices: [
        { id: 'a', text: '2' },
        { id: 'b', text: '4' },
        { id: 'c', text: '6' },
        { id: 'd', text: '0' },
      ],
      correct: ['a'],
      explanation:
        'Un /30 deja 2 bits de host: 2^2 = 4 direcciones, menos red y broadcast = 2 hosts. Es el clásico para enlaces punto a punto entre routers.',
      labHint: 'Máscara 255.255.255.252. Úsalo entre dos routers (Serial/Gigabit).',
      createTopology() {
        return twoPcSwitch();
      },
      checks: [],
    },

    {
      id: 'pqx-c-broadcast',
      domain: DOMAINS.FUND,
      difficulty: 'Intermediate',
      prompt: '¿Cuál es la dirección de broadcast de 192.168.1.0/26?',
      choices: [
        { id: 'a', text: '192.168.1.63' },
        { id: 'b', text: '192.168.1.64' },
        { id: 'c', text: '192.168.1.127' },
        { id: 'd', text: '192.168.1.255' },
      ],
      correct: ['a'],
      explanation:
        'Un /26 tiene bloques de 64. La subred 192.168.1.0 abarca .0–.63; el broadcast es la última: 192.168.1.63.',
      labHint: 'Tamaño de bloque de /26 = 256 − 192 = 64. Broadcast = red + 63.',
      createTopology() {
        return twoPcSwitch();
      },
      checks: [],
    },

    {
      id: 'pqx-c-trunk-allowed',
      domain: DOMAINS.ACCESS,
      difficulty: 'Intermediate',
      prompt:
        'En un enlace troncal quieres permitir SOLO las VLANs 10, 20 y 30. ¿Qué comando lo hace?',
      choices: [
        { id: 'a', text: 'switchport trunk allowed vlan 10,20,30' },
        { id: 'b', text: 'switchport access vlan 10,20,30' },
        { id: 'c', text: 'switchport trunk native vlan 10,20,30' },
        { id: 'd', text: 'vlan 10,20,30' },
      ],
      correct: ['a'],
      explanation:
        '`switchport trunk allowed vlan <lista>` restringe qué VLANs cruzan el troncal. Usa `add`/`remove` para modificar la lista sin reemplazarla.',
      labHint: 'Aplica sobre un puerto ya en modo trunk (`switchport mode trunk`).',
      createTopology() {
        return twoSwitchTrunk();
      },
      checks: [],
    },

    {
      id: 'pqx-c-show-mac',
      domain: DOMAINS.ACCESS,
      difficulty: 'Beginner',
      prompt: '¿Qué comando muestra qué direcciones MAC ha aprendido un switch y en qué puertos?',
      choices: [
        { id: 'a', text: 'show mac address-table' },
        { id: 'b', text: 'show ip arp' },
        { id: 'c', text: 'show interfaces status' },
        { id: 'd', text: 'show vlan brief' },
      ],
      correct: ['a'],
      explanation:
        '`show mac address-table` lista la tabla CAM: VLAN, MAC, tipo (dynamic/static) y puerto. Es clave para diagnosticar el reenvío de capa 2.',
      labHint: 'Haz ping entre PCs y luego mira cómo se llena con `show mac address-table`.',
      createTopology() {
        return twoPcSwitch();
      },
      checks: [],
    },
  ];
}

// --- shared topology helpers -------------------------------------------

/** @returns {import('../topology/Topology.js').Topology} PC1–SW1–PC2 (unaddressed). */
function twoPcSwitch() {
  const b = new TopologyBuilder();
  b.pc('pc1', 'PC1', { x: 160, y: 180 })
    .switch('sw1', 'SW1', { x: 380, y: 260 })
    .pc('pc2', 'PC2', { x: 600, y: 180 });
  b.link('pc1', 'FastEthernet0', 'sw1', 'FastEthernet0/1');
  b.link('pc2', 'FastEthernet0', 'sw1', 'FastEthernet0/2');
  return b.build();
}

/** @returns {import('../topology/Topology.js').Topology} SW1–SW2 with a PC each. */
function twoSwitchTrunk() {
  const b = new TopologyBuilder();
  b.pc('pc1', 'PC1', { x: 100, y: 160 })
    .switch('sw1', 'SW1', { x: 300, y: 260 })
    .switch('sw2', 'SW2', { x: 520, y: 260 })
    .pc('pc2', 'PC2', { x: 720, y: 160 });
  b.link('pc1', 'FastEthernet0', 'sw1', 'FastEthernet0/1');
  b.link('sw1', 'GigabitEthernet0/1', 'sw2', 'GigabitEthernet0/1');
  b.link('sw2', 'FastEthernet0/1', 'pc2', 'FastEthernet0');
  return b.build();
}

/** @returns {import('../topology/Topology.js').Topology} R1–SW1–PC1 (R1 LAN addressed). */
function simpleRouterLan() {
  const b = new TopologyBuilder();
  b.router('r1', 'R1', { x: 200, y: 200 })
    .switch('sw1', 'SW1', { x: 400, y: 260 })
    .pc('pc1', 'PC1', { x: 620, y: 180 });
  b.link('r1', 'GigabitEthernet0/0', 'sw1', 'FastEthernet0/1');
  b.link('pc1', 'FastEthernet0', 'sw1', 'FastEthernet0/2');
  b.ip('r1', 'GigabitEthernet0/0', '192.168.1.1', M24);
  b.ip('pc1', 'FastEthernet0', '192.168.1.10', M24).gateway('pc1', '192.168.1.1');
  return b.build();
}
