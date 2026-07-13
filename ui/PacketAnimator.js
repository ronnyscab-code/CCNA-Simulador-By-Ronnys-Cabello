/**
 * PacketAnimator.js
 *
 * Draws packets travelling across the topology on a Canvas overlay above the
 * SVG. The packet engine (`engine/PacketEngine.js`) returns a trace of
 * events — each a frame kind plus the node path it follows — and this class
 * plays them one after another as labelled dots gliding from node to node.
 *
 * Canvas (rather than SVG) is used here deliberately, per the project's
 * rendering split: these are many short-lived, non-interactive moving
 * objects, which Canvas draws more cheaply than mutating the SVG DOM. World
 * coordinates come from the topology; every frame is re-projected to screen
 * space through the `Camera`, so packets stay glued to their devices while
 * the user pans and zooms mid-flight.
 */

const SEGMENT_MS = 420; // travel time per hop
const GAP_MS = 120; // pause between consecutive frames

const KIND_STYLE = {
  'arp-request': { color: '#f2b53c', label: 'ARP' },
  'arp-reply': { color: '#f2b53c', label: 'ARP' },
  'icmp-request': { color: '#4f9dff', label: 'ICMP' },
  'icmp-reply': { color: '#3ecf8e', label: 'ICMP' },
};

export class PacketAnimator {
  /**
   * @param {object} deps
   * @param {HTMLElement} deps.container - the canvas-container element.
   * @param {import('../topology/Topology.js').Topology} deps.topology
   * @param {import('./Camera.js').Camera} deps.camera
   */
  constructor({ container, topology, camera }) {
    this.container = container;
    this.topology = topology;
    this.camera = camera;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'packet-canvas';
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    /** @type {Array<{kind: string, path: string[]}>} */
    this.queue = [];
    this.active = null; // { kind, points, startTime }
    this.rafId = null;

    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  /**
   * Enqueues an engine event trace for playback. Frames animate strictly in
   * order (e.g. ARP request, then ARP reply, then ICMP).
   * @param {Array<{kind: string, path: string[]}>} events
   */
  play(events) {
    this.queue.push(...events);
    if (!this.rafId) this._startNext(performance.now());
  }

  _resize() {
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /**
   * @param {number} now
   */
  _startNext(now) {
    const event = this.queue.shift();
    if (!event) {
      this._stop();
      return;
    }

    const points = event.path
      .map((nodeId) => this.topology.getNode(nodeId))
      .filter(Boolean)
      .map((node) => ({ x: node.x, y: node.y }));

    if (points.length < 2) {
      // Nothing to animate (node vanished); skip to the next event.
      this._startNext(now);
      return;
    }

    this.active = { kind: event.kind, points, startTime: now + GAP_MS };
    this.rafId = requestAnimationFrame((t) => this._frame(t));
  }

  /**
   * @param {number} now
   */
  _frame(now) {
    this._clear();
    const anim = this.active;
    if (!anim) {
      this._stop();
      return;
    }

    const segments = anim.points.length - 1;
    const totalMs = segments * SEGMENT_MS;
    const elapsed = now - anim.startTime;

    if (elapsed < 0) {
      // Still in the inter-frame gap.
      this.rafId = requestAnimationFrame((t) => this._frame(t));
      return;
    }

    const t = Math.min(1, elapsed / totalMs);
    const world = this._pointAlong(anim.points, t);
    this._drawPacket(world, anim.kind);

    if (t >= 1) {
      this.active = null;
      this._startNext(now);
      return;
    }
    this.rafId = requestAnimationFrame((frameTime) => this._frame(frameTime));
  }

  /**
   * Interpolates a point a fraction `t` (0..1) along a polyline.
   * @param {Array<{x: number, y: number}>} points
   * @param {number} t
   * @returns {{x: number, y: number}}
   */
  _pointAlong(points, t) {
    const segments = points.length - 1;
    const scaled = t * segments;
    const index = Math.min(segments - 1, Math.floor(scaled));
    const localT = scaled - index;
    const a = points[index];
    const b = points[index + 1];
    return { x: a.x + (b.x - a.x) * localT, y: a.y + (b.y - a.y) * localT };
  }

  /**
   * @param {{x: number, y: number}} world
   * @param {string} kind
   */
  _drawPacket(world, kind) {
    const style = KIND_STYLE[kind] ?? { color: '#ffffff', label: '' };
    const screen = this.camera.toScreen(world.x, world.y);
    const radius = 9;

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
    this.ctx.fillStyle = style.color;
    this.ctx.globalAlpha = 0.9;
    this.ctx.fill();

    this.ctx.globalAlpha = 1;
    this.ctx.fillStyle = '#12131a';
    this.ctx.font = '9px -apple-system, sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(style.label, screen.x, screen.y + 0.5);
    this.ctx.restore();
  }

  _clear() {
    const rect = this.container.getBoundingClientRect();
    this.ctx.clearRect(0, 0, rect.width, rect.height);
  }

  _stop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.active = null;
    this._clear();
  }
}
