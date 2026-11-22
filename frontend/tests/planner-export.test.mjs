import test from "node:test";
import assert from "node:assert/strict";
import { plannerImageSize } from "../src/services/plannerExport.ts";

test("desktop, tablet and mobile images preserve the complete planner's proportions without a frame", () => {
  for (const width of [1920, 1536, 1080, 3508, 1600]) {
    const result = plannerImageSize(1280, 840, width);
    assert.equal(result.width, width);
    assert.ok(Math.abs(result.height - (width * 840) / 1280) < 1);
  }
});

test("long lists and large prints remain within mobile canvas limits without cropping", () => {
  for (const [width, height] of [
    [1100, 60000],
    [1280, 2300],
    [640, 12000],
  ]) {
    const result = plannerImageSize(width, height, 4096);
    assert.ok(result.width * result.height <= 16000000);
    assert.ok(result.height <= 8192);
    assert.ok(Math.abs(result.width - (result.height * width) / height) <= 1);
  }
});

test("unmeasurable export sources cannot create empty images", () => {
  for (const source of [
    [0, 840, 1920],
    [1280, NaN, 1920],
    [1280, 840, Infinity],
  ])
    assert.throws(() => plannerImageSize(...source), /not ready/);
});
