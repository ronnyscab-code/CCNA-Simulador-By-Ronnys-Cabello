/**
 * practiceQuestions.js
 *
 * "Practica en el emulador" — a bank of ORIGINAL, hands-on CCNA questions.
 * Each item is both a multiple-choice question AND a loadable lab: it ships a
 * topology (`createTopology`) you can open in the emulator to type commands,
 * run pings, and discover the correct answer yourself before revealing it.
 *
 * All content here is written from scratch against the public CCNA 200-301
 * blueprint — nothing is copied from Cisco or any third-party question bank.
 *
 * Shape:
 *   {
 *     id, domain, difficulty,
 *     prompt,                       // the question
 *     choices: [{ id, text }],
 *     correct: [choiceId],
 *     explanation,                  // shown on reveal
 *     labHint,                      // what to try in the emulator
 *     createTopology(): Topology,   // the lab to open
 *     checks: [check]               // optional: validate a config attempt
 *   }
 *
 * DOM-free.
 */

import { TopologyBuilder } from './builders.js';
import { extraPracticeQuestions } from './practiceQuestionsExtra.js';
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

/**
 * @returns {object[]}
 */
export function allPracticeQuestions() {
  return [...basePracticeQuestions(), ...extraPracticeQuestions()];
}

/**
 * @returns {object[]} the original hand-authored hands-on questions.
 */
function basePracticeQuestions() {
  return [
    // 1 — bring up an interface
    {
      id: 'pq-no-shutdown',
      domain: DOMAINS.CONN,
      difficulty: 'Beginner',
      prompt:
        'La interfaz Gi0/1 de R1 tiene IP correcta pero PC2 no responde. ¿Qué comando en R1 la pone operativa?',
      choices: [
        { id: 'a', text: 'no shutdown' },
        { id: 'b', text: 'enable' },
        { id: 'c', text: 'ip route 0.0.0.0 0.0.0.0 Gi0/1' },
        { id: 'd', text: 'switchport mode access' },
      ],
      correct: ['a'],
      explanation:
        'La interfaz estaba administrativamente apagada. En modo config-if, `no shutdown` la levanta y aparece la ruta conectada, restaurando la conectividad.',
      labHint:
        'En R1: `enable`, `conf t`, `interface Gi0/1`, `no shutdown`. Luego desde PC1: `ping 192.168.2.10`.',
      createTopology() {
        const b = new TopologyBuilder();
        b.pc('pc1', 'PC1', { x: 120, y: 200 })
          .router('r1', 'R1', { x: 360, y: 200 })
          .pc('pc2', 'PC2', { x: 600, y: 200 });
        b.link('pc1', 'FastEthernet0', 'r1', 'GigabitEthernet0/0');
        b.link('r1', 'GigabitEthernet0/1', 'pc2', 'FastEthernet0');
        b.ip('pc1', 'FastEthernet0', '192.168.1.10', M24).gateway('pc1', '192.168.1.1');
        b.ip('pc2', 'FastEthernet0', '192.168.2.10', M24).gateway('pc2', '192.168.2.1');
        b.ip('r1', 'GigabitEthernet0/0', '192.168.1.1', M24);
        b.ip('r1', 'GigabitEthernet0/1', '192.168.2.1', M24, { enabled: false });
        return b.build();
      },
      checks: [interfaceEnabled('R1', 'GigabitEthernet0/1'), pingSucceeds('PC1', '192.168.2.10')],
    },

    // 2 — default gateway on a PC
    {
      id: 'pq-default-gateway',
      domain: DOMAINS.FUND,
      difficulty: 'Beginner',
      prompt:
        'PC1 (192.168.1.10/24) tiene IP pero no alcanza PC2 en otra subred. R1 (192.168.1.1) enruta bien. ¿Qué le falta a PC1?',
      choices: [
        { id: 'a', text: 'ip default-gateway 192.168.1.1' },
        { id: 'b', text: 'no shutdown' },
        { id: 'c', text: 'ip route 192.168.2.0 255.255.255.0 192.168.1.1' },
        { id: 'd', text: 'switchport access vlan 1' },
      ],
      correct: ['a'],
      explanation:
        'Un host necesita una puerta de enlace para el tráfico fuera de su subred. `ip default-gateway 192.168.1.1` en PC1 le indica a quién enviar los paquetes remotos.',
      labHint:
        'En PC1: `enable`, `conf t`, `ip default-gateway 192.168.1.1`, `end`. Luego `ping 192.168.2.10`.',
      createTopology() {
        const b = new TopologyBuilder();
        b.pc('pc1', 'PC1', { x: 120, y: 200 })
          .router('r1', 'R1', { x: 360, y: 200 })
          .pc('pc2', 'PC2', { x: 600, y: 200 });
        b.link('pc1', 'FastEthernet0', 'r1', 'GigabitEthernet0/0');
        b.link('r1', 'GigabitEthernet0/1', 'pc2', 'FastEthernet0');
        b.ip('pc1', 'FastEthernet0', '192.168.1.10', M24); // sin gateway
        b.ip('pc2', 'FastEthernet0', '192.168.2.10', M24).gateway('pc2', '192.168.2.1');
        b.ip('r1', 'GigabitEthernet0/0', '192.168.1.1', M24);
        b.ip('r1', 'GigabitEthernet0/1', '192.168.2.1', M24);
        return b.build();
      },
      checks: [defaultGatewayIs('PC1', '192.168.1.1'), pingSucceeds('PC1', '192.168.2.10')],
    },

    // 3 — assign an IP
    {
      id: 'pq-ip-address',
      domain: DOMAINS.CONN,
      difficulty: 'Beginner',
      prompt: 'La interfaz Gi0/0 de R1 no tiene dirección. ¿Qué comando le asigna 192.168.1.1/24?',
      choices: [
        { id: 'a', text: 'ip address 192.168.1.1 255.255.255.0' },
        { id: 'b', text: 'ip address 192.168.1.1/24' },
        { id: 'c', text: 'address 192.168.1.1 255.255.255.0' },
        { id: 'd', text: 'ip 192.168.1.1 255.255.255.0' },
      ],
      correct: ['a'],
      explanation:
        'En IOS la sintaxis es `ip address <ip> <máscara>` con máscara en decimal punteado (no prefijo). Debe hacerse dentro de la interfaz.',
      labHint:
        'En R1: `conf t`, `interface Gi0/0`, `ip address 192.168.1.1 255.255.255.0`, `no shutdown`. Verifica con `show ip interface brief`.',
      createTopology() {
        const b = new TopologyBuilder();
        b.pc('pc1', 'PC1', { x: 160, y: 200 }).router('r1', 'R1', { x: 420, y: 200 });
        b.link('pc1', 'FastEthernet0', 'r1', 'GigabitEthernet0/0');
        b.ip('pc1', 'FastEthernet0', '192.168.1.10', M24).gateway('pc1', '192.168.1.1');
        b.ip('r1', 'GigabitEthernet0/0', null, null, { enabled: true });
        return b.build();
      },
      checks: [
        interfaceHasIp('R1', 'GigabitEthernet0/0', '192.168.1.1', M24),
        pingSucceeds('PC1', '192.168.1.1'),
      ],
    },

    // 4 — VLAN mismatch
    {
      id: 'pq-vlan-access',
      domain: DOMAINS.ACCESS,
      difficulty: 'Intermediate',
      prompt:
        'PC1 y PC2 están en la misma subred conectados a SW1, pero no se hacen ping. Fa0/1 está en VLAN 10 y Fa0/2 en VLAN 20. ¿Qué comando en Fa0/2 lo arregla?',
      choices: [
        { id: 'a', text: 'switchport access vlan 10' },
        { id: 'b', text: 'switchport mode trunk' },
        { id: 'c', text: 'no shutdown' },
        { id: 'd', text: 'vlan 20' },
      ],
      correct: ['a'],
      explanation:
        'Los puertos de acceso solo reenvían dentro de su VLAN. Para que PC2 conviva con PC1 debe estar en la misma VLAN: `switchport access vlan 10`.',
      labHint:
        'En SW1: `conf t`, `interface Fa0/2`, `switchport access vlan 10`. Comprueba con `show vlan brief` y `ping` entre PCs.',
      createTopology() {
        const b = new TopologyBuilder();
        b.pc('pc1', 'PC1', { x: 120, y: 160 })
          .switch('sw1', 'SW1', { x: 360, y: 260 })
          .pc('pc2', 'PC2', { x: 600, y: 160 });
        b.link('pc1', 'FastEthernet0', 'sw1', 'FastEthernet0/1');
        b.link('pc2', 'FastEthernet0', 'sw1', 'FastEthernet0/2');
        b.ip('pc1', 'FastEthernet0', '192.168.10.11', M24);
        b.ip('pc2', 'FastEthernet0', '192.168.10.12', M24);
        b.accessVlan('sw1', 'FastEthernet0/1', 10);
        b.accessVlan('sw1', 'FastEthernet0/2', 20);
        return b.build();
      },
      checks: [accessVlanIs('SW1', 'FastEthernet0/2', 10), pingSucceeds('PC1', '192.168.10.12')],
    },

    // 5 — trunk between switches
    {
      id: 'pq-trunk',
      domain: DOMAINS.ACCESS,
      difficulty: 'Intermediate',
      prompt:
        'El enlace entre SW1 y SW2 (Gi0/1) debe transportar varias VLANs. ¿Qué comando convierte ese puerto en troncal 802.1Q?',
      choices: [
        { id: 'a', text: 'switchport mode trunk' },
        { id: 'b', text: 'switchport access vlan 99' },
        { id: 'c', text: 'no switchport' },
        { id: 'd', text: 'channel-group 1 mode on' },
      ],
      correct: ['a'],
      explanation:
        'Un enlace entre switches que lleva múltiples VLANs debe ser troncal: `switchport mode trunk` (en ambos extremos). Un puerto de acceso solo lleva una VLAN.',
      labHint:
        'En SW1 y SW2: `interface Gi0/1`, `switchport mode trunk`. Con PC1 y PC2 en la misma VLAN a cada lado, `ping` debe funcionar.',
      createTopology() {
        const b = new TopologyBuilder();
        b.pc('pc1', 'PC1', { x: 100, y: 160 })
          .switch('sw1', 'SW1', { x: 300, y: 260 })
          .switch('sw2', 'SW2', { x: 520, y: 260 })
          .pc('pc2', 'PC2', { x: 720, y: 160 });
        b.link('pc1', 'FastEthernet0', 'sw1', 'FastEthernet0/1');
        b.link('sw1', 'GigabitEthernet0/1', 'sw2', 'GigabitEthernet0/1');
        b.link('sw2', 'FastEthernet0/1', 'pc2', 'FastEthernet0');
        b.ip('pc1', 'FastEthernet0', '192.168.10.11', M24);
        b.ip('pc2', 'FastEthernet0', '192.168.10.12', M24);
        b.accessVlan('sw1', 'FastEthernet0/1', 10);
        b.accessVlan('sw2', 'FastEthernet0/1', 10);
        // El enlace inter-switch está en acceso VLAN 1 (mal): hay que troncalizarlo.
        b.accessVlan('sw1', 'GigabitEthernet0/1', 1);
        b.accessVlan('sw2', 'GigabitEthernet0/1', 1);
        return b.build();
      },
      checks: [pingSucceeds('PC1', '192.168.10.12')],
    },

    // 6 — static route
    {
      id: 'pq-static-route',
      domain: DOMAINS.CONN,
      difficulty: 'Intermediate',
      prompt:
        'R1 no conoce la red 192.168.2.0/24 que está detrás de R2 (siguiente salto 10.0.0.2). ¿Qué comando añade la ruta estática?',
      choices: [
        { id: 'a', text: 'ip route 192.168.2.0 255.255.255.0 10.0.0.2' },
        { id: 'b', text: 'ip route 192.168.2.0 10.0.0.2' },
        { id: 'c', text: 'route add 192.168.2.0 10.0.0.2' },
        { id: 'd', text: 'network 192.168.2.0 0.0.0.255 area 0' },
      ],
      correct: ['a'],
      explanation:
        'La sintaxis es `ip route <red> <máscara> <siguiente-salto>`. Aquí `ip route 192.168.2.0 255.255.255.0 10.0.0.2`. En R2 se necesita la ruta de vuelta a 192.168.1.0/24.',
      labHint:
        'En R1: `ip route 192.168.2.0 255.255.255.0 10.0.0.2`. (R2 ya tiene la ruta de vuelta.) Luego `ping` PC1→PC2 y `show ip route`.',
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
        b.topology.getNode('r2').device.config.staticRoutes.push({
          prefix: '192.168.1.0',
          mask: M24,
          nextHop: '10.0.0.1',
        });
        return b.build();
      },
      checks: [pingSucceeds('PC1', '192.168.2.10')],
    },

    // 7 — OSPF network statement
    {
      id: 'pq-ospf-network',
      domain: DOMAINS.CONN,
      difficulty: 'Advanced',
      prompt:
        'R1 y R2 son vecinos OSPF, pero R1 no recibe la LAN 192.168.2.0/24. ¿Qué comando en R2 (bajo `router ospf 1`) la anuncia en el área 0?',
      choices: [
        { id: 'a', text: 'network 192.168.2.0 0.0.0.255 area 0' },
        { id: 'b', text: 'network 192.168.2.0 255.255.255.0 area 0' },
        { id: 'c', text: 'ip route 192.168.2.0 255.255.255.0 area 0' },
        { id: 'd', text: 'redistribute connected' },
      ],
      correct: ['a'],
      explanation:
        'OSPF usa máscara wildcard (inversa). Para /24 es `0.0.0.255`: `network 192.168.2.0 0.0.0.255 area 0`. Solo las redes anunciadas se propagan como rutas O.',
      labHint:
        'En R2: `router ospf 1`, `network 192.168.2.0 0.0.0.255 area 0`. En R1: `show ip route` (aparece la O) y `ping` PC1→PC2.',
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
        b.ospf('r1', 1, [
          { address: '192.168.1.0', wildcard: '0.0.0.255', area: 0 },
          { address: '10.0.0.0', wildcard: '0.0.0.3', area: 0 },
        ]);
        b.ospf('r2', 1, [{ address: '10.0.0.0', wildcard: '0.0.0.3', area: 0 }]); // falta la LAN
        return b.build();
      },
      checks: [ospfNeighborUp('R1'), pingSucceeds('PC1', '192.168.2.10')],
    },

    // 8 — DHCP pool
    {
      id: 'pq-dhcp',
      domain: DOMAINS.SVC,
      difficulty: 'Intermediate',
      prompt:
        'Quieres que R1 entregue direcciones a la LAN 192.168.1.0/24. Dentro de `ip dhcp pool LAN`, ¿qué comando define el rango?',
      choices: [
        { id: 'a', text: 'network 192.168.1.0 255.255.255.0' },
        { id: 'b', text: 'ip address 192.168.1.0 255.255.255.0' },
        { id: 'c', text: 'range 192.168.1.1 192.168.1.254' },
        { id: 'd', text: 'dhcp network 192.168.1.0/24' },
      ],
      correct: ['a'],
      explanation:
        'Dentro del pool: `network <red> <máscara>` define el rango, y `default-router` la puerta de enlace. Los clientes piden dirección con `ip address dhcp`.',
      labHint:
        'En R1: `ip dhcp pool LAN`, `network 192.168.1.0 255.255.255.0`, `default-router 192.168.1.1`. En PC1: `interface Fa0`, `ip address dhcp`.',
      createTopology() {
        const b = new TopologyBuilder();
        b.router('r1', 'R1', { x: 200, y: 200 })
          .switch('sw1', 'SW1', { x: 400, y: 260 })
          .pc('pc1', 'PC1', { x: 620, y: 180 });
        b.link('r1', 'GigabitEthernet0/0', 'sw1', 'FastEthernet0/1');
        b.link('pc1', 'FastEthernet0', 'sw1', 'FastEthernet0/2');
        b.ip('r1', 'GigabitEthernet0/0', '192.168.1.1', M24);
        return b.build();
      },
      checks: [pingSucceeds('PC1', '192.168.1.1')],
    },

    // 9 — NAT overload
    {
      id: 'pq-nat-overload',
      domain: DOMAINS.SVC,
      difficulty: 'Advanced',
      prompt:
        'Los hosts internos deben salir compartiendo la IP pública de Gi0/1 (PAT). Ya marcaste inside/outside y la ACL 1. ¿Qué comando activa la sobrecarga?',
      choices: [
        { id: 'a', text: 'ip nat inside source list 1 interface Gi0/1 overload' },
        { id: 'b', text: 'ip nat outside source list 1 interface Gi0/1' },
        { id: 'c', text: 'ip nat pool 1 overload' },
        { id: 'd', text: 'access-list 1 permit any' },
      ],
      correct: ['a'],
      explanation:
        'PAT: `ip nat inside source list <acl> interface <if-outside> overload`. Traduce las fuentes internas a la IP de la interfaz exterior distinguiéndolas por puerto.',
      labHint:
        'En R1: `ip nat inside source list 1 interface Gi0/1 overload`. Desde PC1: `ping 203.0.113.9` y en R1 `show ip nat translations`.',
      createTopology() {
        const b = new TopologyBuilder();
        b.pc('pc1', 'PC1', { x: 120, y: 200 })
          .router('r1', 'R1', { x: 360, y: 200 })
          .pc('ext', 'EXT', { x: 600, y: 200 });
        b.link('pc1', 'FastEthernet0', 'r1', 'GigabitEthernet0/0');
        b.link('r1', 'GigabitEthernet0/1', 'ext', 'FastEthernet0');
        b.ip('pc1', 'FastEthernet0', '192.168.1.10', M24).gateway('pc1', '192.168.1.1');
        b.ip('r1', 'GigabitEthernet0/0', '192.168.1.1', M24);
        b.ip('r1', 'GigabitEthernet0/1', '203.0.113.1', M24);
        b.ip('ext', 'FastEthernet0', '203.0.113.9', M24).gateway('ext', '203.0.113.1');
        const r1 = b.topology.getNode('r1').device;
        r1.getInterface('GigabitEthernet0/0').natRole = 'inside';
        r1.getInterface('GigabitEthernet0/1').natRole = 'outside';
        r1.config.acls['1'] = {
          type: 'standard',
          entries: [
            { type: 'standard', action: 'permit', srcIp: '192.168.1.0', srcWildcard: '0.0.0.255' },
          ],
        };
        return b.build();
      },
      checks: [pingSucceeds('PC1', '203.0.113.9')],
    },

    // 10 — standard ACL
    {
      id: 'pq-acl-block',
      domain: DOMAINS.SEC,
      difficulty: 'Advanced',
      prompt:
        'Debes impedir que el host 192.168.1.66 llegue al servidor pero permitir a los demás. ¿Qué lista de acceso estándar es correcta (en orden)?',
      choices: [
        { id: 'a', text: 'deny host 192.168.1.66  /  permit any' },
        { id: 'b', text: 'permit any  /  deny host 192.168.1.66' },
        { id: 'c', text: 'deny host 192.168.1.66 (solo esa línea)' },
        { id: 'd', text: 'permit host 192.168.1.66' },
      ],
      correct: ['a'],
      explanation:
        'El orden importa y hay un deny any implícito al final. Primero `deny host 192.168.1.66`, luego `permit any`. Si pones permit any primero, nunca se aplica el deny.',
      labHint:
        'En R1: `access-list 10 deny host 192.168.1.66`, `access-list 10 permit any`, `interface Gi0/1`, `ip access-group 10 out`. Prueba `ping` desde ambos PCs.',
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
        return b.build();
      },
      checks: [pingSucceeds('PC1', '192.168.2.10'), pingFails('GUEST', '192.168.2.10')],
    },

    // 11 — STP root bridge (conceptual + verifiable)
    {
      id: 'pq-stp-root',
      domain: DOMAINS.ACCESS,
      difficulty: 'Intermediate',
      prompt:
        'Tres switches forman un triángulo (mismo priority por defecto). ¿Cómo se decide cuál es el puente raíz de spanning tree?',
      choices: [
        { id: 'a', text: 'El menor bridge ID (prioridad y, a igualdad, menor MAC)' },
        { id: 'b', text: 'El que tenga más puertos' },
        { id: 'c', text: 'El de mayor dirección IP' },
        { id: 'd', text: 'El primero que se encendió' },
      ],
      correct: ['a'],
      explanation:
        'Gana el menor Bridge ID = prioridad (por defecto 32768) + MAC. A igual prioridad, decide la MAC más baja. En el emulador puedes verlo con `show spanning-tree`.',
      labHint:
        'Abre cualquier switch y ejecuta `show spanning-tree`: verás quién es raíz y qué puerto queda en BLK (bloqueado) para romper el bucle.',
      createTopology() {
        const b = new TopologyBuilder();
        b.switch('s1', 'S1', { x: 320, y: 150 })
          .switch('s2', 'S2', { x: 500, y: 380 })
          .switch('s3', 'S3', { x: 140, y: 380 });
        b.link('s1', 'GigabitEthernet0/1', 's2', 'GigabitEthernet0/1');
        b.link('s2', 'GigabitEthernet0/2', 's3', 'GigabitEthernet0/1');
        b.link('s3', 'GigabitEthernet0/2', 's1', 'GigabitEthernet0/2');
        return b.build();
      },
      checks: [],
    },

    // 12 — subnetting (conceptual)
    {
      id: 'pq-subnet-29',
      domain: DOMAINS.FUND,
      difficulty: 'Intermediate',
      prompt: '¿Cuántas direcciones de host utilizables ofrece una subred /29?',
      choices: [
        { id: 'a', text: '6' },
        { id: 'b', text: '8' },
        { id: 'c', text: '14' },
        { id: 'd', text: '30' },
      ],
      correct: ['a'],
      explanation:
        'Un /29 deja 3 bits de host: 2^3 = 8 direcciones, menos la de red y la de broadcast = 6 hosts utilizables. Útil para enlaces con pocos equipos.',
      labHint:
        'Practica: pon dos PCs y un switch, direcciónalos dentro de un /29 (p. ej. .1 y .2 con máscara 255.255.255.248) y verifica el ping.',
      createTopology() {
        const b = new TopologyBuilder();
        b.pc('pc1', 'PC1', { x: 160, y: 180 })
          .switch('sw1', 'SW1', { x: 380, y: 260 })
          .pc('pc2', 'PC2', { x: 600, y: 180 });
        b.link('pc1', 'FastEthernet0', 'sw1', 'FastEthernet0/1');
        b.link('pc2', 'FastEthernet0', 'sw1', 'FastEthernet0/2');
        return b.build();
      },
      checks: [],
    },
  ];
}
