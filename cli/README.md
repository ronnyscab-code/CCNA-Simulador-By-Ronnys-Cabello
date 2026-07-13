# cli/

**Status:** implemented in **v0.3** (see [../docs/ROADMAP.md](../docs/ROADMAP.md)).

The Cisco-style CLI. DOM-free — a terminal widget in `ui/` renders it, but
the parser and command handlers operate purely on `devices/`/`topology/`.

- `modes.js` — CLI mode enum and prompt construction.
- `CommandTree.js` — generic command trie: minimum-unique abbreviation
  (`conf t`), Tab/`?` completion, IOS-style error messages.
- `CliSession.js` — per-device session: mode stack, submode context
  (interface/VLAN/line/router being configured), command history.
- `commands.js` — builds the command tree for each mode and registers every
  handler.
- `showCommands.js` — all `show ...` commands.
- `RunningConfig.js` — renders `show running-config` and the config-derived
  show outputs (`ip interface brief`, `interfaces`, `vlan brief`).

Reimplemented from publicly documented command syntax and output shapes — no
Cisco source or documentation text is copied (see the Content Policy in the
root [README.md](../README.md)). Commands that need runtime tables (dynamic
MAC/ARP/routing, spanning-tree, OSPF adjacencies) render correct empty
output today and are filled in by the packet engine and protocols from v0.4
onward.
