#!/usr/bin/env node
/* self-tests — Voice. No framework, no dependencies.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * (c) 2026 Dr Sohil Momin
 *
 * The Griot spec's "done means" is countable, so it is counted:
 *
 *   "With no API key, the interview still runs: the scripted bank asks its questions in
 *    order and every answer is filed under the chapter it belongs to. A recorded answer
 *    appears verbatim in the elder's own words in the memoir export, and the audio
 *    companion plays that same answer. The export prints every chapter that has an answer
 *    and omits the empty ones."
 *
 * Mimic's must-nots are here too: a sample too short is refused with the minimum named,
 * a request with no sample is refused, and an unreadable sample is never replaced by a
 * default voice.
 *
 *   node tests/self-tests.js
 */
"use strict";

var fs = require("fs");
var path = require("path");

var ROOT = path.join(__dirname, "..");
var V = require(path.join(ROOT, "docs", "play", "voice-core.js"));

var passed = 0;
var failed = [];
var group = "";

function section(n) { group = n; }
function ok(name, cond, detail) { if (cond) { passed++; return; } failed.push(group + " :: " + name + (detail ? " — " + detail : "")); }
function eq(name, a, b) { ok(name, a === b, "expected " + JSON.stringify(b) + ", got " + JSON.stringify(a)); }
function read(f) { return fs.readFileSync(path.join(ROOT, f), "utf8"); }

var T0 = Date.UTC(2026, 10, 25);

function file(session, chapter, text, seconds, hasAudio) {
  var q = V.nextQuestion(session);
  var out = V.addAnswer(session, {
    chapter: chapter, question: q.ok ? q.question : null, text: text,
    seconds: seconds || 0, hasAudio: !!hasAudio, now: T0
  });
  return out.ok ? out.session : session;
}

/* ================================================ the spec's own "done means" */

section("done means — the interview runs with no key, in order");
var started = V.startInterview({ speaker: "Aaji", relation: "my grandmother", now: T0 });
eq("an interview starts", started.ok, true);
eq("the bank is the whole script", started.total, V.allQuestions().length);
eq("the first question is the first of the first chapter", started.question.chapter, V.CHAPTERS[0].id);
ok("the app says it needs no key", /needs no key/.test(started.says), started.says);

var order = [];
var s = started.session;
for (var i = 0; i < 5; i++) {
  var q = V.nextQuestion(s);
  order.push(q.question.chapter + ":" + q.question.index);
  s = file(s, q.question.chapter, "An answer for " + q.question.chapter + " number " + i, 20, true);
}
var expected = V.allQuestions().slice(0, 5).map(function (x) { return x.chapter + ":" + x.index; });
eq("the questions come in the bank's own order", order.join(","), expected.join(","));

section("done means — every answer is filed under its chapter");
var chapters = s.answers.map(function (a) { return a.chapter; });
eq("five answers, five chapters filed", chapters.length, 5);
ok("each answer carries its chapter label", s.answers.every(function (a) { return a.chapterLabel && a.chapterLabel.length; }));

section("done means — the memoir prints the elder's words verbatim");
var session = V.startInterview({ speaker: "Aaji", relation: "my grandmother", now: T0 }).session;
var SPOKEN = "We lived in a house with a red oxide floor and a well in the yard.";
session = file(session, "childhood", SPOKEN, 42, true);
session = file(session, "work", "My first job was in the railway accounts office in 1962.", 51, true);
var m = V.memoir(session, { when: "25/11/2026" });
eq("a memoir is compiled", m.ok, true);
var printed = m.chapters.reduce(function (acc, c) { return acc.concat(c.answers.map(function (a) { return a.text; })); }, []);
ok("the elder's sentence is printed exactly", printed.indexOf(SPOKEN) >= 0, printed.join(" | "));
var md = V.memoirMarkdown(m, { when: "25/11/2026" });
ok("the export carries it verbatim", md.indexOf(SPOKEN) >= 0);
ok("the export says nothing was summarised", /Nothing was summarised/.test(md), md.slice(0, 120));

section("done means — the audio companion plays the same answer");
var comp = V.audioCompanion(session);
eq("every recorded answer has a clip", comp.clips.length, 2);
ok("each clip points at the same answer the memoir printed",
  comp.clips.every(function (c) { return session.answers.some(function (a) { return a.id === c.id && a.hasAudio; }); }));
ok("the clip carries the same words", comp.clips[0].words === SPOKEN, comp.clips[0].words);
ok("the app says the words and the audio are the same answer", /same answer/.test(comp.says), comp.says);

section("done means — empty chapters are omitted, answered ones printed");
ok("only chapters with answers are printed", m.chapters.length === 2, m.chapters.map(function (c) { return c.label; }).join(","));
ok("the rest are named as omitted", m.omitted.length === V.CHAPTERS.length - 2, m.omitted.length);
ok("the export lists what was left out", /Chapters with no answer, left out/.test(md));
ok("the compile says how many it omitted", /omitted because they hold no answer/.test(m.says), m.says);

/* ============================================================ must-nots */

section("must-not — a recording with no speaker named");
var noSpeaker = V.startInterview({ speaker: "   " });
eq("a blank speaker is refused", noSpeaker.ok, false);
eq("the field is named", noSpeaker.field, "speaker");
ok("and says why", /not a memoir/.test(noSpeaker.reason), noSpeaker.reason);

section("must-not — a clip too short is kept and marked, not dropped");
var shortSession = V.startInterview({ speaker: "Aaji", now: T0 }).session;
var shortOut = V.addAnswer(shortSession, { chapter: "recipes", text: "", seconds: 2, hasAudio: true, now: T0 });
eq("the clip is accepted", shortOut.ok, true);
eq("it is marked as having no words", shortOut.answer.noWords, true);
ok("it is marked \u201cno words heard\u201d", /no words heard/.test(shortOut.says), shortOut.says);
ok("the clip length is kept", shortOut.answer.seconds, 2);
ok("it stays in the memoir as a kept recording",
  V.memoirMarkdown(V.memoir(shortOut.session, {}), {}).indexOf("no words heard") >= 0);

section("must-not — nothing to file is refused");
var nothing = V.addAnswer(shortSession, { chapter: "recipes", text: "", seconds: 0, hasAudio: false });
eq("no words and no recording is refused", nothing.ok, false);
eq("the text field is named", nothing.field, "text");
eq("an unknown chapter is refused", V.addAnswer(shortSession, { chapter: "nope", text: "x" }).field, "chapter");

section("must-not — a sample too short to model a voice");
var oneSample = V.deriveCard(["I have attached the file you asked for. Please have a look when you get a moment."]);
eq("one sample is refused", oneSample.ok, false);
ok("the minimum number of samples is named", /at least 2/.test(oneSample.reason), oneSample.reason);
var tooShort = V.deriveCard(["hi there", "hello again"]);
eq("too few words is refused", tooShort.ok, false);
ok("the minimum word count is named", /minimum is 60 words/.test(tooShort.reason), tooShort.reason);
var noSamples = V.deriveCard([]);
eq("no sample at all is refused", noSamples.ok, false);
ok("and says a generic voice presented as yours would be a lie", /generic voice presented as yours would be a lie/.test(noSamples.reason), noSamples.reason);

section("must-not — an unreadable sample is never replaced by a default voice");
var bad = V.parseState("{ broken session");
eq("a corrupt file is reported", bad.ok, false);
ok("it was not started over", /not started over/.test(bad.reason), bad.reason);
ok("it says the audio in memory is still there", /audio you recorded this session is still in memory/.test(bad.reason), bad.reason);
eq("the raw text is kept for export", bad.raw, "{ broken session");
eq("a file with neither session nor samples is refused", V.parseState('{"a":1}').ok, false);

section("must-not — it must not grow a second job");
var core = read("docs/play/voice-core.js");
ok("must_not_grow_a_second_job: no second store, no tags, no sync",
  !/\b(tags|labels|folders)\s*[:=]/i.test(core) && !/\bsync\s*[:(]/i.test(core));
ok("must_not_grow_a_second_job: no model, key or endpoint",
  !/\b(apiKey|endpoint|openai|gpt)\s*[:=]/i.test(core) && !/https?:\/\//.test(core));

/* ================================================== the other mechanics */

section("mechanic — the voice card is measured, not guessed");
var SAMPLES = [
  "I have attached the file you asked for. Please have a look when you get a moment, and tell me if anything is missing. I am happy to change it. Thanks again for your patience with this.",
  "Thanks for the quick reply. I will send the revised version tomorrow morning. If that is too late, please say so and I will find another way. It is not a problem."
];
var cardOut = V.deriveCard(SAMPLES);
eq("a card is derived", cardOut.ok, true);
ok("the sentence length is a number", typeof cardOut.card.avgSentence === "number" && cardOut.card.avgSentence > 0);
ok("formality is 0..100", cardOut.card.formality >= 0 && cardOut.card.formality <= 100);
ok("the sample size is recorded", cardOut.card.samples === 2 && cardOut.card.sampleWords >= 60);
ok("polite words are noticed", cardOut.card.polite.indexOf("please") >= 0, cardOut.card.polite.join(","));
ok("the card explains itself in words", /Measured from/.test(cardOut.card.says), cardOut.card.says);

section("mechanic — a draft is written inside the measured voice, beside a neutral one");
var d = V.draft(cardOut.card, "decline", "as-measured");
eq("a draft is produced", d.ok, true);
ok("the neutral draft is shown beside it", d.neutral.length > 0 && d.neutral !== d.text, d.neutral);
ok("the draft reports the measured bounds it used", d.measured.avgSentence === cardOut.card.avgSentence);
ok("the app says it is a rule, not a model", /rule, not a model/.test(d.says), d.says);
var warmer = V.draft(cardOut.card, "decline", "warmer");
var blunter = V.draft(cardOut.card, "decline", "blunter");
var shorter = V.draft(cardOut.card, "decline", "shorter");
ok("warmer adds warmth", warmer.text.length > blunter.text.length, warmer.text + " / " + blunter.text);
ok("blunter keeps it to one sentence", (blunter.text.match(/[.!?]/g) || []).length <= 1, blunter.text);
ok("shorter is shorter", shorter.text.length <= d.text.length, shorter.text);
eq("an unknown tone is refused", V.draft(cardOut.card, "decline", "loud").field, "tone");
eq("an unknown intent is refused", V.draft(cardOut.card, "nope", "as-measured").field, "intent");
eq("no card means no draft", V.draft(null, "decline", "as-measured").field, "card");

section("failure case — storage full or unavailable");
var thrown = V.exportFile("memoir", { memoir: m }, { when: "25/11/2026" }, function () {
  var e = new Error("quota"); e.name = "QuotaExceededError"; throw e;
});
eq("a failed write is reported as failed", thrown.ok, false);
ok("a failed write says the file was not written", /not written/.test(thrown.reason), thrown.reason);
ok("a failed write names the cause", /storage is full/.test(thrown.reason));
eq("no writer means no file", V.exportFile("memoir", { memoir: m }, {}, null).ok, false);
ok("the page stops a recording when the save fails",
  /Recording STOPPED after/.test(read("docs/play/app.js")));

section("failure case — no network");
["docs/play/voice-core.js", "docs/play/app.js", "docs/play/sw.js", "docs/play/web-kit.js", "docs/play/export-kit.js"].forEach(function (f) {
  var src = read(f);
  ok("no fetch call in " + f, !/\bfetch\s*\(/.test(src));
  ok("no XHR/WebSocket/beacon in " + f, !/XMLHttpRequest|WebSocket|sendBeacon|EventSource/.test(src));
});
ok("the page forbids connections in its CSP", /connect-src 'none'/.test(read("docs/play/index.html")));
ok("the page allows its own blob audio", /media-src 'self' blob:/.test(read("docs/play/index.html")));

section("must-not — no speech-to-text is claimed");
var appSrc = read("docs/play/app.js");
ok("no speech recognition is used", !/SpeechRecognition|webkitSpeechRecognition|transcribe/i.test(appSrc + read("docs/play/voice-core.js")));
ok("the page says there is no speech-to-text", /There is no speech-to-text here/.test(read("docs/play/index.html")));
ok("the page says a browser without a recorder still runs the interview",
  /The interview still runs/.test(appSrc));

section("shape — every script the page loads exists beside it");
var page = read("docs/play/index.html");
var srcs = (page.match(/<script[^>]+src="([^"]+)"/g) || []).map(function (t) { return t.replace(/.*src="([^"]+)"/, "$1"); });
srcs.forEach(function (s) {
  ok("script src resolves: " + s, fs.existsSync(path.join(ROOT, "docs", "play", s.replace(/^\.\//, ""))));
});
ok("the landing page exists", fs.existsSync(path.join(ROOT, "docs", "index.html")));
ok("the page manifest exists", fs.existsSync(path.join(ROOT, "PAGES.json")));

/* ============================================================== summary */

var total = passed + failed.length;
if (!total) { console.error("self-tests: 0 assertions ran. That is a failure, not a pass."); process.exit(1); }
if (failed.length) {
  console.error("self-tests: " + passed + "/" + total + " passed, " + failed.length + " FAILED");
  failed.slice(0, 12).forEach(function (f) { console.error("  FAIL " + f); });
  process.exit(1);
}
console.log("self-tests: " + passed + "/" + total + " assertions passed");
