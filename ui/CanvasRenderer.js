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
  const edgesLayer = createSvgElement('g', { class: 'edges-layer' });
  const nodesLayer = createSvgElement('g', { class: 'nodes-layer' });
  const pendingEdgeLayer = createSvgElement('g', { class: 'pending-edge-layer' });
  worldGroup.append(edgesLayer, nodesLayer, pendingEdgeLayer);

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
 */
export function renderNodes(refs, nodes, selectedNodeIds, connectSourceId) {
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
 * @param {object} refs
 * @param {import('../topology/Edge.js').Edge[]} edges
 * @param {Map<string, import('../topology/Node.js').Node>} nodesById
 * @param {Set<string>} selectedEdgeIds
 */
export function renderEdges(refs, edges, nodesById, selectedEdgeIds) {
  clearElement(refs.edgesLayer);

  for (const edge of edges) {
    const source = nodesById.get(edge.sourceNodeId);
    const target = nodesById.get(edge.targetNodeId);
    if (!source || !target) continue;

    const group = createSvgElement('g', {
      class: 'topology-edge-group',
      'data-edge-id': edge.id,
    });

    const hitLine = createSvgElement('line', {
      class: 'topology-edge-hit',
      x1: source.x,
      y1: source.y,
      x2: target.x,
      y2: target.y,
    });

    const visibleLine = createSvgElement('line', {
      class: 'topology-edge',
      x1: source.x,
      y1: source.y,
      x2: target.x,
      y2: target.y,
    });
    if (selectedEdgeIds.has(edge.id)) visibleLine.classList.add('selected');

    group.append(hitLine, visibleLine);
    refs.edgesLayer.appendChild(group);
  }
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
