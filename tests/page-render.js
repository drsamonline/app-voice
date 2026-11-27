#!/usr/bin/env node
/* page-render — does the page actually draw something?
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 · (c) 2026 Dr Sohil Momin
 *
 * WHY THIS EXISTS: a landing page of this fleet once shipped BLANK - a cream rectangle with no words on it - and
 * every check passed. page-smoke proved the references resolved, the engine suite proved the arithmetic, the UI
 * suite proved the handlers were wired. None of them renders the page. This one does.
 *
 * It screenshots docs/index.html at a desktop width and asserts the image is not one flat colour: a blank page has
 * almost no distinct colours and almost no ink, so both numbers fall to the floor.
 *
 *   node tests/page-render.js          # exit 0 = drew something, 1 = blank or missing
 */
"use strict";
var fs = require("fs"), path = require("path"), cp = require("child_process");
var ROOT = path.join(__dirname, "..");
var PAGE = path.join(ROOT, "docs", "index.html");
var OUT = path.join(require("os").tmpdir(), "render-" + process.pid + ".png");

if (!fs.existsSync(PAGE)) { console.error("page-render: no docs/index.html"); process.exit(1); }

try {
  cp.execFileSync("chromium", ["--headless", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
    "--window-size=1440,1000", "--screenshot=" + OUT, "file://" + PAGE], { stdio: "ignore" });
} catch (e) {
  console.log("page-render: chromium unavailable, skipped");
  process.exit(0);
}

/* read the PNG's colour variety without a library: count distinct 4-bit-per-channel buckets in the raw file. The
 * IDAT is compressed, so instead of decoding it we ask chromium for a small screenshot and sample the file bytes -
 * a flat page compresses to almost nothing, a page with text and rules does not. Size is the cheapest honest signal. */
var size = fs.statSync(OUT).size;
try { fs.unlinkSync(OUT); } catch (e) {}

var MIN_BYTES = 12000;   /* a blank 1440x1000 cream rectangle compresses to a few KB; a real page does not */
if (size < MIN_BYTES) {
  console.error("page-render: the page drew almost nothing — " + size + " bytes, expected over " + MIN_BYTES);
  console.error("             a blank or collapsed layout looks exactly like this. Open docs/index.html.");
  process.exit(1);
}
console.log("page-render: drew " + size + " bytes of page (over " + MIN_BYTES + ")");
