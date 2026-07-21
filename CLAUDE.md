# CLAUDE.md

Guidance for Claude when working in this repo. Read this first — it exists
so you don't have to re-explore the tree or re-read large files every
session.

## What this project is

OpenCCNA Simulator — a browser-based CCNA network simulator. Static site,
ES Modules, no build step, no framework. ~100 JS files, ~20k lines, ~1.2MB.

For the full feature list and dev commands: `README.md`.
For layering rules and data flow: `docs/ARCHITECTURE.md`.
Don't re-derive either of these by exploring the code — read the doc.

## Layering rule (hard constraint)

Everything except `ui/` must run outside a browser (no `document`/`window`).
`ui/` is the only layer allowed to touch the DOM or import the data layers.
Mutations to `topology/` go through a `Command` + `HistoryManager.execute()`
for undo/redo — never mutate `Topology` directly.

```
topology/    pure data model, emits events
engine/      simulation + persistence (localStorage/IndexedDB), no DOM
devices/     Router/Switch/PC/... class hierarchy, no DOM
protocols/   ARP/ICMP/OSPF/DHCP/NAT/ACL, no DOM
cli/         Cisco-style CLI parser + commands, no DOM
scenarios/   troubleshooting-lab engine (checks, scoring), no DOM
labs/        the actual lab/scenario CONTENT (data), consumed by scenarios/
trainer/     CCNA Trainer: question bank, spaced repetition, stats, no DOM
ui/          all DOM rendering/events — the only browser-aware layer
js/main.js   wires the layers together
```

Every non-empty folder above has its own `README.md` — read that one file
instead of opening every source file in the folder to figure out what's there.

## Heavy files — do NOT read these whole for small edits

These are large data banks, not logic. Reading them in full burns tens of
thousands of tokens for a one-line change. Instead: `Grep` for the id,
keyword, or a similarly-shaped entry, then read only that slice (or use
`Read` with `offset`/`limit` around the matched line).

| File                             | Size | What it is                                |
| -------------------------------- | ---- | ----------------------------------------- |
| `labs/practiceQuestionsExtra.js` | ~48K | practice-lab question bank #2             |
| `labs/scenarios.js`              | ~46K | troubleshooting scenario catalog          |
| `ui/TrainerPanel.js`             | ~35K | Trainer UI (code, not data — still large) |
| `trainer/questions.js`           | ~29K | CCNA Trainer question bank                |
| `trainer/ccnpQuestions.js`       | ~25K | CCNP question bank                        |
| `labs/practiceQuestions.js`      | ~22K | practice-lab question bank #1             |
| `cli/showCommandsExtra.js`       | ~19K | extra `show` command handlers             |
| `cli/showCommands.js`            | ~19K | core `show` command handlers              |
| `cli/commands.js`                | ~16K | config command tree                       |
| `trainer/generatedQuestions.js`  | ~15K | procedurally generated questions          |

To add/edit one question or scenario: grep for a nearby `id:` to see the
object shape, edit just that object, don't load the whole array into context.

## Never read these

`package-lock.json`, `CHANGELOG.md`, `node_modules/` (gitignored) — never
needed to understand or change code.

## Tests

`tests/*.test.js` are named by feature, not by source file 1:1 (e.g.
`ospf.test.js`, `vlan-stp.test.js`, `nat.test.js`, `dhcp.test.js`,
`practice-questions.test.js`). Grep `tests/` by feature keyword instead of
opening all 24 files. Run one file, not the whole suite, when verifying a
targeted change:

```bash
node --test tests/ospf.test.js
```

## Commands

```bash
npm run dev            # serve locally (required — ES Modules need http://, not file://)
npm run lint            # ESLint
npm run format:check    # Prettier check
npm test                 # full suite (node:test)
```

## Content policy

No Cisco source/docs/icons are copied, and no exam questions are copied from
any third-party question bank — everything is written from scratch against
the public CCNA 200-301 blueprint. Keep new content original.
