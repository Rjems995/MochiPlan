import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultImageAdjustment,
  legacyImageAdjustment,
  validImageAdjustment,
  panBackground,
} from "../src/backgroundImage.ts";
import { validImageAdjustment as validServerAdjustment } from "../../backend/src/background-validation.mjs";
import { validateBackup } from "../src/storage.ts";
import { validateWorkspace } from "../../backend/src/validation.mjs";
import { sharedSnapshot } from "../../backend/src/shared-snapshot.mjs";
import { mergeWorkspace } from "../src/services/syncMerge.ts";
import { workspace } from "../../backend/tests/fixture.mjs";

test("legacy photos retain their top-left crop and optional adjustments survive backups and sharing", () => {
  const data = workspace();
  data.schedules[0].design.image = "data:image/png;base64,AA==";
  validateBackup({ version: 1, data });
  validateWorkspace({ version: 1, revision: 0, data });
  assert.deepEqual(legacyImageAdjustment, {
    fit: "cover",
    zoom: 100,
    x: 0,
    y: 0,
  });
  data.schedules[0].design.imageAdjustment = {
    ...defaultImageAdjustment,
    fit: "contain",
    zoom: 150,
    x: 20,
    y: 80,
  };
  assert.deepEqual(validateBackup({ version: 1, data }), data);
  assert.deepEqual(validateWorkspace({ version: 1, revision: 0, data }), data);
  const shared = sharedSnapshot({
    schedule: data.schedules[0],
    preferences: data.preferences,
    includeLocations: false,
    includeDetails: false,
  });
  assert.deepEqual(
    shared.schedule.design.imageAdjustment,
    data.schedules[0].design.imageAdjustment,
  );
});

test("client and server reject invalid photo adjustments and sanitize shared properties", () => {
  for (const adjustment of [
    null,
    [],
    {},
    { ...defaultImageAdjustment, fit: "stretch" },
    { ...defaultImageAdjustment, zoom: 0 },
    { ...defaultImageAdjustment, zoom: 301 },
    { ...defaultImageAdjustment, x: -1 },
    { ...defaultImageAdjustment, y: NaN },
    { ...defaultImageAdjustment, y: 101 },
  ]) {
    assert.equal(validImageAdjustment(adjustment), false);
    assert.equal(validServerAdjustment(adjustment), false);
    const data = workspace();
    data.schedules[0].design.imageAdjustment = adjustment;
    assert.throws(
      () => validateBackup({ version: 1, data }),
      /background photo/,
    );
    assert.throws(
      () => validateWorkspace({ version: 1, revision: 0, data }),
      /background photo/,
    );
  }
  const data = workspace();
  data.schedules[0].design.imageAdjustment = {
    ...defaultImageAdjustment,
    secret: "private",
  };
  const shared = sharedSnapshot({
    schedule: data.schedules[0],
    preferences: data.preferences,
    includeLocations: false,
    includeDetails: false,
  });
  assert.equal("secret" in shared.schedule.design.imageAdjustment, false);
});

test("dragging moves the photo with the pointer for fill, fit and zoom without leaving its limits", () => {
  const natural = { width: 1200, height: 400 },
    frame = { width: 300, height: 200 };
  assert.deepEqual(
    panBackground(defaultImageAdjustment, natural, frame, { x: 30, y: 20 }),
    { ...defaultImageAdjustment, x: 40 },
  );
  assert.deepEqual(
    panBackground(
      { ...defaultImageAdjustment, fit: "contain" },
      natural,
      frame,
      { x: 30, y: 20 },
    ),
    { ...defaultImageAdjustment, fit: "contain", y: 70 },
  );
  const zoomed = panBackground(
    { ...defaultImageAdjustment, zoom: 200 },
    natural,
    frame,
    { x: 30, y: 40 },
  );
  assert.equal(zoomed.x, 46.7);
  assert.equal(zoomed.y, 30);
  const bounded = panBackground(
    { ...defaultImageAdjustment, zoom: 200 },
    natural,
    frame,
    { x: -100000, y: 100000 },
  );
  assert.equal(bounded.x, 100);
  assert.equal(bounded.y, 0);
});

test("independent framing adjustments synchronize without dropping the photo", () => {
  const base = workspace();
  base.schedules[0].design.image = "data:image/png;base64,AA==";
  base.schedules[0].design.imageAdjustment = { ...defaultImageAdjustment };
  const local = structuredClone(base),
    account = structuredClone(base);
  local.schedules[0].design.imageAdjustment.x = 80;
  account.schedules[0].design.imageAdjustment.zoom = 150;
  const merged = mergeWorkspace(base, local, account);
  assert.equal(merged.items.length, 0);
  assert.deepEqual(merged.data.schedules[0].design.imageAdjustment, {
    ...defaultImageAdjustment,
    x: 80,
    zoom: 150,
  });
  assert.equal(
    merged.data.schedules[0].design.image,
    base.schedules[0].design.image,
  );
});
