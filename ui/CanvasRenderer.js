/**
 * CanvasRenderer.js
 *
 * Stateless SVG rendering functions for the topology canvas. Every function
 * here takes the DOM references it needs plus plain data and mutates the
 * DOM — it never reads from `Topology`/`SelectionManager`/`Camera` directly
 * and never listens for events. `CanvasManager` is the only caller, and it
 * decides *when* to re-render; this module only decides *how*.
 *
 * Keeping rendering this dumb makes it trivial to reason about: given the
 * same inputs, the SVG output is always the same.
 */

import { getDeviceMeta } from './DeviceIcons.js';
import { portAnchor } from '../devices/frontPanel.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
export const GRID_SIZE = 24;

/**
 * @param {string} tag
 * @param {object} [attrs]
 * @returns {SVGElement}
 */
export function createSvgElement(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, String(value));
  }
  return el;
}

/**
 * @param {Element} el
 */
export function clearElement(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/**
 * Builds the static SVG structure (grid, world group, layers) once and
 * returns references to the pieces later render calls need to update.
 * @param {SVGSVGElement} svgRoot
 * @returns {object} refs
 */
export function buildCanvasLayers(svgRoot) {
  clearElement(svgRoot);

  const defs = createSvgElement('defs');
  const gridPattern = createSvgElement('pattern', {
    id: 'grid-pattern',
    width: GRID_SIZE,
    height: GRID_SIZE,
    patternUnits: 'userSpaceOnUse',
  });
  const gridDot = createSvgElement('circle', {
    class: 'canvas-grid-dot',
    cx: 1,
    cy: 1,
    r: 1,
  });
  gridPattern.appendChild(gridDot);
  defs.appendChild(gridPattern);

  const gridRect = createSvgElement('rect', {
    class: 'grid-background',
    x: 0,
    y: 0,
    width: '100%',
    height: '100%',
    fill: 'url(#grid-pattern)',
  });

  const worldGroup = createSvgElement('g', { class: 'world-group' });
  const zonesLayer = createSvgElement('g', { class: 'zones-layer' });
  const edgesLayer = createSvgElement('g', { class: 'edges-layer' });
  const nodesLayer = createSvgElement('g', { class: 'nodes-layer' });
  const pendingEdgeLayer = createSvgElement('g', { class: 'pending-edge-layer' });
  worldGroup.append(zonesLayer, edgesLayer, nodesLayer, pendingEdgeLayer);

  const selectionBoxRect = createSvgElement('rect', {
    class: 'selection-box',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  selectionBoxRect.style.display = 'none';

  svgRoot.append(defs, gridRect, worldGroup, selectionBoxRect);

  return {
    svgRoot,
    defs,
    gridPattern,
    gridRect,
    worldGroup,
    zonesLayer,
    edgesLayer,
    nodesLayer,
    pendingEdgeLayer,
    selectionBoxRect,
  };
}

/**
 * @param {object} refs
 * @param {import('./Camera.js').Camera} camera
 * @param {boolean} visible
 */
export function updateGrid(refs, camera, visible) {
  refs.gridRect.style.display = visible ? '' : 'none';
  if (!visible) return;
  refs.gridPattern.setAttribute('patternTransform', camera.getTransformString());
}

/**
 * @param {object} refs
 * @param {import('./Camera.js').Camera} camera
 */
export function updateWorldTransform(refs, camera) {
  refs.worldGroup.setAttribute('transform', camera.getTransformString());
}

/**
 * @param {object} refs
 * @param {import('../topology/Node.js').Node[]} nodes
 * @param {Set<string>} selectedNodeIds
 * @param {string|null} connectSourceId
 * @param {object} [view] - See `CanvasManager.viewState()`.
 */
export function renderNodes(refs, nodes, selectedNodeIds, connectSourceId, view = {}) {
  clearElement(refs.nodesLayer);

  for (const node of nodes) {
    const meta = getDeviceMeta(node.deviceType);
    const group = createSvgElement('g', {
      class: 'topology-node',
      'data-node-id': node.id,
      transform: `translate(${node.x} ${node.y})`,
    });
    if (selectedNodeIds.has(node.id)) group.classList.add('selected');
    if (connectSourceId === node.id) group.classList.add('connect-source');

    const layout = view.chassis ? view.layouts?.get(node.id) : null;
    if (layout) {
      renderChassis(group, node, layout, view);
      refs.nodesLayer.appendChild(group);
      continue;
    }

    const halfW = node.width / 2;
    const halfH = node.height / 2;

    const hitArea = createSvgElement('rect', {
      class: 'node-hit-area',
      x: -halfW - 8,
      y: -halfH - 8,
      width: node.width + 16,
      height: node.height + 24,
    });

    const iconBg = createSvgElement('rect', {
      class: 'node-icon-bg',
      x: -halfW,
      y: -halfH,
      width: node.width,
      height: node.height,
      rx: 8,
    });

    const iconSize = node.width * 0.6;
    const icon = createSvgElement('image', {
      x: -iconSize / 2,
      y: -iconSize / 2,
      width: iconSize,
      height: iconSize,
      href: meta.icon,
    });
    icon.style.pointerEvents = 'none';

    const label = createSvgElement('text', {
      class: 'node-label',
      x: 0,
      y: halfH + 14,
    });
    label.textContent = node.hostname;
    label.style.pointerEvents = 'none';

    group.append(hitArea, iconBg, icon, label);
    refs.nodesLayer.appendChild(group);
  }
}

/**
 * Draws one device as its front panel: a chassis plate with a name band and
 * one square per interface, lit by that port's live state. Coordinates come
 * from `devices/frontPanel.js`, which lays the ports out the way the model's
 * real silk screen numbers them.
 * @param {SVGElement} group
 * @param {import('../topology/Node.js').Node} node
 * @param {object} layout
 * @param {object} view
 */
function renderChassis(group, node, layout, view) {
  group.classList.add('chassis-node');
  const halfW = layout.width / 2;
  const halfH = layout.height / 2;

  const hitArea = createSvgElement('rect', {
    class: 'node-hit-area',
    x: -halfW - 4,
    y: -halfH - 4,
    width: layout.width + 8,
    height: layout.height + 8,
  });

  const plate = createSvgElement('rect', {
    class: 'chassis-plate',
    x: -halfW,
    y: -halfH,
    width: layout.width,
    height: layout.height,
    rx: 7,
  });

  const name = createSvgElement('text', {
    class: 'chassis-name',
    x: -halfW + 8,
    y: -halfH + 11,
  });
  name.textContent = node.hostname;

  group.append(hitArea, plate, name);

  const modelLabel = view.modelLabels?.get(node.id);
  if (modelLabel) {
    const model = createSvgElement('text', {
      class: 'chassis-model',
      x: halfW - 8,
      y: -halfH + 11,
      'text-anchor': 'end',
    });
    model.textContent = modelLabel;
    group.appendChild(model);
  }

  for (const port of layout.ports) {
    const level = view.portLevels?.get(`${node.id}|${port.name}`) ?? null;
    const square = createSvgElement('rect', {
      class: `chassis-port${level ? ` port-${level}` : ''}`,
      x: -halfW + port.x,
      y: -halfH + port.y,
      width: port.size,
      height: port.size,
      rx: 2,
    });
    const tooltip = createSvgElement('title');
    tooltip.textContent = level ? `${port.name} — ${level}` : `${port.name} — libre`;
    square.appendChild(tooltip);
    group.appendChild(square);
  }

  for (const band of layout.groups) {
    const caption = createSvgElement('text', {
      class: 'chassis-caption',
      x: -halfW + band.x,
      y: -halfH + band.y,
    });
    caption.textContent = band.label;
    group.appendChild(caption);
  }
}

/**
 * Draws the subnet/VLAN regions behind everything else: one rounded box per
 * broadcast domain, sized to its members and labelled with its CIDR.
 * @param {object} refs
 * @param {Array<object>} zones
 * @param {Map<string, import('../topology/Node.js').Node>} nodesById
 * @param {object} view
 */
export function renderZones(refs, zones, nodesById, view = {}) {
  clearElement(refs.zonesLayer);
  if (!view.zones) return;

  const PAD = 30;
  for (const zone of zones) {
    const members = zone.nodeIds.map((id) => nodesById.get(id)).filter(Boolean);
    if (members.length === 0) continue;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of members) {
      const layout = view.chassis ? view.layouts?.get(node.id) : null;
      const halfW = (layout?.width ?? node.width) / 2;
      const halfH = (layout?.height ?? node.height) / 2;
      minX = Math.min(minX, node.x - halfW);
      minY = Math.min(minY, node.y - halfH);
      maxX = Math.max(maxX, node.x + halfW);
      maxY = Math.max(maxY, node.y + halfH);
    }

    const group = createSvgElement('g', {
      class: `topology-zone zone-${zone.level}`,
      'data-zone-id': zone.id,
    });

    // The box must never be narrower than its own caption, or the CIDR spills
    // out over the canvas. Monospace at 10px is very close to 6px per glyph.
    const text = zone.note ? `${zone.label}  ⚠` : zone.label;
    const width = Math.max(maxX - minX + PAD * 2, text.length * 6 + 26);

    const box = createSvgElement('rect', {
      class: 'zone-box',
      x: minX - PAD,
      y: minY - PAD,
      width,
      height: maxY - minY + PAD * 2 + 8,
      rx: 14,
    });
    const label = createSvgElement('text', {
      class: 'zone-label',
      x: minX - PAD + 12,
      y: minY - PAD + 17,
    });
    label.textContent = text;

    const tooltip = createSvgElement('title');
    tooltip.textContent = zone.note ?? `Puerta de enlace: ${zone.gateway ?? 'ninguna'}`;
    box.appendChild(tooltip);

    group.append(box, label);
    refs.zonesLayer.appendChild(group);
  }
}

/**
 * @param {object} refs
 * @param {import('../topology/Edge.js').Edge[]} edges
 * @param {Map<string, import('../topology/Node.js').Node>} nodesById
 * @param {Set<string>} selectedEdgeIds
 */
export function renderEdges(refs, edges, nodesById, selectedEdgeIds, view = {}) {
  clearElement(refs.edgesLayer);

  for (const edge of edges) {
    const source = nodesById.get(edge.sourceNodeId);
    const target = nodesById.get(edge.targetNodeId);
    if (!source || !target) continue;

    // In chassis mode a cable lands on the port it is actually patched into,
    // not on the middle of the device.
    const from = anchorFor(source, edge.sourcePort, view);
    const to = anchorFor(target, edge.targetPort, view);
    const level = view.linkLevels?.get(edge.id) ?? null;

    const group = createSvgElement('g', {
      class: 'topology-edge-group',
      'data-edge-id': edge.id,
    });

    const hitLine = createSvgElement('line', {
      class: 'topology-edge-hit',
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
    });

    const visibleLine = createSvgElement('line', {
      class: `topology-edge${level ? ` link-${level}` : ''}`,
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
    });
    if (selectedEdgeIds.has(edge.id)) visibleLine.classList.add('selected');

    const reason = view.linkReasons?.get(edge.id);
    if (reason) {
      const tooltip = createSvgElement('title');
      tooltip.textContent = reason;
      hitLine.appendChild(tooltip);
    }

    group.append(hitLine, visibleLine);

    if (view.portLabels) {
      group.append(
        portLabel(from, to, edge.sourcePort, view),
        portLabel(to, from, edge.targetPort, view),
      );
    }

    refs.edgesLayer.appendChild(group);
  }
}

/**
 * Where a cable meets a device: the port square in chassis mode, the node
 * centre otherwise.
 * @param {import('../topology/Node.js').Node} node
 * @param {string} portName
 * @param {object} view
 * @returns {{x: number, y: number}}
 */
function anchorFor(node, portName, view) {
  const layout = view.chassis ? view.layouts?.get(node.id) : null;
  if (!layout) return { x: node.x, y: node.y };
  return portAnchor(node, layout, portName);
}

/**
 * A small interface name floated just off the device end of a cable.
 * @param {{x: number, y: number}} at - the end being labelled.
 * @param {{x: number, y: number}} towards - the far end, giving the direction.
 * @param {string} portName
 * @param {object} view
 * @returns {SVGElement}
 */
function portLabel(at, towards, portName, view) {
  const dx = towards.x - at.x;
  const dy = towards.y - at.y;
  const length = Math.hypot(dx, dy) || 1;
  const offset = 26;

  const text = createSvgElement('text', {
    class: 'edge-port-label',
    x: at.x + (dx / length) * offset,
    y: at.y + (dy / length) * offset - 5,
    'text-anchor': 'middle',
  });
  text.textContent = view.shortPort ? view.shortPort(portName) : portName;
  return text;
}

/**
 * @param {object} refs
 * @param {import('../topology/Node.js').Node|null} fromNode
 * @param {{x: number, y: number}|null} toWorldPoint
 */
export function renderPendingEdge(refs, fromNode, toWorldPoint) {
  clearElement(refs.pendingEdgeLayer);
  if (!fromNode || !toWorldPoint) return;

  const line = createSvgElement('line', {
    class: 'pending-edge-preview',
    x1: fromNode.x,
    y1: fromNode.y,
    x2: toWorldPoint.x,
    y2: toWorldPoint.y,
  });
  refs.pendingEdgeLayer.appendChild(line);
}

/**
 * @param {object} refs
 * @param {{x: number, y: number, width: number, height: number}|null} boxScreen
 */
export function renderSelectionBox(refs, boxScreen) {
  if (!boxScreen) {
    refs.selectionBoxRect.style.display = 'none';
    return;
  }
  refs.selectionBoxRect.style.display = '';
  refs.selectionBoxRect.setAttribute('x', boxScreen.x);
  refs.selectionBoxRect.setAttribute('y', boxScreen.y);
  refs.selectionBoxRect.setAttribute('width', boxScreen.width);
  refs.selectionBoxRect.setAttribute('height', boxScreen.height);
}
