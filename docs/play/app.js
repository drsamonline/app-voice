/* app — the Voice page. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * (c) 2026 Dr Sohil Momin
 *
 * Wiring only: the chapters, the bank, the memoir, the voice card and the drafting rules
 * live in voice-core.js, which the tests exercise directly.
 *
 * Two promises this file keeps on its own:
 *   - if the save fails WHILE a recording is running, the recording STOPS at once and the
 *     app says so with the length it kept. A lost hour of an elder's account is not
 *     recoverable, so that failure is loud and immediate.
 *   - a clip is never dropped because its words are missing: the blob is kept in memory and
 *     the answer is filed and marked "no words heard".
 */
(function () {
  "use strict";

  var V = window.VoiceCore;
  var $ = function (id) { return document.getElementById(id); };

  var K_STATE = "voice:state";

  var els = {
    status: $("status"),
    speaker: $("speaker"), relation: $("relation"), start: $("start"), compile: $("compile"),
    exportMemoir: $("exportMemoir"), intNote: $("intNote"),
    qCard: $("qCard"), qProgress: $("qProgress"), qText: $("qText"), words: $("words"),
    record: $("record"), stopRec: $("stopRec"), saveClip: $("saveClip"), recNote: $("recNote"),
    file: $("file"), skip: $("skip"), fileNote: $("fileNote"),
    answersCard: $("answersCard"), answersList: $("answersList"), ansCount: $("ansCount"),
    memoirCard: $("memoirCard"), memoirSays: $("memoirSays"), memoirOut: $("memoirOut"),
    companionSays: $("companionSays"), companionList: $("companionList"),
    interviewEmpty: $("interviewEmpty"),
    samples: $("samples"), derive: $("derive"), exampleSamples: $("exampleSamples"), cardNote: $("cardNote"),
    cardCard: $("cardCard"), cardSays: $("cardSays"), mSentence: $("mSentence"), mFormality: $("mFormality"), mSize: $("mSize"),
    draftCard: $("draftCard"), intent: $("intent"), tone: $("tone"), draftBtn: $("draftBtn"),
    draftSide: $("draftSide"), voicedText: $("voicedText"), neutralText: $("neutralText"), draftSays: $("draftSays"),
    draftBar: $("draftBar"), keepDraft: $("keepDraft"), copyDraft: $("copyDraft"), keepNote: $("keepNote"),
    draftList: $("draftList"), draftCount: $("draftCount")
  };

  var state = {
    session: null,
    question: null,
    samples: [],
    card: null,
    drafts: [],
    lastDraft: null
  };

  var audio = { blobs: {}, recorder: null, chunks: [], startedAt: 0, lastBlob: null, lastSeconds: 0, url: "" };

  /* ------------------------------------------------------------- helpers */

  function today() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear();
  }

  function setStatus(kind, msg) {
    els.status.className = "status show " + kind;
    els.status.textContent = msg;
  }
  function clearStatus() { els.status.className = "status"; els.status.textContent = ""; }

  function node(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function persist() {
    try {
      window.localStorage.setItem(K_STATE, V.serializeState({ savedOn: Date.now(), session: state.session, samples: state.samples, drafts: state.drafts }));
      return true;
    } catch (e) {
      var why = e && e.name === "QuotaExceededError" ? "storage is full" : "storage is unavailable";
      /* The loud failure: a recording in progress stops now, and says what it kept. */
      if (audio.recorder && audio.recorder.state === "recording") {
        var kept = Math.round((Date.now() - audio.startedAt) / 1000);
        stopRecording();
        setStatus("bad", "Recording STOPPED after " + kept + " second(s): the session could not be saved (" + why +
          "). What was recorded so far is in memory — save the clip now, and export the memoir before closing this tab.");
        return false;
      }
      setStatus("warn", "This was not saved (" + why + "). It stays on this tab only.");
      return false;
    }
  }

  /* ----------------------------------------------------------- interview */

  function begin() {
    clearStatus();
    var out = V.startInterview({ speaker: els.speaker.value, relation: els.relation.value, now: Date.now() });
    if (!out.ok) {
      setStatus("bad", out.reason);
      els.speaker.focus();
      return;
    }
    state.session = out.session;
    state.question = out.question;
    els.qCard.hidden = false;
    els.interviewEmpty.hidden = true;
    els.compile.hidden = false;
    renderQuestion();
    persist();
    setStatus("ok", out.says);
  }

  function renderQuestion() {
    var q = V.nextQuestion(state.session);
    if (!q.ok) {
      els.qText.textContent = "Every question in the bank has been asked. Compile the memoir, or add your own answer below.";
      els.qProgress.textContent = "";
      els.skip.hidden = true;
      state.question = null;
      return;
    }
    state.question = q.question;
    els.qProgress.textContent = "· question " + (q.index + 1) + " of " + q.total;
    els.qText.textContent = "";
    els.qText.appendChild(node("span", "chap", q.question.chapterLabel));
    els.qText.appendChild(document.createTextNode(q.question.question));
    els.skip.hidden = false;
  }

  function fileAnswer() {
    clearStatus();
    if (!state.session || !state.question) {
      setStatus("bad", "There is no question open. Begin the interview first.");
      return;
    }
    var seconds = audio.lastSeconds || 0;
    var out = V.addAnswer(state.session, {
      chapter: state.question.chapter,
      question: state.question,
      text: els.words.value,
      seconds: seconds,
      hasAudio: !!audio.lastBlob,
      now: Date.now()
    });
    if (!out.ok) {
      setStatus("bad", out.reason);
      (out.field === "text" ? els.words : els.speaker).focus();
      return;
    }
    state.session = out.session;
    if (audio.lastBlob) audio.blobs[out.answer.id] = audio.lastBlob;
    audio.lastBlob = null;
    audio.lastSeconds = 0;
    els.words.value = "";
    els.saveClip.hidden = true;
    els.recNote.textContent = "";
    renderAnswers();
    renderQuestion();
    persist();
    setStatus("ok", out.says);
  }

  function skipQuestion() {
    if (!state.session) return;
    state.session.cursor = Math.min(state.session.cursor + 1, V.allQuestions().length);
    els.words.value = "";
    renderQuestion();
    persist();
    setStatus("ok", "Skipped. The bank moves on; nothing was filed for that question.");
  }

  function renderAnswers() {
    var answers = (state.session && state.session.answers) || [];
    els.answersCard.hidden = answers.length === 0;
    els.ansCount.textContent = answers.length ? "· " + answers.length : "";
    els.answersList.textContent = "";
    answers.forEach(function (a) {
      var li = node("li");
      var head = node("div");
      head.appendChild(node("span", "tag", a.chapterLabel));
      if (a.hasAudio) head.appendChild(node("span", "tag rec", a.seconds + "s"));
      if (a.noWords) head.appendChild(node("span", "tag nw", "no words heard"));
      li.appendChild(head);
      li.appendChild(node("div", null, a.noWords ? "(the recording is kept; no words were typed for it)" : a.text));
      li.appendChild(node("span", "meta", a.question || ""));
      els.answersList.appendChild(li);
    });
  }

  function compileMemoir() {
    if (!state.session) return;
    var out = V.memoir(state.session, { when: today() });
    if (!out.ok) { setStatus("bad", out.reason); return; }
    state.memoir = out;
    els.memoirCard.hidden = false;
    els.exportMemoir.hidden = false;
    els.memoirSays.textContent = out.says;
    els.memoirOut.textContent = V.memoirMarkdown(out, { when: today() });

    var comp = V.audioCompanion(state.session);
    els.companionSays.textContent = comp.says;
    els.companionList.textContent = "";
    comp.clips.forEach(function (c) {
      var li = node("li");
      li.appendChild(node("span", "tag rec", c.seconds + "s"));
      li.appendChild(node("div", null, c.hasWords ? c.words : "(no words typed for this recording)"));
      var bar = node("div", "bar");
      var play = node("button", "small", "Play the answer");
      play.addEventListener("click", function () {
        var blob = audio.blobs[c.id];
        if (!blob) {
          setStatus("warn", "That clip is not in memory any more — it was recorded in an earlier session and only the words were kept. The memoir still prints the words.");
          return;
        }
        if (audio.url) URL.revokeObjectURL(audio.url);
        audio.url = URL.createObjectURL(blob);
        var player = new Audio(audio.url);
        player.play().catch(function () { setStatus("warn", "The browser refused playback."); });
        setStatus("ok", "Playing the same answer the memoir prints.");
      });
      bar.appendChild(play);
      li.appendChild(bar);
      els.companionList.appendChild(li);
    });
    setStatus("ok", out.says);
  }

  /* ------------------------------------------------------------ recording */

  function canRecord() {
    return typeof window.MediaRecorder === "function" && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
  }

  function startRecording() {
    clearStatus();
    if (!canRecord()) {
      setStatus("warn", "This browser has no recorder. The interview still runs: type or paste the words, and the memoir will print them.");
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      audio.chunks = [];
      audio.recorder = new window.MediaRecorder(stream);
      audio.recorder.ondataavailable = function (e) { if (e.data && e.data.size) audio.chunks.push(e.data); };
      audio.recorder.onstop = function () {
        stream.getTracks().forEach(function (t) { t.stop(); });
        audio.lastBlob = new Blob(audio.chunks, { type: audio.recorder.mimeType || "audio/webm" });
        audio.lastSeconds = Math.max(1, Math.round((Date.now() - audio.startedAt) / 1000));
        els.recNote.textContent = "Recorded " + audio.lastSeconds + " second(s). It stays in memory until you file this answer.";
        els.saveClip.hidden = false;
        els.stopRec.hidden = true;
        els.record.classList.remove("recording");
        els.record.textContent = "Record the answer";
      };
      audio.startedAt = Date.now();
      audio.recorder.start();
      els.record.classList.add("recording");
      els.record.textContent = "Recording…";
      els.stopRec.hidden = false;
      els.recNote.textContent = "Recording. If the session cannot be saved, this stops at once and tells you what it kept.";
      setStatus("ok", "Recording. Say the answer in their own words; type them below so the memoir can print them.");
    }, function () {
      setStatus("warn", "The microphone was refused. The interview still runs: type or paste the words instead.");
    });
  }

  function stopRecording() {
    if (audio.recorder && audio.recorder.state === "recording") {
      try { audio.recorder.stop(); } catch (e) { /* already stopped */ }
    }
    els.stopRec.hidden = true;
    els.record.classList.remove("recording");
    els.record.textContent = "Record the answer";
  }

  /* ------------------------------------------------------------ voice card */

  function deriveCard() {
    clearStatus();
    var raw = els.samples.value.split(/\n\s*\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    var out = V.deriveCard(raw);
    if (!out.ok) {
      setStatus("bad", out.reason);
      els.samples.focus();
      return;
    }
    state.samples = raw;
    state.card = out.card;
    els.cardCard.hidden = false;
    els.draftCard.hidden = false;
    els.cardSays.textContent = out.card.says;
    els.mSentence.textContent = out.card.avgSentence;
    els.mFormality.textContent = out.card.formality + "/100";
    els.mSize.textContent = out.card.samples + " / " + out.card.sampleWords;
    persist();
    setStatus("ok", "Card derived. " + out.card.says);
  }

  function makeDraft() {
    if (!state.card) { setStatus("bad", "Derive the voice card first."); return; }
    var out = V.draft(state.card, els.intent.value, els.tone.value);
    if (!out.ok) { setStatus("bad", out.reason); return; }
    state.lastDraft = out;
    els.draftSide.hidden = false;
    els.draftBar.hidden = false;
    els.voicedText.textContent = out.text;
    els.neutralText.textContent = out.neutral;
    els.draftSays.textContent = out.says;
    setStatus("ok", "Drafted in your measured voice, with the neutral draft beside it to compare.");
  }

  function keepDraft() {
    if (!state.lastDraft) return;
    state.drafts.push({ text: state.lastDraft.text, neutral: state.lastDraft.neutral, tone: state.lastDraft.tone, at: today() });
    renderDrafts();
    var saved = persist();
    els.keepNote.textContent = saved ? "Kept on this device." : "Not saved — the draft is on screen only.";
  }

  function renderDrafts() {
    els.draftCount.textContent = state.drafts.length ? "· " + state.drafts.length : "";
    els.draftList.textContent = "";
    state.drafts.slice().reverse().forEach(function (d) {
      var li = node("li");
      li.appendChild(node("span", "tag", d.tone));
      li.appendChild(node("div", null, d.text));
      els.draftList.appendChild(li);
    });
  }

  /* ------------------------------------------------------------- export */

  function writer(name, text, mime) {
    if (!window.Export || typeof window.Export.save !== "function") throw new Error("the export kit did not load");
    window.Export.save(name, text, mime);
    return true;
  }

  function saveClip() {
    if (!audio.lastBlob) { setStatus("warn", "There is no clip in memory to save."); return; }
    try {
      if (window.Export && window.Export.blob) {
        window.Export.blob("voice-clip-" + Date.now() + ".webm", audio.lastBlob, "audio/webm");
        setStatus("ok", "Clip saved to this device.");
      } else {
        setStatus("bad", "The export kit cannot write binary here, so the clip was not saved.");
      }
    } catch (e) {
      setStatus("bad", "The clip was not written: " + (e && e.message ? e.message : "storage is unavailable") + ".");
    }
  }

  function doExportMemoir() {
    if (!state.memoir) { setStatus("bad", "Compile the memoir first."); return; }
    var out = V.exportFile("memoir", { memoir: state.memoir }, { when: today() }, writer);
    if (out.ok) {
      els.intNote.textContent = "Wrote " + out.filename + " (" + out.bytes + " bytes).";
      setStatus("ok", "Wrote " + out.filename + ".");
    } else {
      setStatus("bad", out.reason + ".");
    }
  }

  /* ---------------------------------------------------------------- tabs */

  ["interview", "card"].forEach(function (name) {
    $("tab-" + name).addEventListener("click", function () {
      ["interview", "card"].forEach(function (other) {
        var on = other === name;
        $("tab-" + other).setAttribute("aria-selected", on ? "true" : "false");
        $("panel-" + other).hidden = !on;
      });
    });
  });

  /* ---------------------------------------------------------------- wire */

  V.INTENTS.forEach(function (i) {
    var o = node("option", null, i.label);
    o.value = i.id;
    els.intent.appendChild(o);
  });

  els.start.addEventListener("click", begin);
  els.file.addEventListener("click", fileAnswer);
  els.skip.addEventListener("click", skipQuestion);
  els.record.addEventListener("click", startRecording);
  els.stopRec.addEventListener("click", stopRecording);
  els.saveClip.addEventListener("click", saveClip);
  els.compile.addEventListener("click", compileMemoir);
  els.exportMemoir.addEventListener("click", doExportMemoir);
  els.derive.addEventListener("click", deriveCard);
  els.draftBtn.addEventListener("click", makeDraft);
  els.keepDraft.addEventListener("click", keepDraft);
  els.copyDraft.addEventListener("click", function () {
    if (!state.lastDraft) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(state.lastDraft.text).then(function () { els.keepNote.textContent = "Copied."; },
        function () { els.keepNote.textContent = "The browser refused the clipboard."; });
    } else {
      els.keepNote.textContent = "No clipboard here — select the text and copy it by hand.";
    }
  });
  els.exampleSamples.addEventListener("click", function () {
    els.samples.value = [
      "I have attached the file you asked for. Please have a look when you get a moment, and tell me if anything is missing. I am happy to change it. Thanks again for your patience with this.",
      "Thanks for the quick reply. I will send the revised version tomorrow morning. If that is too late, please say so and I will find another way. It is not a problem."
    ].join("\n\n");
    setStatus("ok", "Example samples loaded — invented, written to have a shape worth measuring. Press Derive the voice card.");
  });

  /* ------------------------------------------------------------ start up */

  var raw = null;
  try { raw = window.localStorage.getItem(K_STATE); } catch (e) { raw = null; }
  if (raw) {
    var parsed = V.parseState(raw);
    if (parsed.ok) {
      state.session = parsed.state.session;
      state.samples = parsed.state.samples;
      state.drafts = parsed.state.drafts;
      if (state.session) {
        els.speaker.value = state.session.speaker || "";
        els.relation.value = state.session.relation || "";
        els.qCard.hidden = false;
        els.interviewEmpty.hidden = true;
        els.compile.hidden = false;
        renderQuestion();
        renderAnswers();
      }
    } else {
      /* Reported, offered for export, never started over. */
      setStatus("bad", parsed.reason);
      var keep = node("button", "small", "Export the unreadable session");
      keep.addEventListener("click", function () {
        var out = V.exportFile("raw", parsed, { when: today() }, writer);
        setStatus(out.ok ? "ok" : "bad", out.ok ? "Wrote " + out.filename + "." : out.reason);
      });
      els.intNote.parentNode.insertBefore(keep, els.intNote);
      var fresh = node("button", "small", "Begin a new interview");
      fresh.addEventListener("click", function () {
        try { window.localStorage.removeItem(K_STATE); } catch (e) { /* nothing to remove */ }
        state.session = null;
        els.qCard.hidden = true;
        els.answersCard.hidden = true;
        els.interviewEmpty.hidden = false;
        setStatus("ok", "Beginning a new interview, deliberately. The unreadable file is gone; any audio in memory is untouched.");
      });
      els.intNote.parentNode.insertBefore(fresh, els.intNote);
    }
  }

  renderDrafts();
  if (window.Loom && window.Loom.pwa) window.Loom.pwa.register("sw.js");
})();
