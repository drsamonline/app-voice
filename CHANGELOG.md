# Changelog

All notable changes to Voice are recorded here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Dates: dd/mm/yyyy.

## [Unreleased]

## [1.0.0] — 25/11/2026

### Added
- A scripted interview bank: 24 questions across six chapters (childhood, work, family,
  migrations, recipes, sayings), asked in order, with no key and no model.
- Answers filed under their chapter with the words kept exactly as given; a clip too short to
  hold words is KEPT and marked "no words heard" rather than dropped.
- A memoir that prints the elder's words verbatim, prints only chapters that hold an answer, and
  names the chapters it left out.
- An audio companion that plays the same answer the memoir prints, because it is the same answer.
- A voice card measured from the person's own samples: sentence length, formality, contractions,
  polite words, repeated phrases. Too few samples or too few words is refused with the minimum named.
- Drafts written inside the measured bounds, with the neutral draft beside them, and tone that
  moves within the bounds rather than away from them.
- Refusals: a recording with no speaker named, nothing to file, an unknown chapter, an unknown
  tone or intent, a sample too short to model a voice.
- Corruption handling: an unreadable session is reported, offered for export, never started over,
  and the app says the audio in memory is untouched.
- If the save fails while a recording runs, the recording STOPS at once and the app says what it kept.
- PWA shell, CI (85 engine assertions + 43 in jsdom + page smoke), and the app-builder pipeline
  pinned to the canonical SHA for the EXE/APK/Linux release.

### Not built
- Speech-to-text: no on-device transcription exists in this estate. The recording is kept and played;
  the words are typed or pasted.
- The LLM that would shape follow-ups and write the memoir, and the LLM that would draft in your
  voice: the questions are a bank, the memoir is the elder's own words, and the draft is a rule.
