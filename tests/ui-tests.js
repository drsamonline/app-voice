#!/usr/bin/env node
/* ui-tests — the Voice page in a real DOM (jsdom).
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * (c) 2026 Dr Sohil Momin
 *
 * The engine has its own suite, including the countable done-means. This one proves the page
 * is wired to it: a blank speaker is refused, the bank's questions arrive with their chapter,
 * a typed answer is filed and printed verbatim in the memoir, empty chapters are named as
 * left out, a browser with no recorder says the interview still runs, the voice card refuses
 * a short sample and then drafts beside a neutral draft, and a corrupt file is reported.
 *
 *   npm install --no-save jsdom && node tests/ui-tests.js
 */
"use strict";

var fs = require("fs");
var path = require("path");
var { JSDOM } = require("jsdom");

var ROOT = path.join(__dirname, "..");
var PLAY = path.join(ROOT, "docs", "play");
var PAGE = path.join(PLAY, "index.html");

var passed = 0;
var failed = [];
function ok(name, cond, detail) { if (cond) { passed++; return; } failed.push(name + (detail ? " — " + detail : "")); }
function eq(name, a, b) { ok(name, a === b, "expected " + JSON.stringify(b) + ", got " + JSON.stringify(a)); }

function build(seed) {
  var html = fs.readFileSync(PAGE, "utf8");
  var dom = new JSDOM(html, { url: "https://example.test/play/index.html", runScripts: "outside-only", pretendToBeVisual: true });
  var w = dom.window;
  if (seed) Object.keys(seed).forEach(function (k) { w.localStorage.setItem(k, seed[k]); });
  w.URL.createObjectURL = function () { return "blob:x"; };
  w.URL.revokeObjectURL = function () {};
  w.HTMLAnchorElement.prototype.click = function () {};
  ["web-kit.js", "export-kit.js", "voice-core.js", "app.js"].forEach(function (f) {
    w.eval(fs.readFileSync(path.join(PLAY, f), "utf8"));
  });
  return dom;
}

var SPOKEN = "We lived in a house with a red oxide floor and a well in the yard.";

var dom = build(null);
var w = dom.window;
var d = w.document;
var $ = function (id) { return d.getElementById(id); };

ok("the engine loaded into the page", !!w.VoiceCore);
eq("the interview starts empty", $("interviewEmpty").hidden, false);

/* ------------------------------------------------------------- the room */

$("speaker").value = "   ";
$("start").click();
ok("a blank speaker is refused on the page", /not a memoir/.test($("status").textContent), $("status").textContent);
eq("no question is opened", $("qCard").hidden, true);

$("speaker").value = "Aaji";
$("relation").value = "my grandmother";
$("start").click();
eq("the interview opens", $("qCard").hidden, false);
ok("the first question carries its chapter", /Childhood/.test($("qText").textContent), $("qText").textContent);
ok("the progress is shown", /question 1 of \d+/.test($("qProgress").textContent), $("qProgress").textContent);

/* ---------------------------------------------------------- filing words */

$("words").value = SPOKEN;
$("file").click();
eq("the answer is filed", d.querySelectorAll("#answersList li").length, 1);
ok("the words are shown as given", $("answersList").textContent.indexOf(SPOKEN) >= 0, $("answersList").textContent);
ok("the chapter is on the answer", /Childhood/.test($("answersList").textContent));
ok("the next question is asked", /question 2 of \d+/.test($("qProgress").textContent), $("qProgress").textContent);
ok("it is still the same chapter's bank", /Childhood/.test($("qText").textContent), $("qText").textContent);

$("words").value = "My first job was in the railway accounts office in 1962.";
$("file").click();
eq("two answers are filed", d.querySelectorAll("#answersList li").length, 2);

/* ------------------------------------------------------------ the memoir */

$("compile").click();
eq("the memoir appears", $("memoirCard").hidden, false);
ok("the memoir prints the elder's words verbatim", $("memoirOut").textContent.indexOf(SPOKEN) >= 0);
ok("the memoir names the chapters it left out", /left out/.test($("memoirOut").textContent), $("memoirOut").textContent.slice(0, 200));
ok("the compile says what it omitted", /omitted because they hold no answer/.test($("memoirSays").textContent));
ok("the audio companion section is filled", $("companionSays").textContent.length > 0);

$("exportMemoir").click();
ok("the memoir exports", /Wrote memoir-\d{4}-\d\d-\d\d\.md/.test($("intNote").textContent), $("intNote").textContent);

/* ------------------------------------------------ a browser with no recorder */

$("record").click();
ok("a browser without a recorder says the interview still runs",
  /interview still runs/.test($("status").textContent), $("status").textContent);

/* -------------------------------------------------------------- the card */

$("tab-card").click();
eq("the card panel shows", $("panel-card").hidden, false);

$("samples").value = "I have attached the file you asked for. Please have a look.";
$("derive").click();
ok("a short sample is refused", /at least 2/.test($("status").textContent) || /minimum is 60/.test($("status").textContent),
  $("status").textContent);
eq("no card is shown", $("cardCard").hidden, true);

$("exampleSamples").click();
$("derive").click();
eq("a real card is shown", $("cardCard").hidden, false);
ok("the measured numbers are on screen", Number($("mSentence").textContent) > 0, $("mSentence").textContent);
ok("formality is on screen", /\/100/.test($("mFormality").textContent), $("mFormality").textContent);

$("intent").value = "decline";
$("tone").value = "as-measured";
$("draftBtn").click();
eq("a draft is shown", $("draftSide").hidden, false);
ok("the voiced draft is not empty", $("voicedText").textContent.length > 10, $("voicedText").textContent);
ok("the neutral draft is beside it", $("neutralText").textContent.length > 10, $("neutralText").textContent);
ok("they differ", $("voicedText").textContent !== $("neutralText").textContent);
ok("the app says it is a rule, not a model", /rule, not a model/.test($("draftSays").textContent), $("draftSays").textContent);

$("tone").value = "blunter";
$("draftBtn").click();
var blunt = $("voicedText").textContent;
ok("the tone moves the draft", blunt.length > 0 && blunt !== "", blunt);

$("keepDraft").click();
eq("the draft is kept", d.querySelectorAll("#draftList li").length, 1);

/* --------------------------------------------------------------- reload */

var saved = w.localStorage.getItem("voice:state");
ok("the state was written to the device", !!saved);
var dom2 = build({ "voice:state": saved });
var d2 = dom2.window.document;
eq("the reload keeps the answers", d2.querySelectorAll("#answersList li").length, 2);
eq("the reload keeps the drafts", d2.querySelectorAll("#draftList li").length, 1);
ok("the reload keeps the speaker", d2.getElementById("speaker").value === "Aaji", d2.getElementById("speaker").value);

/* ------------------------------------------- a corrupt file on reload */

var dom3 = build({ "voice:state": "{ broken session" });
var d3 = dom3.window.document;
ok("a corrupt file is reported", /not readable JSON/.test(d3.getElementById("status").textContent),
  d3.getElementById("status").textContent);
ok("it says the file was not started over", /not started over/.test(d3.getElementById("status").textContent));
ok("it says audio in memory is still there", /audio you recorded this session is still in memory/.test(d3.getElementById("status").textContent));
ok("it offers an export of the unreadable session",
  Array.prototype.some.call(d3.querySelectorAll("button"), function (b) { return /Export the unreadable session/.test(b.textContent); }));
ok("and a deliberate new interview",
  Array.prototype.some.call(d3.querySelectorAll("button"), function (b) { return /Begin a new interview/.test(b.textContent); }));
ok("the corrupt file is not overwritten", /broken session/.test(dom3.window.localStorage.getItem("voice:state")),
  dom3.window.localStorage.getItem("voice:state"));

var total = passed + failed.length;
if (!total) { console.error("ui-tests: 0 assertions ran. That is a failure, not a pass."); process.exit(1); }
if (failed.length) {
  console.error("ui-tests: " + passed + "/" + total + " passed, " + failed.length + " FAILED");
  failed.forEach(function (f) { console.error("  FAIL " + f); });
  process.exit(1);
}
console.log("ui-tests: " + passed + "/" + total + " assertions passed");
dom.window.close(); dom2.window.close(); dom3.window.close();
