# devices/

**Status:** empty — lands in **v0.2** (see [../docs/ROADMAP.md](../docs/ROADMAP.md)).

Will hold the `Device` base class and its subclasses (`Router`, `Switch`,
`PC`, `Laptop`, `Server`, `Firewall`, `AccessPoint`, `Cloud`, `Printer`),
each carrying hostname, interfaces, MAC/IP addressing, and device state.
This upgrades the minimal `topology/Node.js` placeholder used by the v0.1
editor into a real, simulatable device model. Must stay DOM-free — see
[../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md).
