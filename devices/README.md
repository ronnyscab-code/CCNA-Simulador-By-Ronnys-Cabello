# devices/

**Status:** implemented in **v0.2** (see [../docs/ROADMAP.md](../docs/ROADMAP.md)).

The logical device layer. Pure data + behavior, no DOM.

- `net-utils.js` — MAC generation/validation and IPv4 math (int/mask/prefix
  conversion, network/broadcast/same-subnet).
- `NetworkInterface.js` — one port: IOS-style name, MAC, IPv4 address/mask,
  admin state, switchport settings.
- `Device.js` — base class: hostname, interfaces, capabilities, config
  state, IOS interface-name expansion.
- `Router.js`, `Switch.js`, `PC.js`, `Laptop.js`, `Server.js`,
  `Firewall.js`, `AccessPoint.js`, `Cloud.js`, `Printer.js` — concrete
  device types with default interface layouts.
- `DeviceFactory.js` — the one registry mapping a type key to its class,
  used for both creation and deserialization.
- `models.js` — catalog of selectable hardware models (2960/3560/2901/4331…),
  each one a named interface layout.
- `frontPanel.js` — turns a device's interfaces into chassis geometry (port
  squares grouped by family, numbered top/bottom like the real silk screen)
  so the canvas can draw and cable a real front panel.

A topology `Node` (`../topology/Node.js`) owns one `Device`. The CLI (v0.3)
and packet engine (v0.4+) program against `Device`/`NetworkInterface`, never
the concrete subclasses.
