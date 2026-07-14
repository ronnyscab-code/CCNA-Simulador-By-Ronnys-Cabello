# labs/

Scenario **content** for the troubleshooting labs (added in v0.9).

- `scenarios.js` — the catalog: authored broken-network scenarios plus
  `generateAddressingScenarios()`, a parametric generator. `allScenarios()`
  returns the full list consumed by the Labs UI.
- `builders.js` — `TopologyBuilder`, a fluent helper for authoring scenario
  topologies with real `Topology`/`Node`/`Edge` objects.

The engine that runs and scores these lives in [`../scenarios/`](../scenarios/).
Each scenario is `{ id, title, difficulty, objective, description,
createTopology(), checks, hints, explanation }`.
