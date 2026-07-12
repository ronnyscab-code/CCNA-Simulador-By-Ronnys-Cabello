# cli/

**Status:** empty — lands in **v0.3** (see [../docs/ROADMAP.md](../docs/ROADMAP.md)).

Will hold the Cisco-style CLI parser and command implementations: mode
tracking (`config`, `config-if`, `config-router`, `config-line`,
`config-vlan`), the command table, tab completion, command history, and
Cisco-style error messages. Reimplemented from publicly documented command
syntax — no Cisco source or documentation text is copied (see the Content
Policy in the root [README.md](../README.md)). The CLI operates on
`devices/` objects and is rendered by a terminal widget in `ui/`, but the
parser itself stays DOM-free.
