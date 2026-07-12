/**
 * Camera.js
 *
 * Owns the pan/zoom transform for the infinite canvas and every
 * screen↔world coordinate conversion. Nothing else in the UI layer is
 * allowed to compute this math directly — `CanvasRenderer` reads
 * `getTransformString()` to position the SVG world group, and
 * `CanvasInteractions` calls `toWorld()`/`panBy()`/`zoomAt()` in response to
 * pointer events. Centralizing it here is what makes pan, zoom, drag, and
 * rubber-band selection agree on where things are.
 *
 * Convention: `screen = world * scale + translate`, i.e. the SVG world
 * group is rendered with `transform="translate(tx, ty) scale(s)"`.
 */

const MIN_SCALE = 0.2;
const MAX_SCALE = 3;
const ZOOM_STEP = 1.2;

export class Camera extends EventTarget {
  constructor() {
    super();
    this.tx = 0;
    this.ty = 0;
    this.scale = 1;
  }

  /**
   * Pans by a screen-space delta (e.g. mouse movement in pixels).
   * @param {number} dx
   * @param {number} dy
   */
  panBy(dx, dy) {
    this.tx += dx;
    this.ty += dy;
    this._emitChange();
  }

  /**
   * Zooms by a multiplicative factor, keeping the given screen point
   * stationary in world space (the standard "zoom toward cursor" feel).
   * @param {number} factor - e.g. 1.1 to zoom in 10%, 1/1.1 to zoom out.
   * @param {number} centerX - Screen-space X to zoom toward.
   * @param {number} centerY - Screen-space Y to zoom toward.
   */
  zoomAt(factor, centerX, centerY) {
    const newScale = clamp(this.scale * factor, MIN_SCALE, MAX_SCALE);
    const appliedFactor = newScale / this.scale;

    this.tx = centerX - appliedFactor * (centerX - this.tx);
    this.ty = centerY - appliedFactor * (centerY - this.ty);
    this.scale = newScale;

    this._emitChange();
  }

  /**
   * Zooms in one fixed step, centered on the given screen point.
   * @param {number} centerX
   * @param {number} centerY
   */
  zoomIn(centerX, centerY) {
    this.zoomAt(ZOOM_STEP, centerX, centerY);
  }

  /**
   * Zooms out one fixed step, centered on the given screen point.
   * @param {number} centerX
   * @param {number} centerY
   */
  zoomOut(centerX, centerY) {
    this.zoomAt(1 / ZOOM_STEP, centerX, centerY);
  }

  /**
   * Resets pan and zoom to the identity transform.
   */
  reset() {
    this.tx = 0;
    this.ty = 0;
    this.scale = 1;
    this._emitChange();
  }

  /**
   * Converts a screen-space (pixel, relative to the canvas element) point
   * to world-space (topology) coordinates.
   * @param {number} screenX
   * @param {number} screenY
   * @returns {{x: number, y: number}}
   */
  toWorld(screenX, screenY) {
    return {
      x: (screenX - this.tx) / this.scale,
      y: (screenY - this.ty) / this.scale,
    };
  }

  /**
   * Converts a world-space point to screen-space pixels.
   * @param {number} worldX
   * @param {number} worldY
   * @returns {{x: number, y: number}}
   */
  toScreen(worldX, worldY) {
    return {
      x: worldX * this.scale + this.tx,
      y: worldY * this.scale + this.ty,
    };
  }

  /**
   * @returns {string} an SVG `transform` attribute value.
   */
  getTransformString() {
    return `translate(${this.tx} ${this.ty}) scale(${this.scale})`;
  }

  /**
   * @returns {number} current zoom level as a percentage, e.g. 100 for 1x.
   */
  getZoomPercent() {
    return Math.round(this.scale * 100);
  }

  _emitChange() {
    this.dispatchEvent(new CustomEvent('change'));
  }
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
