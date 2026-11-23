import test from "node:test";
import assert from "node:assert/strict";
import { viewportLayout } from "../src/viewportLayout.ts";

test("Fit contains the entire planner and preserves start alignment for design panels", () => {
  for (const [width, height] of [
    [1280, 800],
    [320, 1400],
    [1600, 1600],
  ]) {
    for (const [frameWidth, frameHeight] of [
      [300, 500],
      [1200, 700],
      [800, 260],
    ]) {
      const view = viewportLayout({ width, height, frameWidth, frameHeight });
      assert.ok(view.scale <= 1);
      assert.ok(view.x >= -0.00001 && view.y >= -0.00001);
      assert.ok(view.x + width * view.scale <= frameWidth + 0.00001);
      assert.ok(view.y + height * view.scale <= frameHeight + 0.00001);
    }
  }
  assert.equal(
    viewportLayout({
      width: 264,
      height: 400,
      frameWidth: 280,
      frameHeight: 700,
      align: "start",
    }).y,
    0,
  );
});

test("zoom uses the fitted scale and pan bounds keep both edges reachable", () => {
  const size = { width: 1280, height: 1000, frameWidth: 640, frameHeight: 500 };
  const fit = viewportLayout(size),
    zoom = viewportLayout({ ...size, zoom: 3 });
  assert.equal(zoom.scale, fit.scale * 3);
  const start = viewportLayout({
    ...size,
    zoom: 3,
    pan: { x: Infinity, y: Infinity },
  });
  assert.equal(start.x, 0);
  assert.equal(start.y, 0);
  const end = viewportLayout({
    ...size,
    zoom: 3,
    pan: { x: -Infinity, y: -Infinity },
  });
  assert.equal(end.x + size.width * end.scale, size.frameWidth);
  assert.equal(end.y + size.height * end.scale, size.frameHeight);
  const reset = viewportLayout({ ...size, pan: start.pan });
  assert.deepEqual(reset.pan, { x: 0, y: 0 });
  assert.equal(reset.x, fit.x);
  assert.equal(reset.y, fit.y);
});

test("resizing and one-axis overflow cannot strand the planner outside the viewport", () => {
  for (const zoom of [1, 1.25, 2, 4]) {
    for (const [frameWidth, frameHeight] of [
      [300, 800],
      [1200, 220],
      [1800, 1800],
    ]) {
      for (const pan of [
        { x: -10000, y: 10000 },
        { x: 10000, y: -10000 },
      ]) {
        const view = viewportLayout({
          width: 1200,
          height: 800,
          frameWidth,
          frameHeight,
          zoom,
          pan,
        });
        for (const [offset, size, frame] of [
          [view.x, 1200 * view.scale, frameWidth],
          [view.y, 800 * view.scale, frameHeight],
        ]) {
          if (size > frame) {
            assert.ok(offset <= 0.00001);
            assert.ok(offset + size >= frame - 0.00001);
          } else {
            assert.ok(offset >= -0.00001);
            assert.ok(offset + size <= frame + 0.00001);
          }
        }
      }
    }
  }
});
