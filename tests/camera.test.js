import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Camera } from '../ui/Camera.js';

describe('Camera', () => {
  test('starts at the identity transform', () => {
    const camera = new Camera();
    assert.equal(camera.scale, 1);
    assert.equal(camera.tx, 0);
    assert.equal(camera.ty, 0);
  });

  test('toWorld / toScreen round-trip at identity', () => {
    const camera = new Camera();
    const screen = { x: 123, y: 456 };
    const world = camera.toWorld(screen.x, screen.y);
    const backToScreen = camera.toScreen(world.x, world.y);
    assert.equal(backToScreen.x, screen.x);
    assert.equal(backToScreen.y, screen.y);
  });

  test('panBy translates without changing scale', () => {
    const camera = new Camera();
    camera.panBy(10, -5);
    assert.equal(camera.tx, 10);
    assert.equal(camera.ty, -5);
    assert.equal(camera.scale, 1);
  });

  test('zoomAt keeps the focal screen point stationary in world space', () => {
    const camera = new Camera();
    camera.panBy(37, -12); // arbitrary starting offset
    const focal = { x: 200, y: 150 };
    const worldBefore = camera.toWorld(focal.x, focal.y);

    camera.zoomAt(1.5, focal.x, focal.y);

    const worldAfter = camera.toWorld(focal.x, focal.y);
    assert.ok(Math.abs(worldAfter.x - worldBefore.x) < 1e-9);
    assert.ok(Math.abs(worldAfter.y - worldBefore.y) < 1e-9);
  });

  test('zoom is clamped to the configured min/max scale', () => {
    const camera = new Camera();
    for (let i = 0; i < 50; i += 1) camera.zoomOut(0, 0);
    assert.ok(camera.scale >= 0.2);

    for (let i = 0; i < 50; i += 1) camera.zoomIn(0, 0);
    assert.ok(camera.scale <= 3);
  });

  test('reset restores the identity transform', () => {
    const camera = new Camera();
    camera.panBy(50, 50);
    camera.zoomIn(0, 0);
    camera.reset();
    assert.equal(camera.tx, 0);
    assert.equal(camera.ty, 0);
    assert.equal(camera.scale, 1);
  });

  test('getZoomPercent reflects scale', () => {
    const camera = new Camera();
    assert.equal(camera.getZoomPercent(), 100);
  });

  test('dispatches "change" on pan and zoom', () => {
    const camera = new Camera();
    let changes = 0;
    camera.addEventListener('change', () => (changes += 1));

    camera.panBy(1, 1);
    camera.zoomIn(0, 0);
    camera.reset();

    assert.equal(changes, 3);
  });

  describe('fitToContent', () => {
    test('centres the content in the viewport', () => {
      const camera = new Camera();
      // A 200×100 box centred at (100, 50), framed in an 800×600 viewport.
      camera.fitToContent({ minX: 0, minY: 0, maxX: 200, maxY: 100 }, 800, 600, 0);
      const screenCentre = camera.toScreen(100, 50);
      assert.ok(Math.abs(screenCentre.x - 400) < 0.001);
      assert.ok(Math.abs(screenCentre.y - 300) < 0.001);
    });

    test('scales so the content fits within the padded viewport', () => {
      const camera = new Camera();
      camera.fitToContent({ minX: 0, minY: 0, maxX: 400, maxY: 200 }, 800, 600, 0);
      // Width is the binding dimension: 800/400 = 2, but height allows 600/200 = 3.
      assert.equal(camera.scale, 2);
    });

    test('never exceeds the zoom limits', () => {
      const camera = new Camera();
      // A tiny 1×1 box would want a huge scale; it clamps to MAX_SCALE (3).
      camera.fitToContent({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, 800, 600, 0);
      assert.ok(camera.scale <= 3);
    });

    test('honours padding', () => {
      const camera = new Camera();
      camera.fitToContent({ minX: 0, minY: 0, maxX: 200, maxY: 200 }, 800, 800, 50);
      // Usable area is 700×700 for a 200×200 box → 3.5, clamped to 3.
      assert.ok(camera.scale <= 3);
      // Content still centred despite the margin.
      const c = camera.toScreen(100, 100);
      assert.ok(Math.abs(c.x - 400) < 0.001 && Math.abs(c.y - 400) < 0.001);
    });
  });
});
