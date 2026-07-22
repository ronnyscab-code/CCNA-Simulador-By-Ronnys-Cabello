import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Topology } from '../topology/Topology.js';
import { PacketEngine } from '../engine/PacketEngine.js';
import { ScenarioEngine } from '../scenarios/ScenarioEngine.js';
import { diagnoseTopology, buildValidationReport } from '../scenarios/diagnostics.js';
import {
  allScenarios,
  generateShutdownScenarios,
  generateGatewayScenarios,
  generateVlanScenarios,
  generateWrongGatewayScenarios,
  generateWrongNextHopScenarios,
} from '../labs/scenarios.js';

function load(scenario) {
  const topology = new Topology();
  const engine = new PacketEngine(topology);
  const scenarioEngine = new ScenarioEngine({ topology, engine });
  scenarioEngine.load(scenario);
  return { topology, scenarioEngine };
}

describe('topology diagnostics point at the fault', () => {
  test('a shut interface is reported as an error', () => {
    const { topology } = load(generateShutdownScenarios(1)[0]);
    const findings = diagnoseTopology(topology);
    assert.ok(
      findings.some((f) => f.level === 'error' && /apagada/.test(f.message)),
      JSON.stringify(findings),
    );
  });

  test('a missing default gateway is flagged', () => {
    const { topology } = load(generateGatewayScenarios(1)[0]);
    const findings = diagnoseTopology(topology);
    assert.ok(
      findings.some((f) => /puerta de enlace/.test(f.message)),
      JSON.stringify(findings),
    );
  });

  test('a gateway outside the subnet is an error', () => {
    const { topology } = load(generateWrongGatewayScenarios(1)[0]);
    const findings = diagnoseTopology(topology);
    assert.ok(findings.some((f) => /puerta de enlace/.test(f.message)));
  });

  test('same-subnet hosts split across VLANs are flagged', () => {
    const { topology } = load(generateVlanScenarios(1)[0]);
    const findings = diagnoseTopology(topology);
    assert.ok(
      findings.some((f) => /VLAN/.test(f.message)),
      JSON.stringify(findings),
    );
  });

  test('an unreachable static next hop is flagged', () => {
    const { topology } = load(generateWrongNextHopScenarios(1)[0]);
    const findings = diagnoseTopology(topology);
    assert.ok(findings.some((f) => /siguiente salto/.test(f.message)));
  });

  test('a correctly solved topology has no findings', () => {
    const { topology, scenarioEngine } = load(generateShutdownScenarios(1)[0]);
    topology.getNode('r1').device.getInterface('GigabitEthernet0/1').enabled = true;
    assert.equal(scenarioEngine.evaluate().passedAll, true);
    assert.equal(diagnoseTopology(topology).length, 0);
  });
});

describe('validation report combines objectives and findings', () => {
  test('a broken lab reports "hay fallos" plus at least one finding', () => {
    const scenario = generateShutdownScenarios(1)[0];
    const { topology, scenarioEngine } = load(scenario);
    const report = buildValidationReport(scenarioEngine.evaluate(), topology);
    assert.equal(report.status.ok, false);
    assert.ok(report.findings.length >= 1);
    assert.ok(report.findings.some((f) => f.level === 'error'));
  });

  test('a solved lab reports success and only passing objectives', () => {
    const scenario = generateShutdownScenarios(1)[0];
    const { topology, scenarioEngine } = load(scenario);
    topology.getNode('r1').device.getInterface('GigabitEthernet0/1').enabled = true;
    const report = buildValidationReport(scenarioEngine.evaluate(), topology);
    assert.equal(report.status.ok, true);
    assert.ok(report.findings.every((f) => f.level === 'ok'));
  });

  test('every catalog scenario produces a report without throwing', () => {
    for (const scenario of allScenarios()) {
      const { topology, scenarioEngine } = load(scenario);
      const report = buildValidationReport(scenarioEngine.evaluate(), topology);
      assert.ok(report.status && Array.isArray(report.findings));
    }
  });
});
