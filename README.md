# Voice

An elder's own words, kept and printed as they were given — and your written voice, measured so a
draft stays inside it.

- **Demo (the app itself):** https://drsamonline.github.io/app-voice/play/index.html
- **Landing page:** https://drsamonline.github.io/app-voice/
- **Release:** https://github.com/drsamonline/app-voice/releases/tag/app-latest
- **Plan row:** #9 of 37 in `drsamonline/forge` → `QUEUE/PLAN.json`
- **Specs absorbed:** `app-griot` (lead), `app-mimic`
- **Licence:** PolyForm Noncommercial 1.0.0

## Status

| | |
|---|---|
| **Built** | 24 scripted questions across six chapters, asked in order with no key; answers filed by chapter, words kept verbatim; a clip too short for words kept and marked; memoir that prints verbatim, omits empty chapters and names them; audio companion playing the same answer; voice card measured from your samples; drafts inside the measured bounds beside a neutral draft; recording stops at once if the save fails. |
| **Release** | Windows EXE, Android APK and Linux binary, built from this source by `app-builder` in CI. |
| **Not built** | **Speech-to-text.** The Griot prompt asks for on-device transcription; there is none in this estate, so the recording is kept and played while you type or paste the words. **The LLMs** — the one that would shape follow-ups and write the memoir, and the one that would draft in your voice. The questions are a bank, the memoir is the elder's words, the draft is a rule. |
| **Untested** | Real microphone recording (jsdom has no `MediaRecorder`; the page's no-recorder path is tested, the recording path is not), playback on a real device, and how the questions land with an actual elder — the bank is plausible, not validated. |

## The Griot spec's "done means", counted

> "With no API key, the interview still runs: the scripted bank asks its questions in order and
> every answer is filed under the chapter it belongs to. A recorded answer appears verbatim in the
> elder's own words in the memoir export, and the audio companion plays that same answer. The
> export prints every chapter that has an answer and omits the empty ones."

| The spec says | The test |
|---|---|
| the bank asks in order, with no key | five questions asked match `allQuestions()` in order, chapter and index; no key or URL anywhere in the engine |
| every answer filed under its chapter | each filed answer carries its chapter id and label |
| verbatim in the memoir export | the exact sentence typed appears in `memoirMarkdown`, and the export says nothing was summarised |
| the audio companion plays that same answer | each clip's id is an answer id with audio, and the clip carries the same words |
| empty chapters omitted | only chapters with answers are printed; the rest are named as left out, in the export too |

## Two specs, one job

Griot is *an elder's spoken words kept faithfully*; Mimic is *your written voice, reproduced
faithfully*. Both are the same job in a different medium — **keep a person's own voice, and give it
back** — so there is one app with two modes and one store. Both specs' must-not ("don't grow a
second job") is asserted.

## What it will not do

- **Transcribe.** No speech-to-text: the recording is kept and plays the same answer the memoir prints.
- **Summarise the elder.** The memoir prints their sentences. A summary is the one thing this app must not do.
- **Write in an unmeasured voice.** No samples, or too few words, and it refuses with the minimum named.
- **Drop a recording.** A clip too short to hold words is kept and marked "no words heard".
- **Use a key or a network.** No `fetch`, no endpoint; CSP `connect-src 'none'`, `media-src 'self' blob:` for its own clips.

## When things go wrong

| Case | Behaviour |
|---|---|
| **Bad input** | No speaker named → refused ("an interview with no attribution is not a memoir"). Nothing to file → refused. Clip too short → kept and marked. Sample too short → refused with the minimum named. |
| **No network** | Nothing changes; the bank, the clips and the samples are on the device. |
| **Storage full or unavailable** | The recording **stops immediately** and the app says what length it kept — a lost hour of an elder's account is not recoverable. |
| **Corrupt saved state** | Reported, offered for export, never started over; the app says the audio in memory is untouched. |

## How the voice card is measured

| Number | How it is computed |
|---|---|
| words a sentence | total words ÷ sentence count, from the samples |
| formality (0–100) | from the presence of contractions — none at all reads formal |
| polite words | a fixed list (please, thanks, kindly, regards…) found in the samples |
| favourite phrases | three-word runs appearing more than once, most frequent first |

The draft is then built **inside** those numbers: sentence length from the measured average, formal
scaffolding only if the samples are formal, a "Thank you." only if the person uses polite words. The
tone slider moves within the bounds, not away from them — and the app says it is a rule, not a model.

## Tests

```bash
npm test                      # all three suites
node tests/self-tests.js      # engine — 85 assertions, including the done-means
node tests/ui-tests.js        # the page in jsdom — 43 assertions (needs the dev-only jsdom)
node tests/page-smoke.js      # every local src/href resolves, nothing off-origin
```

**Mutation testing, honestly:** four mutations produced clean red suites — a memoir that summarises
instead of quoting (2 failures), a blank speaker accepted (3), a too-short sample accepted (2), and a
corrupt file becoming a fresh session (3). Two further mutations (printing empty chapters; dropping a
short clip) either crashed the suite or produced no signal in my harness, and I am recording that
rather than claiming six clean reds.

## Layout

```
docs/index.html            landing page
docs/play/index.html       the app (Interview and Voice card tabs)
docs/play/app.js           DOM wiring: the bank, filing, recording, memoir, card, drafts
docs/play/voice-core.js    the engine — chapters, answers, memoir, companion, card, drafting
docs/play/web-kit.js       vendored kit (unmodified)
docs/play/export-kit.js    vendored kit (unmodified)
tests/self-tests.js        engine suite (85)
tests/ui-tests.js          page suite (43, jsdom)
tests/page-smoke.js        shape on disk
PAGES.json                 landing = docs/index.html, app = docs/play/index.html
```

## Where the spec was silent, and what was chosen

- **A fixed bank, not branching.** The prompt wants adaptive follow-ups from an LLM. Without one, the honest version is a fixed order — which is also what makes "runs with no key" true rather than aspirational.
- **The clip is kept even with no words.** An elder's recording is the irreplaceable thing; a missing transcript is recoverable, a deleted recording is not.
- **The memoir is assembled, never written.** Every sentence in it came out of the elder's mouth.
- **The voice card refuses rather than approximates.** 60 words across 2 samples is the floor; below it the numbers would be noise dressed as a measurement.

## What is not built, and why

**Speech-to-text.** The prompt's first step is on-device transcription. No speech model exists in this
estate, so Voice records and keeps the audio, and asks for the words — the memoir is still verbatim,
because the words are typed as they were spoken.

**The LLMs.** Both prompts specify a bring-your-own-key model. The house rules forbid a runtime
network call. The prompts' own offline clause ("recording and transcription run locally; the LLM only
shapes follow-up questions and the compiled text") is therefore the whole of this app, not a fallback.
