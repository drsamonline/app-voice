#!/usr/bin/env node
/* page-smoke — prove the shape before believing the build.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * (c) 2026 Dr Sohil Momin
 *
 * A scaffold has shipped here before with its kits in the wrong folder, and the page
 * 404'd its own runtime while the build stayed green. So: every local src/href the
 * pages load must resolve to a file on disk, and nothing may point off-origin.
 *
 *   node tests/page-smoke.js
 */
"use strict";
var fs = require("fs");
var path = require("path");

var ROOT = path.join(__dirname, "..");
var PAGES = ["docs/index.html", "docs/play/index.html"];
var failures = [];
var checked = 0;

function localRefs(html) {
  var refs = [];
  var re = /(src|href)="([^"]+)"/g;
  var m;
  while ((m = re.exec(html))) refs.push({ attr: m[1].toLowerCase(), ref: m[2] });
  return refs;
}

PAGES.forEach(function (rel) {
  var abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { failures.push("missing page: " + rel); return; }
  var html = fs.readFileSync(abs, "utf8");
  localRefs(html).forEach(function (item) {
    var ref = item.ref;
    if (/^(https?:)?\/\//.test(ref)) {
      /* A link out to the source repository is fine. A resource loaded from another
       * origin is not: the app must work with no network at all. */
      if (item.attr === "src") failures.push(rel + " loads a resource off-origin: " + ref);
      return;
    }
    if (/^(#|mailto:|data:)/.test(ref)) return;
    var clean = ref.split("#")[0].split("?")[0];
    if (!clean) return;
    var target = path.resolve(path.dirname(abs), clean);
    checked++;
    if (!fs.existsSync(target)) failures.push(rel + " references a file that does not exist: " + ref);
  });
  if (/<script[^>]+src="http/i.test(html)) failures.push(rel + " loads a remote script");
  if (/<link[^>]+href="http/i.test(html)) failures.push(rel + " loads a remote stylesheet");
});

if (!checked) failures.push("no local references were checked — the smoke test proved nothing");

if (failures.length) {
  console.error("page-smoke: " + failures.length + " problem(s)");
  failures.forEach(function (f) { console.error("  " + f); });
  process.exit(1);
}
console.log("page-smoke: " + checked + " local references resolve, nothing off-origin");
