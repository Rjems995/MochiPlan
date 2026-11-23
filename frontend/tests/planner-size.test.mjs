import test from "node:test";
import assert from "node:assert/strict";
import {
  plannerSizes,
  validCanvasSize,
  plannerLayout,
} from "../src/plannerSize.ts";
import { validCanvasSize as serverSize } from "../../backend/src/canvas-size-validation.mjs";
import { validateBackup } from "../src/storage.ts";
import { validateWorkspace } from "../../backend/src/validation.mjs";
import { sharedSnapshot } from "../../backend/src/shared-snapshot.mjs";
import { plannerImageSize } from "../src/services/plannerExport.ts";
import {
  createWorkspaceReview,
  resolveWorkspaceReview,
} from "../src/services/syncReview.ts";
import { workspace } from "../../backend/tests/fixture.mjs";

test("legacy planners and every size preset remain valid through backups and server validation", () => {
  const data = workspace();
  validateBackup({ version: 1, data });
  assert.equal(validCanvasSize(undefined), true);
  for (const preset of plannerSizes) {
    const size = { width: preset.width, height: preset.height };
    data.schedules[0].design.canvasSize = size;
    assert.equal(validCanvasSize(size), true);
    assert.equal(serverSize(size), true);
    assert.deepEqual(
      validateBackup({ version: 1, data }).schedules[0].design.canvasSize,
      size,
    );
    assert.deepEqual(
      validateWorkspace({ version: 1, revision: 0, data }).schedules[0].design
        .canvasSize,
      size,
    );
  }
});
test("invalid dimensions cannot enter saved data and shared sizes expose only dimensions", () => {
  for (const size of [
    null,
    [],
    {},
    { width: 0, height: 1000 },
    { width: 319, height: 1000 },
    { width: 1200.5, height: 900 },
    { width: 4097, height: 900 },
    { width: 1000, height: NaN },
    { width: 4096, height: 4096 },
  ]) {
    assert.equal(validCanvasSize(size), false);
    assert.equal(serverSize(size), false);
    const data = workspace();
    data.schedules[0].design.canvasSize = size;
    assert.throws(
      () => validateBackup({ version: 1, data }),
      /planner dimensions/,
    );
    assert.throws(
      () => validateWorkspace({ version: 1, revision: 0, data }),
      /planner dimensions/,
    );
  }
  const data = workspace();
  data.schedules[0].design.canvasSize = {
    width: 1200,
    height: 1600,
    secret: "hidden",
  };
  const shared = sharedSnapshot({
    schedule: data.schedules[0],
    preferences: data.preferences,
    includeLocations: false,
    includeDetails: false,
  });
  assert.deepEqual(shared.schedule.design.canvasSize, {
    width: 1200,
    height: 1600,
  });
});
test("editor layout preserves saved proportions and exports keep exact preset dimensions", () => {
  for (const preset of plannerSizes) {
    for (const view of ["weekly", "daily", "monthly", "list"]) {
      const layout = plannerLayout(preset, view);
      assert.ok(
        Math.abs(layout.width / layout.height - preset.width / preset.height) <
          0.00001,
      );
    }
    assert.deepEqual(
      plannerImageSize(preset.width, preset.height, preset.width),
      { width: preset.width, height: preset.height },
    );
  }
});
test("invalid combined size changes require review without losing independent task edits", () => {
  const base = workspace();
  base.schedules[0].design.canvasSize = { width: 3000, height: 3000 };
  const local = structuredClone(base),
    account = structuredClone(base);
  local.schedules[0].design.canvasSize.width = 4096;
  account.schedules[0].design.canvasSize.height = 4096;
  account.tasks[0].done = true;
  const review = createWorkspaceReview(base, local, account);
  assert.equal(review.items.length, 1);
  assert.equal(review.items[0].kind, "planner");
  const result = resolveWorkspaceReview(review, {
    [review.items[0].id]: "local",
  });
  assert.deepEqual(result.schedules[0].design.canvasSize, {
    width: 4096,
    height: 3000,
  });
  assert.equal(result.tasks[0].done, true);
});
