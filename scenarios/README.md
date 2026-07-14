# scenarios/

The troubleshooting scenario **engine** (added in v0.9). DOM-free.

- `checks.js` — reusable validation predicates (`pingSucceeds`,
  `interfaceHasIp`, `accessVlanIs`, `ospfNeighborUp`, ...). Each check has a
  description, a point weight, and a `run({ topology, engine })` returning
  pass/fail + detail.
- `ScenarioEngine.js` — loads a scenario's broken topology into the live
  model, runs its checks on demand, scores the attempt, and manages hint
  reveals.

Scenario **content** (the actual broken networks) lives in
[`../labs/`](../labs/); the Labs UI is `../ui/ScenarioPanel.js`.
