#!/usr/bin/env node
/* failed-save — the fleet-wide test for the bug that appeared six times while these apps were built.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 · (c) 2026 Dr Sohil Momin
 *
 * THE BUG: a handler calls persist() and then unconditionally setStatus("ok", ...), so when localStorage
 * throws the NOT SAVED warning is overwritten by a cheerful line and the person is told their work is kept
 * when it is not.
 *
 * WHY A GENERIC TEST: a hand-written "click Add, expect NOT SAVED" test proves ONE call site. Four apps in
 * this fleet had exactly that test and still carried the bug in three other handlers. So this finds the
 * saving buttons by WATCHING setItem, then re-runs each one with a throwing setItem.
 *
 *   node tests/failed-save.js
 */
"use strict";
var fs = require("fs"), path = require("path"), { JSDOM } = require("jsdom");
var ROOT = path.join(__dirname, ".."), PLAY = path.join(ROOT, "docs", "play");
var passed = 0, failed = [];

function ok(n, c, d) { if (c) { passed++; return; } failed.push(n + (d ? " — " + d : "")); }

function build(opts) {
  var throwing = opts && opts.throwing;
  var dom = new JSDOM(fs.readFileSync(path.join(PLAY, "index.html"), "utf8"), {
    url: "https://example.test/play/index.html", runScripts: "outside-only", pretendToBeVisual: true
  });
  var w = dom.window, saved = [];
  w.URL.createObjectURL = function () { return "blob:x"; }; w.URL.revokeObjectURL = function () {};
  w.HTMLAnchorElement.prototype.click = function () {};
  w.HTMLCanvasElement.prototype.getContext = function () {
    return { clearRect: function () {}, beginPath: function () {}, moveTo: function () {}, lineTo: function () {}, stroke: function () {},
      fillRect: function () {}, fill: function () {}, arc: function () {}, closePath: function () {}, save: function () {}, restore: function () {},
      translate: function () {}, rotate: function () {}, scale: function () {}, createLinearGradient: function () { return { addColorStop: function () {} }; }, createRadialGradient: function () { return { addColorStop: function () {} }; }, createPattern: function () { return {}; }, quadraticCurveTo: function () {}, bezierCurveTo: function () {}, ellipse: function () {}, rect: function () {}, setTransform: function () {}, drawImage: function () {}, putImageData: function () {}, getImageData: function () { return { data: [] }; }, createImageData: function () { return { data: [] }; },
      set lineWidth(v) {}, set lineCap(v) {}, set lineJoin(v) {}, set strokeStyle(v) {}, set fillStyle(v) {}, set font(v) {}, measureText: function () { return { width: 10 }; } };
  };
  w.HTMLCanvasElement.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, width: 900, height: 420 }; };
  Object.defineProperty(w, "localStorage", { configurable: true, get: function () {
    return {
      getItem: function () { return null; },
      setItem: function (k, v) {
        if (throwing) { var e = new Error("full"); e.name = "QuotaExceededError"; throw e; }
        saved.push(k);
      },
      removeItem: function () {}, clear: function () {}
    };
  } });
  ["web-kit.js", "export-kit.js"].forEach(function (f) {
    var p = path.join(PLAY, f); if (fs.existsSync(p)) w.eval(fs.readFileSync(p, "utf8"));
  });
  var core = fs.readdirSync(PLAY).filter(function (f) { return /-core\.js$/.test(f); })[0];
  if (core) w.eval(fs.readFileSync(path.join(PLAY, core), "utf8"));
  w.eval(fs.readFileSync(path.join(PLAY, "app.js"), "utf8"));
  return { dom: dom, w: w, d: w.document, saved: saved };
}

/* fill anything the handlers will want, so a click reaches the save rather than the validation */
function prime(d) {
  Array.prototype.forEach.call(d.querySelectorAll("input[type=text], input:not([type]), textarea, select"), function (el, i) {
    if (el.tagName === "SELECT") { if (el.options.length) el.selectedIndex = Math.min(1, el.options.length - 1); return; }
    if (el.type === "number" || /qty|count|min|minutes|seed|amount|size/i.test(el.id || "")) el.value = "3";
    else el.value = "x" + i;
  });
}

function statusOf(d) {
  var el = d.getElementById("status") || d.querySelector(".status");
  return el ? { text: el.textContent || "", cls: el.className || "" } : { text: "", cls: "" };
}

/* PASS 1: which buttons cause a write? */
var probe = build({ throwing: false });
prime(probe.d);
var buttons = Array.prototype.slice.call(probe.d.querySelectorAll("button"));
var saving = [];
buttons.forEach(function (b, i) {
  if (b.disabled) return;
  var before = probe.saved.length;
  try { b.click(); } catch (e) { return; }
  if (probe.saved.length > before) saving.push({ index: i, id: b.id || "(button " + i + ")", text: (b.textContent || "").trim().slice(0, 30) });
});

ok("at least one saving action was found", saving.length > 0, saving.length + " found");

/* PASS 2: every one of them, with storage throwing */
saving.forEach(function (s) {
  var run = build({ throwing: true });
  prime(run.d);
  var list = Array.prototype.slice.call(run.d.querySelectorAll("button"));
  /* replay the clicks up to and including the target: with storage broken the earlier steps still set state
   * in memory, which is exactly the situation a person would be in */
  var target = list[s.index];
  if (!target) return;
  try {
    for (var k = 0; k <= s.index; k++) { if (list[k] && !list[k].disabled) list[k].click(); }
  } catch (e) { ok("clicking " + s.id + " does not throw", false, e.message); return; }
  var st = statusOf(run.d);
  /* the wording varies between apps ("NOT SAVED: ..." and "This was not saved: ..."); what must hold is that
   * the failure is REPORTED rather than a cheerful line */
  ok("\u201c" + (s.text || s.id) + "\u201d reports the failed save when storage throws",
    /not saved|will not be kept|cannot be saved|was not saved/i.test(st.text), st.text || "(no status text)");
  ok("and is not left looking cheerful", !/\bok\b/.test(st.cls) || /not saved|will not be kept|cannot be saved|was not saved/i.test(st.text), st.cls + " :: " + st.text);
});

var total = passed + failed.length;
if (!total) { console.error("failed-save: 0 assertions ran."); process.exit(1); }
if (failed.length) {
  console.error("failed-save: " + passed + "/" + total + " passed, " + failed.length + " FAILED");
  failed.forEach(function (f) { console.error("  FAIL " + f); });
  process.exit(1);
}
console.log("failed-save: " + passed + "/" + total + " assertions passed (" + saving.length + " saving action(s) checked)");
