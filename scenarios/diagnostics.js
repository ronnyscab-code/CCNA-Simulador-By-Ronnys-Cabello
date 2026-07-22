/**
 * diagnostics.js
 *
 * A heuristic "where is the fault?" scanner for a loaded topology. Given the
 * live `Topology`, it walks the devices and flags the common CCNA
 * misconfigurations — a shut interface with a cable, an unaddressed link, a
 * default gateway outside the host's subnet or pointing at nobody, two
 * same-subnet hosts split across VLANs, or a static route whose next hop is
 * unreachable.
 *
 * It complements the scenario's own pass/fail checks: the checks say WHETHER
 * the objective is met; this points at WHERE a likely problem is, so the
 * "Validar" (Play) button can bote the fault(s) instead of just "not solved".
 *
 * DOM-free and pure. Returned findings are ordered errors-first.
 */

import { sameSubnet, networkAddress } from '../devices/net-utils.js';

/**
 * @typedef {{level: 'error'|'warn', where: string, message: string}} Finding
 */

/**
 * Combines a scenario evaluation with a topology scan into a single report for
 * the "Validar" (Play) button: a status line plus a findings list showing the
 * objectives and where the likely fault(s) are.
 * @param {{passedAll: boolean, score: number, maxScore: number, results: Array<{passed: boolean, description: string, detail?: string}>}} evaluation
 * @param {import('../topology/Topology.js').Topology} topology
 * @returns {{status: {ok: boolean, text: string}, findings: Array<{level: string, text: string}>}}
 */
export function buildValidationReport(evaluation, topology) {
  const findings = [];
  for (const r of evaluation.results ?? []) {
    findings.push({
      level: r.passed ? 'ok' : 'error',
      text: r.detail ? `${r.description} — ${r.detail}` : r.description,
    });
  }
  for (const d of diagnoseTopology(topology)) {
    findings.push({ level: d.level, text: `${d.where}: ${d.message}` });
  }
  const status = evaluation.passedAll
    ? { ok: true, text: '✔ ¡Conexión correcta! Objetivo cumplido.' }
    : { ok: false, text: `Aún hay fallos — objetivos ${evaluation.score}/${evaluation.maxScore}` };
  return { status, findings };
}

/**
 * @param {import('../topology/Topology.js').Topology} topology
 * @returns {Finding[]} likely faults, most severe first.
 */
export function diagnoseTopology(topology) {
  const findings = [];
  const nodes = topology.getNodes().filter((n) => n.device);

  for (const node of nodes) {
    const dev = node.device;
    const isSwitch = Boolean(dev.capabilities?.switching);
    const isEndpoint = Boolean(dev.capabilities?.endpoint);

    // Cabled interfaces on routers/hosts should be up and addressed.
    for (const edge of topology.getEdgesForNode(node.id)) {
      const port = topology.portForNode(edge, node.id);
      const iface = dev.getInterface(port);
      if (!iface || isSwitch) continue;
      if (!iface.enabled) {
        findings.push(
          err(node, port, `${short(port)} está conectada pero apagada — usa \`no shutdown\`.`),
        );
      } else if (!iface.ipAddress) {
        findings.push(
          warn(node, port, `${short(port)} está conectada pero no tiene dirección IP.`),
        );
      }
    }

    // Host default-gateway sanity.
    if (isEndpoint) {
      const iface = dev.interfaces.find((i) => i.ipAddress && i.subnetMask);
      const gw = dev.defaultGateway;
      if (iface && gw) {
        if (!sameSubnet(iface.ipAddress, gw, iface.subnetMask)) {
          findings.push(
            err(
              node,
              null,
              `su puerta de enlace ${gw} no está en la subred de ${iface.ipAddress}.`,
            ),
          );
        } else if (!gatewayIsOwnedOnSegment(topology, node.id, gw)) {
          findings.push(
            warn(node, null, `su puerta de enlace ${gw} no la tiene ningún router conectado.`),
          );
        }
      } else if (iface && !gw && routerOnSegment(topology, node.id, iface)) {
        // Has an IP and a router on its segment, but no gateway to reach other nets.
        findings.push(warn(node, null, `${node.hostname} no tiene puerta de enlace configurada.`));
      }
    }

    // Static routes whose next hop isn't in any connected subnet.
    for (const route of dev.config?.staticRoutes ?? []) {
      if (route.nextHop === '0.0.0.0') continue;
      if (!nextHopReachable(dev, route.nextHop)) {
        findings.push(
          warn(
            node,
            null,
            `la ruta a ${route.prefix} apunta a un siguiente salto inalcanzable (${route.nextHop}).`,
          ),
        );
      }
    }
  }

  // Same-subnet hosts split across different access VLANs on a switch.
  findings.push(...diagnoseVlanSplits(topology, nodes));

  findings.sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1));
  return findings;
}

/**
 * @param {import('../topology/Topology.js').Topology} topology
 * @param {string} nodeId
 * @param {string} gatewayIp
 * @returns {boolean} whether a directly-connected neighbour owns the gateway IP.
 */
function gatewayIsOwnedOnSegment(topology, nodeId, gatewayIp) {
  for (const edge of topology.getEdgesForNode(nodeId)) {
    const otherId = edge.otherNodeId(nodeId);
    const neighbours = expandSegment(topology, otherId, new Set([nodeId]));
    for (const nb of neighbours) {
      const d = topology.getNode(nb)?.device;
      if (d && d.interfaces.some((i) => i.ipAddress === gatewayIp)) return true;
    }
  }
  return false;
}

/**
 * Walks through switches (Layer 2) to collect every node reachable on the same
 * broadcast segment, so a host connected via a switch can still "see" its
 * router's IP.
 * @param {import('../topology/Topology.js').Topology} topology
 * @param {string} startId
 * @param {Set<string>} visited
 * @returns {string[]}
 */
function expandSegment(topology, startId, visited) {
  const out = [];
  const stack = [startId];
  while (stack.length) {
    const id = stack.pop();
    if (visited.has(id)) continue;
    visited.add(id);
    out.push(id);
    const dev = topology.getNode(id)?.device;
    // Only keep crossing through switches; routers/hosts terminate the segment.
    if (dev?.capabilities?.switching) {
      for (const edge of topology.getEdgesForNode(id)) stack.push(edge.otherNodeId(id));
    }
  }
  return out;
}

/**
 * Whether a router (with an IP on the host's subnet) sits on the host's
 * segment — i.e. the host has somewhere to point a default gateway.
 * @param {import('../topology/Topology.js').Topology} topology
 * @param {string} nodeId
 * @param {{ipAddress: string, subnetMask: string}} hostIface
 * @returns {boolean}
 */
function routerOnSegment(topology, nodeId, hostIface) {
  for (const edge of topology.getEdgesForNode(nodeId)) {
    for (const nb of expandSegment(topology, edge.otherNodeId(nodeId), new Set([nodeId]))) {
      const d = topology.getNode(nb)?.device;
      if (
        d?.capabilities?.routing &&
        d.interfaces.some(
          (i) =>
            i.ipAddress &&
            i.subnetMask &&
            sameSubnet(i.ipAddress, hostIface.ipAddress, hostIface.subnetMask),
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * @param {import('../devices/Device.js').Device} device
 * @param {string} nextHop
 * @returns {boolean}
 */
function nextHopReachable(device, nextHop) {
  return device.interfaces.some(
    (i) => i.ipAddress && i.subnetMask && sameSubnet(i.ipAddress, nextHop, i.subnetMask),
  );
}

/**
 * @param {import('../topology/Topology.js').Topology} topology
 * @param {object[]} nodes
 * @returns {Finding[]}
 */
function diagnoseVlanSplits(topology, nodes) {
  const findings = [];
  for (const sw of nodes.filter((n) => n.device.capabilities?.switching)) {
    /** @type {Array<{port: string, vlan: number, subnet: string, host: string}>} */
    const hostPorts = [];
    for (const edge of topology.getEdgesForNode(sw.id)) {
      const port = topology.portForNode(edge, sw.id);
      const iface = sw.device.getInterface(port);
      const other = topology.getNode(edge.otherNodeId(sw.id));
      const hostIface = other?.device?.interfaces?.find((i) => i.ipAddress && i.subnetMask);
      if (!iface || iface.switchportMode === 'trunk' || !hostIface) continue;
      hostPorts.push({
        port,
        vlan: iface.accessVlan ?? 1,
        subnet: networkAddress(hostIface.ipAddress, hostIface.subnetMask),
        host: other.hostname,
      });
    }
    for (let a = 0; a < hostPorts.length; a += 1) {
      for (let b = a + 1; b < hostPorts.length; b += 1) {
        if (
          hostPorts[a].subnet === hostPorts[b].subnet &&
          hostPorts[a].vlan !== hostPorts[b].vlan
        ) {
          findings.push(
            warn(
              sw,
              null,
              `${hostPorts[a].host} (VLAN ${hostPorts[a].vlan}) y ${hostPorts[b].host} (VLAN ${hostPorts[b].vlan}) comparten subred pero están en VLANs distintas.`,
            ),
          );
        }
      }
    }
  }
  return findings;
}

/**
 * @param {object} node
 * @param {string|null} port
 * @param {string} message
 * @returns {Finding}
 */
function err(node, port, message) {
  return { level: 'error', where: label(node, port), message };
}

function warn(node, port, message) {
  return { level: 'warn', where: label(node, port), message };
}

function label(node, port) {
  return port ? `${node.hostname} ${short(port)}` : node.hostname;
}

/**
 * Abbreviates an interface name IOS-style (GigabitEthernet0/0 → Gi0/0).
 * @param {string} name
 * @returns {string}
 */
function short(name) {
  return name
    .replace(/^GigabitEthernet/, 'Gi')
    .replace(/^FastEthernet/, 'Fa')
    .replace(/^Ethernet/, 'Et')
    .replace(/^Serial/, 'Se');
}
