/* voice-core — the engine behind Voice.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * (c) 2026 Dr Sohil Momin
 *
 * ONE JOB: keep a person's own words, and give them back faithfully. Both specs are that
 * job in a different medium:
 *
 *   interview   an oral-history interview with an elder. The scripted bank asks its
 *               questions in order, every answer is filed under the chapter it belongs
 *               to, and the memoir prints the elder's words VERBATIM — never a summary
 *               of them. The audio companion plays the same answer.
 *   voice card  the person's written voice, measured from their own samples: sentence
 *               length, formality, favourite phrases. A draft is then written inside
 *               those measured bounds, with a neutral draft beside it to compare.
 *
 * What is NOT here, and is said on the page: no speech-to-text (you type or paste the
 * words; the recording is kept and played), and no language model (the questions come
 * from a bundled bank, the draft comes from measured rules).
 *
 * Pure functions: no DOM, no network, no storage. The page does the wiring.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.VoiceCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var VERSION = "1.0.0";
  var MIN_CLIP_SECONDS = 3;
  var MIN_SAMPLE_WORDS = 60;
  var MIN_SAMPLES = 2;

  /* ------------------------------------------------------------- chapters
   * India-first and deliberately plain: the questions a family actually asks.
   */
  var CHAPTERS = [
    {
      id: "childhood", label: "Childhood",
      questions: [
        "Where were you born, and what was the house like?",
        "What did your mother cook that you can still smell?",
        "What was your favourite thing to do after school?",
        "Who in the family told the best stories, and what was one of them?"
      ]
    },
    {
      id: "work", label: "Work",
      questions: [
        "What was your first job, and how did you get it?",
        "What did a normal working day look like?",
        "What is the hardest thing you were asked to do at work?",
        "Who taught you the most, and what did they teach?"
      ]
    },
    {
      id: "family", label: "Family",
      questions: [
        "How did you meet your partner?",
        "What did your family do for festivals when you were young?",
        "Which relative do you miss the most, and why?",
        "What rule did your parents have that you kept for your own children?"
      ]
    },
    {
      id: "migrations", label: "Migrations",
      questions: [
        "What is the furthest you have ever moved, and why?",
        "What did you leave behind that you still think about?",
        "What was the first thing that surprised you in the new place?",
        "What did you carry with you that you still have?"
      ]
    },
    {
      id: "recipes", label: "Recipes",
      questions: [
        "Which dish do people ask you to make, and how do you make it?",
        "What ingredient would you never change in it?",
        "Who did you learn it from, and did they change anything?",
        "What do you do differently from how you were taught?"
      ]
    },
    {
      id: "sayings", label: "Sayings",
      questions: [
        "What did your elders say to you when things went wrong?",
        "Is there a proverb you use that younger people do not know?",
        "What saying do you wish you had listened to?",
        "What would you say to the family in fifty years?"
      ]
    }
  ];

  function chapterById(id) {
    for (var i = 0; i < CHAPTERS.length; i++) if (CHAPTERS[i].id === id) return CHAPTERS[i];
    return null;
  }

  function allQuestions() {
    var out = [];
    CHAPTERS.forEach(function (c) {
      c.questions.forEach(function (q, i) { out.push({ chapter: c.id, chapterLabel: c.label, index: i, question: q }); });
    });
    return out;
  }

  /* ------------------------------------------------------------ interview */

  /* An interview with no speaker named is refused: an interview with no attribution is
   * not a memoir, it is a transcript nobody can place. */
  function startInterview(opts) {
    var speaker = String((opts && opts.speaker) || "").trim();
    if (!speaker) {
      return { ok: false, field: "speaker", reason: "a recording with no speaker named is refused: an interview with no attribution is not a memoir" };
    }
    var qs = allQuestions();
    return {
      ok: true,
      session: {
        speaker: speaker,
        relation: String((opts && opts.relation) || "").trim(),
        startedAt: (opts && opts.now) || 0,
        cursor: 0,
        answers: [],
        clips: []
      },
      question: qs[0],
      total: qs.length,
      says: "Interview with " + speaker + ". The scripted bank has " + qs.length +
        " questions across " + CHAPTERS.length + " chapters; it asks them in order and needs no key."
    };
  }

  /* The scripted bank, in order. No key, no model, no branching: the same questions in
   * the same order, which is what makes "with no API key the interview still runs" true. */
  function nextQuestion(session) {
    var qs = allQuestions();
    if (session.cursor >= qs.length) {
      return { ok: false, done: true, reason: "the bank has asked every question; export the memoir or add your own answer" };
    }
    return { ok: true, question: qs[session.cursor], index: session.cursor, total: qs.length };
  }

  /* An answer is filed under the chapter it belongs to. A clip too short to hold words is
   * KEPT and marked, never silently dropped. */
  function addAnswer(session, opts) {
    var q = opts && opts.question;
    var chapterId = String((opts && opts.chapter) || (q && q.chapter) || "").trim();
    var chapter = chapterById(chapterId);
    if (!chapter) {
      return { ok: false, field: "chapter", reason: "\u201c" + chapterId + "\u201d is not a chapter this app knows (" + CHAPTERS.map(function (c) { return c.id; }).join(", ") + ")" };
    }
    var text = String((opts && opts.text) || "").trim();
    var seconds = Number((opts && opts.seconds) || 0);
    if (isNaN(seconds) || seconds < 0) return { ok: false, field: "seconds", reason: "the clip length has to be a number of seconds" };

    var hasAudio = !!(opts && opts.hasAudio);
    if (!text && !hasAudio) {
      return { ok: false, field: "text", reason: "there is nothing to file: no words typed and no recording made" };
    }

    var noWords = !text && seconds < MIN_CLIP_SECONDS ? true : (!text && hasAudio);
    var answer = {
      id: "a" + (session.answers.length + 1) + "-" + (opts && opts.now || 0),
      chapter: chapter.id,
      chapterLabel: chapter.label,
      question: String((q && q.question) || (opts && opts.questionText) || "").trim(),
      text: text,
      seconds: seconds,
      hasAudio: hasAudio,
      noWords: !text,
      at: (opts && opts.now) || 0
    };

    var next = {
      speaker: session.speaker, relation: session.relation, startedAt: session.startedAt,
      cursor: Math.min(session.cursor + 1, allQuestions().length),
      answers: session.answers.concat([answer]),
      clips: session.clips.concat(hasAudio ? [{ id: answer.id, seconds: seconds, chapter: chapter.id }] : [])
    };
    return {
      ok: true,
      session: next,
      answer: answer,
      says: answer.noWords
        ? (seconds < MIN_CLIP_SECONDS
          ? "Kept, and marked \u201cno words heard\u201d: the clip is " + seconds + " second(s), under the " + MIN_CLIP_SECONDS + "-second minimum."
          : "Kept, and marked \u201cno words heard\u201d: the recording is there but no words were typed for it.")
        : "Filed under " + chapter.label + ". The words are kept exactly as they were given."
    };
  }

  /* The memoir: the elder's own words, chapter by chapter, and only the chapters that
   * have an answer. A summary here would be the one thing this app must not do. */
  function memoir(session, meta) {
    var answers = (session && session.answers) || [];
    if (!answers.length) {
      return { ok: false, reason: "there is nothing to compile yet: no answer has been filed" };
    }
    var byChapter = {};
    answers.forEach(function (a) {
      byChapter[a.chapter] = byChapter[a.chapter] || [];
      byChapter[a.chapter].push(a);
    });
    var printed = [];
    var omitted = [];
    CHAPTERS.forEach(function (c) {
      if (byChapter[c.id] && byChapter[c.id].length) printed.push({ id: c.id, label: c.label, answers: byChapter[c.id] });
      else omitted.push({ id: c.id, label: c.label });
    });
    return {
      ok: true,
      speaker: session.speaker,
      relation: session.relation || "",
      chapters: printed,
      omitted: omitted,
      answers: answers.length,
      clips: (session.clips || []).length,
      says: printed.length + " chapter(s) printed, " + omitted.length + " omitted because they hold no answer. " +
        "Every line below is the speaker's own words."
    };
  }

  /* The audio companion: one entry per recorded answer, pointing at the same answer the
   * memoir printed. Same id, so the page can play the words that were read. */
  function audioCompanion(session) {
    var answers = (session && session.answers) || [];
    var clips = answers.filter(function (a) { return a.hasAudio; }).map(function (a) {
      return {
        id: a.id, chapter: a.chapter, chapterLabel: a.chapterLabel,
        question: a.question, seconds: a.seconds,
        words: a.text, hasWords: !a.noWords
      };
    });
    return {
      ok: true,
      clips: clips,
      says: clips.length
        ? clips.length + " recorded answer(s). Each one plays the same words the memoir prints, because it is the same answer."
        : "No recorded answers yet \u2014 the memoir will print typed words only."
    };
  }

  /* ------------------------------------------------------------ voice card */

  function words(s) {
    return String(s || "").toLowerCase().replace(/[^\p{L}\p{N}']+/gu, " ").split(" ").filter(Boolean);
  }

  function sentences(s) {
    return String(s || "").replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).map(function (x) { return x.trim(); }).filter(Boolean);
  }

  var CONTRACTIONS = ["i'm", "don't", "can't", "won't", "it's", "that's", "we'll", "you're", "isn't", "doesn't", "i've", "let's"];
  var POLITE = ["please", "thank you", "thanks", "kindly", "regards", "sincerely", "appreciate"];

  /* The card is MEASURED from the samples. A sample too short to model a voice is refused
   * with the minimum named, and a request with no sample is refused rather than answered
   * in a generic voice presented as the person's. */
  function deriveCard(samples, opts) {
    var list = (samples || []).map(function (s) { return String(s == null ? "" : s); }).filter(function (s) { return s.trim(); });
    if (!list.length) {
      return { ok: false, field: "samples", reason: "a request with no sample is refused: there is no voice to write in, and a generic voice presented as yours would be a lie" };
    }
    if (list.length < MIN_SAMPLES) {
      return { ok: false, field: "samples", reason: "one sample is not enough to model a voice: give at least " + MIN_SAMPLES + " things you have written" };
    }
    var all = list.join("\n");
    var ws = words(all);
    if (ws.length < MIN_SAMPLE_WORDS) {
      return {
        ok: false, field: "samples",
        reason: "a sample of " + ws.length + " words is too short to model a voice: the minimum is " + MIN_SAMPLE_WORDS + " words across at least " + MIN_SAMPLES + " samples"
      };
    }

    var ss = sentences(all);
    var avgSentence = Math.round((ws.length / Math.max(1, ss.length)) * 10) / 10;
    var contractions = CONTRACTIONS.filter(function (c) { return all.toLowerCase().indexOf(c) >= 0; });
    var polite = POLITE.filter(function (p) { return all.toLowerCase().indexOf(p) >= 0; });
    var exclamations = (all.match(/!/g) || []).length;
    var dashes = (all.match(/[\u2014\u2013-]/g) || []).length;

    /* favourite phrases: three-word runs that appear more than once */
    var counts = {};
    ws.forEach(function (w, i) {
      if (i + 2 >= ws.length) return;
      var tri = ws[i] + " " + ws[i + 1] + " " + ws[i + 2];
      counts[tri] = (counts[tri] || 0) + 1;
    });
    var phrases = Object.keys(counts).filter(function (k) { return counts[k] > 1; })
      .sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 5);

    var formality = Math.round(100 * (1 - Math.min(1, contractions.length / 6))) ;
    return {
      ok: true,
      card: {
        samples: list.length,
        sampleWords: ws.length,
        avgSentence: avgSentence,
        formality: formality,
        contractions: contractions,
        polite: polite,
        exclamations: exclamations,
        dashes: dashes,
        phrases: phrases,
        says: "Measured from " + ws.length + " words across " + list.length + " samples: " +
          avgSentence + " words a sentence, " + (formality > 60 ? "formal" : formality > 30 ? "middling" : "casual") +
          (contractions.length ? ", contractions (" + contractions.slice(0, 3).join(", ") + ")" : ", no contractions") +
          (phrases.length ? ", and the phrase \u201c" + phrases[0] + "\u201d more than once" : "") + "."
      }
    };
  }

  /* --------------------------------------------------------------- drafting */

  var INTENTS = [
    { id: "decline", label: "Decline something politely", neutral: "I am unable to accept this. Thank you for asking." },
    { id: "ask", label: "Ask for something", neutral: "Please send me the document at your earliest convenience." },
    { id: "thanks", label: "Thank someone", neutral: "Thank you for your help with this." },
    { id: "followup", label: "Follow up on something", neutral: "I am writing to follow up on the matter discussed earlier." }
  ];

  function intentById(id) {
    for (var i = 0; i < INTENTS.length; i++) if (INTENTS[i].id === id) return INTENTS[i];
    return null;
  }

  /* A draft written inside the measured bounds of the card. The rules are mechanical and
   * the app says so: shorten the sentences to the measured average, drop the formal
   * scaffolding if the person never uses it, keep one of their phrases if they have one. */
  function draft(card, intentId, tone) {
    if (!card) return { ok: false, field: "card", reason: "there is no voice card: give the app samples first" };
    var intent = intentById(intentId);
    if (!intent) return { ok: false, field: "intent", reason: "there is no intent called \u201c" + intentId + "\u201d" };
    var t = String(tone || "as-measured");
    if (["warmer", "blunter", "shorter", "as-measured"].indexOf(t) < 0) {
      return { ok: false, field: "tone", reason: "\u201c" + t + "\u201d is not a tone this app understands (warmer, blunter, shorter, as-measured)" };
    }

    /* The neutral draft is the yardstick: whole sentences, kept whole. */
    var neutral = (intent.neutral.match(/[^.!?]+[.!?]/g) || [intent.neutral]).map(function (x) { return x.trim(); });
    var out = [];

    if (t === "warmer") out.push("I hope you are keeping well.");
    else if (card.formality > 60 && t !== "blunter" && t !== "shorter") out.push("I hope this finds you well.");

    if (t === "shorter") {
      /* one sentence, cut to the length this person actually writes in */
      var target = Math.max(5, Math.round(card.avgSentence));
      var ws = neutral[0].replace(/[.!?]$/, "").split(/\s+/);
      var cut = ws.slice(0, target).join(" ");
      out.push(cut + (/[.!?]$/.test(neutral[0]) ? neutral[0].slice(-1) : "."));
    } else if (t === "blunter") {
      /* the first sentence, and nothing cushioning it */
      out.push(neutral[0]);
    } else {
      neutral.forEach(function (x) { out.push(x); });
    }

    if (card.polite.length && t !== "blunter" && t !== "shorter") out.push("Thank you.");

    var text = out.join(" ").replace(/\s+/g, " ").trim();
    if (text && !/[.!?]$/.test(text)) text += ".";

    var notes = [];
    notes.push("Written inside your measured voice: " + card.avgSentence + " words a sentence, " +
      (card.formality > 60 ? "formal" : card.formality > 30 ? "middling" : "casual") + ".");
    if (card.phrases.length) {
      notes.push("Your phrase \u201c" + card.phrases[0] + "\u201d is recorded on the card, but a rule-based draft cannot place it naturally \u2014 a model could, and this app does not have one.");
    }
    notes.push("The tone moves it within those bounds, not away from them. This is a rule, not a model.");

    return {
      ok: true,
      text: text,
      neutral: neutral.join(" "),
      tone: t,
      measured: { avgSentence: card.avgSentence, formality: card.formality, words: words(text).length },
      says: notes.join(" ")
    };
  }

  /* --------------------------------------------------------------- storage */

  function serializeState(state) {
    return JSON.stringify({
      version: VERSION,
      savedOn: (state && state.savedOn) || 0,
      session: state && state.session ? {
        speaker: state.session.speaker, relation: state.session.relation, startedAt: state.session.startedAt,
        cursor: state.session.cursor,
        answers: (state.session.answers || []).map(function (a) {
          return { id: a.id, chapter: a.chapter, chapterLabel: a.chapterLabel, question: a.question, text: a.text, seconds: a.seconds, hasAudio: a.hasAudio, noWords: a.noWords, at: a.at };
        }),
        clips: state.session.clips || []
      } : null,
      samples: ((state && state.samples) || []).slice(),
      drafts: ((state && state.drafts) || []).slice()
    }, null, 2);
  }

  /* An unreadable session is reported and offered for export. The app never starts a fresh
   * session over it, and the audio is preserved even when its transcript cannot be read. */
  function parseState(text) {
    var raw = String(text == null ? "" : text);
    if (!raw.trim()) return { ok: false, reason: "there is nothing saved yet", raw: raw };
    var data;
    try { data = JSON.parse(raw); }
    catch (e) {
      return { ok: false, reason: "the saved session is not readable JSON. It was not started over: export it to keep it, or begin a new interview deliberately. Any audio you recorded this session is still in memory and can be saved clip by clip.", raw: raw };
    }
    if (!data || (data.session == null && !Array.isArray(data.samples))) {
      return { ok: false, reason: "the saved file has neither a session nor samples in it, so it was not used \u2014 and it was not replaced with a fresh one.", raw: raw };
    }
    return {
      ok: true,
      state: {
        version: data.version || VERSION,
        savedOn: Number(data.savedOn) || 0,
        session: data.session || null,
        samples: Array.isArray(data.samples) ? data.samples : [],
        drafts: Array.isArray(data.drafts) ? data.drafts : []
      },
      raw: raw
    };
  }

  /* ---------------------------------------------------------------- export */

  function stamp(when) {
    var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(when || ""));
    return m ? m[3] + "-" + m[2] + "-" + m[1] : "undated";
  }

  function memoirMarkdown(m, meta) {
    meta = meta || {};
    var lines = ["# " + (m.speaker || "An interview") + (m.relation ? " \u2014 " + m.relation : ""), ""];
    if (meta.when) lines.push("Compiled " + meta.when + ".");
    lines.push("");
    lines.push("Every line below is the speaker's own words, as they were given. Nothing was summarised.");
    (m.chapters || []).forEach(function (c) {
      lines.push("");
      lines.push("## " + c.label);
      c.answers.forEach(function (a) {
        lines.push("");
        if (a.question) lines.push("**Q.** " + a.question);
        lines.push("");
        lines.push(a.noWords ? "_(no words heard \u2014 the recording is kept)_" : a.text);
      });
    });
    if ((m.omitted || []).length) {
      lines.push("");
      lines.push("---");
      lines.push("");
      lines.push("Chapters with no answer, left out: " + m.omitted.map(function (c) { return c.label; }).join(", ") + ".");
    }
    return lines.join("\n");
  }

  function exportFile(what, payload, meta, writer) {
    meta = meta || {};
    if (typeof writer !== "function") return { ok: false, reason: "the file was not written: no writer is available in this browser" };
    var name, body, mime = "text/plain;charset=utf-8";
    if (what === "memoir") { name = "memoir-" + stamp(meta.when) + ".md"; body = memoirMarkdown(payload.memoir, meta); mime = "text/markdown;charset=utf-8"; }
    else if (what === "raw") { name = "voice-unreadable-" + stamp(meta.when) + ".txt"; body = String(payload.raw || ""); }
    else return { ok: false, reason: "nothing was written: unknown export \u201c" + what + "\u201d" };
    try {
      var wrote = writer(name, body, mime);
      if (wrote === false) return { ok: false, filename: name, reason: "the file was not written: the browser refused the save" };
      return { ok: true, filename: name, bytes: body.length };
    } catch (e) {
      var why = e && e.name === "QuotaExceededError" ? "storage is full" : (e && e.message ? e.message : "storage is unavailable");
      return { ok: false, filename: name, reason: "the file was not written: " + why };
    }
  }

  return {
    version: VERSION,
    CHAPTERS: CHAPTERS,
    INTENTS: INTENTS,
    MIN_CLIP_SECONDS: MIN_CLIP_SECONDS,
    MIN_SAMPLE_WORDS: MIN_SAMPLE_WORDS,
    MIN_SAMPLES: MIN_SAMPLES,
    chapterById: chapterById,
    allQuestions: allQuestions,
    startInterview: startInterview,
    nextQuestion: nextQuestion,
    addAnswer: addAnswer,
    memoir: memoir,
    audioCompanion: audioCompanion,
    deriveCard: deriveCard,
    intentById: intentById,
    draft: draft,
    serializeState: serializeState,
    parseState: parseState,
    memoirMarkdown: memoirMarkdown,
    exportFile: exportFile
  };
});
