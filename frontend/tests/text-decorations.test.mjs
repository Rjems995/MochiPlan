import test from "node:test";
import assert from "node:assert/strict";
import { newTextBox, validTextBoxes } from "../src/textDecorations.ts";
import { validTextBoxes as validServerText } from "../../backend/src/text-validation.mjs";
import { validateBackup } from "../src/storage.ts";
import { validateWorkspace } from "../../backend/src/validation.mjs";
import { sharedSnapshot } from "../../backend/src/shared-snapshot.mjs";
import {
  mergeWorkspace,
  keepBothWorkspaces,
} from "../src/services/syncMerge.ts";
import {
  createWorkspaceReview,
  resolveWorkspaceReview,
} from "../src/services/syncReview.ts";
import { workspace } from "../../backend/tests/fixture.mjs";

function validate(data) {
  validateWorkspace({ version: 1, revision: 0, data });
  return validateBackup({ version: 1, data });
}
test("legacy planners and styled multiline decorations survive backups with every font", () => {
  validate(workspace());
  const data = workspace();
  data.schedules[0].design.textBoxes = [
    "Caveat",
    "Nunito",
    "Georgia",
    "DM Sans",
  ].map((font, index) => ({
    ...newTextBox(`note-${index}`),
    font,
    text: "dream big ♡\none little step",
    bold: true,
    italic: true,
    rotation: -10,
  }));
  assert.deepEqual(validate(data), data);
});
test("client and server reject malformed text and oversized decoration collections", () => {
  const original = newTextBox("note");
  const invalid = [
    null,
    {},
    [null],
    [{ ...original, id: "" }],
    [original, original],
    [{ ...original, text: "x".repeat(301) }],
    [{ ...original, font: "unbundled-font" }],
    [{ ...original, color: "url(example)" }],
    [{ ...original, fontSize: NaN }],
    [{ ...original, width: 0 }],
    [{ ...original, x: -1 }],
    [{ ...original, rotation: 181 }],
    [{ ...original, bold: "yes" }],
    Array.from({ length: 101 }, (_, i) => ({ ...original, id: String(i) })),
  ];
  for (const boxes of invalid) {
    assert.equal(validTextBoxes(boxes), false);
    assert.equal(validServerText(boxes), false);
    const data = workspace();
    data.schedules[0].design.textBoxes = boxes;
    assert.throws(
      () => validateBackup({ version: 1, data }),
      /text decoration/,
    );
    assert.throws(
      () => validateWorkspace({ version: 1, revision: 0, data }),
      /text decoration/,
    );
  }
});
test("independent notes and style changes merge while overlapping words require an individual review", () => {
  const base = workspace(),
    local = structuredClone(base),
    account = structuredClone(base);
  local.schedules[0].design.textBoxes = [newTextBox("phone")];
  account.schedules[0].design.textBoxes = [newTextBox("computer")];
  const initial = mergeWorkspace(base, local, account);
  assert.equal(initial.items.length, 0);
  assert.equal(validate(initial.data).schedules[0].design.textBoxes.length, 2);
  const ancestor = initial.data,
    left = structuredClone(ancestor),
    right = structuredClone(ancestor);
  left.schedules[0].design.textBoxes[0].text = "Phone words";
  right.schedules[0].design.textBoxes[0].color = "#123456";
  const merged = mergeWorkspace(ancestor, left, right);
  assert.equal(merged.items.length, 0);
  assert.equal(
    merged.data.schedules[0].design.textBoxes[0].text,
    "Phone words",
  );
  assert.equal(merged.data.schedules[0].design.textBoxes[0].color, "#123456");
  right.schedules[0].design.textBoxes[0].text = "Account words";
  const review = createWorkspaceReview(ancestor, left, right);
  assert.equal(review.items.length, 1);
  assert.equal(review.items[0].path.at(-1), "text");
  const result = validate(
    resolveWorkspaceReview(review, { [review.items[0].id]: "local" }),
  );
  assert.equal(result.schedules[0].design.textBoxes[0].text, "Phone words");
  assert.equal(result.schedules[0].design.textBoxes[0].color, "#123456");
});
test("copied planners give text layers independent identities", () => {
  const base = workspace();
  base.schedules[0].design.textBoxes = [newTextBox("note")];
  const local = structuredClone(base),
    account = structuredClone(base);
  local.schedules[0].title = "Phone title";
  const result = validate(keepBothWorkspaces(local, account));
  assert.equal(result.schedules.length, 2);
  assert.notEqual(
    result.schedules[0].design.textBoxes[0].id,
    result.schedules[1].design.textBoxes[0].id,
  );
});
test("shared snapshots include visible text and strip unknown text-layer properties", () => {
  const data = workspace();
  data.schedules[0].design.textBoxes = [
    {
      ...newTextBox("note"),
      text: "You’ve got this ♡",
      secret: "not part of the design",
    },
  ];
  const result = sharedSnapshot({
    schedule: data.schedules[0],
    preferences: data.preferences,
    includeLocations: false,
    includeDetails: false,
  });
  assert.equal(result.schedule.design.textBoxes[0].text, "You’ve got this ♡");
  assert.equal("secret" in result.schedule.design.textBoxes[0], false);
});
