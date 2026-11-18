import test from "node:test";
import assert from "node:assert/strict";
import { luminance, contrastRatio, readableColor } from "../src/contrast.ts";
import { themes } from "../src/model.ts";

test("sRGB contrast uses linear luminance and is symmetric", () => {
  assert.equal(luminance("#000000"), 0);
  assert.equal(luminance("#ffffff"), 1);
  assert.equal(contrastRatio("#000000", "#ffffff"), 21);
  assert.equal(
    contrastRatio("#514b49", "#fffdfa"),
    contrastRatio("#fffdfa", "#514b49"),
  );
  assert.ok(Math.abs(luminance("#808080") - 0.21586) < 0.00001);
});

test("planner text stays readable on every built-in paper and activity palette", () => {
  for (const theme of themes)
    for (const background of [theme.bg, ...theme.palette])
      for (const preferred of ["#514b49", "#73665f", "#6e605a", "#98536d"])
        assert.ok(
          contrastRatio(background, readableColor(background, preferred)) >=
            4.5,
          `${theme.id}: ${background}`,
        );
  assert.equal(readableColor("#fffdfa", "#514b49"), "#514b49");
});

test("custom midtones and extreme colors always get a contrasting text color", () => {
  for (const r of [0, 64, 128, 192, 255])
    for (const g of [0, 64, 128, 192, 255])
      for (const b of [0, 64, 128, 192, 255]) {
        const background =
          "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
        assert.ok(
          contrastRatio(background, readableColor(background)) >= 4.5,
          background,
        );
      }
});
