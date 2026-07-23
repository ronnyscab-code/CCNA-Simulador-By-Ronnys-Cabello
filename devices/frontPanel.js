/**
 * frontPanel.js
 *
 * Turns a device's interface list into a front-panel layout: the geometry of
 * a chassis and every port square on it, so the canvas can draw a Catalyst
 * 2960 with its 24 bocas instead of a generic icon, and anchor each cable to
 * the actual port it is patched into.
 *
 * Ports are grouped by interface family (FastEthernet / GigabitEthernet /
 * Serial) because that is how real gear is laid out — a block of access
 * ports, then the uplinks, then the WAN slots. Within a block of more than
 * four ports the numbering alternates top/bottom row exactly like the silk
 * screen on a real switch: 1 above 2, 3 above 4, and so on.
 *
 * DOM-free and deterministic: same device in, same geometry out. All
 * coordinates are relative to the chassis top-left corner.
 */

const PORT = 11;
const GAP_X = 3;
const GAP_Y = 3;
const PAD = 8;
const HEADER = 15;
const CAPTION = 11;
const GROUP_GAP = 11;
const MIN_WIDTH = 104;

/**
 * @typedef {{name: string, x: number, y: number, size: number, family: string}} PortBox
 * @typedef {{width: number, height: number, ports: PortBox[],
 *            groups: {label: string, x: number, y: number, width: number}[]}} PanelLayout
 */

/**
 * Strips the trailing slot/port numbering off an interface name, leaving the
 * family: `GigabitEthernet1/0/24` → `GigabitEthernet`.
 * @param {string} name
 * @returns {string}
 */
export function interfaceFamily(name) {
  return name.replace(/[\d/.]+$/, '');
}

/**
 * The short form Cisco prints on the chassis itself.
 * @param {string} family
 * @returns {string}
 */
function familyAbbrev(family) {
  if (family.startsWith('Gigabit')) return 'Gi';
  if (family.startsWith('Fast')) return 'Fa';
  if (family.startsWith('Serial')) return 'Se';
  if (family.startsWith('Ethernet')) return 'Et';
  return family.slice(0, 2);
}

/**
 * Columns/rows for a block of ports. Blocks of five or more go double-row,
 * which is what makes a 24-port switch read as a switch.
 * @param {number} count
 * @returns {{cols: number, rows: number}}
 */
function gridFor(count) {
  if (count <= 4) return { cols: count, rows: 1 };
  return { cols: Math.ceil(count / 2), rows: 2 };
}

/**
 * Computes the chassis geometry and every port square for a device.
 * @param {{hostname: string, interfaces: Array<{name: string}>}} device
 * @returns {PanelLayout}
 */
export function frontPanelLayout(device) {
  const interfaces = device?.interfaces ?? [];
  if (interfaces.length === 0) {
    return { width: MIN_WIDTH, height: HEADER + PAD * 2 + PORT, ports: [], groups: [] };
  }

  // Preserve declaration order — it is already the order Cisco numbers them.
  /** @type {Map<string, string[]>} */
  const families = new Map();
  for (const iface of interfaces) {
    const family = interfaceFamily(iface.name);
    if (!families.has(family)) families.set(family, []);
    families.get(family).push(iface.name);
  }

  /** @type {PortBox[]} */
  const ports = [];
  /** @type {{label: string, x: number, y: number, width: number}[]} */
  const groups = [];

  let cursorX = PAD;
  let maxRows = 1;

  for (const [family, names] of families) {
    const { cols, rows } = gridFor(names.length);
    maxRows = Math.max(maxRows, rows);

    names.forEach((name, index) => {
      // Two-row blocks alternate top/bottom the way the silk screen does:
      // port 1 above port 2, port 3 above port 4.
      const col = rows === 2 ? Math.floor(index / 2) : index;
      const row = rows === 2 ? index % 2 : 0;
      ports.push({
        name,
        family,
        size: PORT,
        x: cursorX + col * (PORT + GAP_X),
        y: HEADER + PAD + row * (PORT + GAP_Y),
      });
    });

    const width = cols * (PORT + GAP_X) - GAP_X;
    groups.push({ label: familyAbbrev(family), x: cursorX, y: 0, width });
    cursorX += width + GROUP_GAP;
  }

  const contentWidth = cursorX - GROUP_GAP + PAD;
  const width = Math.max(MIN_WIDTH, contentWidth);
  const height = HEADER + PAD + maxRows * (PORT + GAP_Y) - GAP_Y + CAPTION + PAD;

  // Caption sits below the tallest block, shared by every group.
  const captionY = HEADER + PAD + maxRows * (PORT + GAP_Y) - GAP_Y + CAPTION - 2;
  for (const group of groups) group.y = captionY;

  return { width, height, ports, groups };
}

/**
 * Locates one port square within a layout.
 * @param {PanelLayout} layout
 * @param {string} portName
 * @returns {PortBox|null}
 */
export function findPort(layout, portName) {
  if (!portName) return null;
  return layout.ports.find((p) => p.name === portName) ?? null;
}

/**
 * The world-space centre of a port on a node drawn as a chassis. Node
 * coordinates are the chassis centre, so the layout is offset by half its
 * size. Falls back to the node centre for an unknown port.
 * @param {{x: number, y: number}} node
 * @param {PanelLayout} layout
 * @param {string} portName
 * @returns {{x: number, y: number}}
 */
export function portAnchor(node, layout, portName) {
  const port = findPort(layout, portName);
  if (!port) return { x: node.x, y: node.y };
  return {
    x: node.x - layout.width / 2 + port.x + port.size / 2,
    y: node.y - layout.height / 2 + port.y + port.size / 2,
  };
}
