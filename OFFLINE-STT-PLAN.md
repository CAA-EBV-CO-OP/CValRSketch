# Offline / On-Device Speech-to-Text — Plan & Options

Notes for moving sketch dictation off the network-dependent Web Speech API to a
fully **offline, on-device** recognizer. Written for field/job-site use where
there may be no signal, and to kill the flaky-mic problem.

---

## Why change

`dictation.js` currently recognizes speech with the browser **Web Speech API**
(`startRecognition()`):

- Requires a network round-trip to Microsoft/Google servers — **no offline use**.
- Unreliable: the `onend` auto-restart loop with a throttle that gives up after
  "6 restarts in 10s" and even tells the user *"use the HTTPS/PWA version, not a
  local file."* Same class of flicker/drop problem seen in the Shortcuts STT app.
- Per-use dependence on a remote service we don't control.

Goal: recognition runs **on-device**, works offline, costs nothing per use, and
can be **biased toward the measurement vocabulary** for better number accuracy.

---

## What does NOT change: the parser (already solved)

The formatting half of "twelve foot six → `12'6"`" is **already done** and is the
part worth keeping:

- `transform()` converts spoken words → sketch notation deterministically:
  `"five foot seven right"` → `5'7 right`; measurement arithmetic
  (`"20'6 minus 10'"` → `10'6`); diagonal `"and"` → `&`; trailing `"enter"` → submit.
- The **Train** button + `localStorage` corrections (`cvalr-dictation-corrections`)
  learn misheard-phrase → intended-phrase rules.
- Both operate on a **plain text string** and are **engine-agnostic**. Any engine
  just needs to feed a transcript into `handleFinalResult(transcript)` — exactly
  as Web Speech does today.

> **Key framing:** "train for `12'6"`" is two jobs — (1) recognize the words,
> (2) format them. **(2) is finished.** Offline engines only need to improve (1).
> Do *not* try to train a model to emit `12'6"` — transcribe to words, then parse.

---

## Options (all run in-browser, offline after first load)

| Engine | How it runs | Approx size (EN) | Strengths | Watch-outs |
|---|---|---|---|---|
| **Vosk** (`vosk-browser`) | Kaldi → WASM, CPU | ~40–50 MB (small) | Real-time streaming; **custom grammar/vocabulary** to hard-constrain to numbers + units; light enough for **mobile** | Raw number accuracy mediocre *without* the grammar constraint |
| **Whisper** via `transformers.js` (Hugging Face) | ONNX + **WebGPU** | tiny ~75 MB / base ~145 MB | Best natural-language accuracy; tolerant of messy phrasing | Heavier; WebGPU is inconsistent on mobile browsers — tiny/base only on phones |
| **whisper.cpp** (WASM) | C++ → WASM | similar to above | Same models, very portable, no framework | Slower than WebGPU; more manual wiring |
| **Moonshine** (ONNX) | edge-optimized ASR | small | Fast on short utterances (ideal for "12 foot 6") | Newer, smaller ecosystem |

---

## Recommended approach

**Primary: Vosk (`vosk-browser`) + a constrained grammar.**

- Build the grammar from the vocabulary already encoded in `dictation.js`:
  `ONES` / `TENS` number words, `foot/feet/ft/inch/inches/in`, directions
  `right/left/up/down`, connectors `and/minus/plus/next/last/enter`.
- A fixed phrase list means the recognizer can **only** return those words →
  large accuracy gain in this narrow domain, and it stays tiny + mobile-friendly.

**Alternative: Whisper-tiny via `transformers.js` (WebGPU)** if Vosk's number
recognition proves too weak on real dictation. No hard grammar, but supports a
soft **initial prompt** to nudge vocabulary (e.g. "feet inches right left up down
twelve six ..."). Heavier; best on desktop.

Either way, **keep `transform()` and Train unchanged.**

---

## Recognition-side biasing (the real "training")

- **Vosk:** pass a grammar/phrase list to the recognizer → constrains output to the
  domain. Regenerate it from the same `ONES`/`TENS`/unit/direction sets in
  `dictation.js` so the two never drift.
- **Whisper:** no hard grammar; soft prompt only. Weaker biasing but still helps.

---

## Integration points (small, isolated)

The swap touches only the recognition loop:

1. Replace `startRecognition()` / `recognition.onresult` with the chosen engine's
   mic capture loop.
2. On each final transcript, call **`handleFinalResult(transcript)`** exactly as today.
3. `toggleMic()`, `setStatus()`, `logEvent()`, the Train flow, and the entire
   `transform()` pipeline stay as-is.
4. Keep a **feature flag** so Web Speech remains a fallback where the offline engine
   isn't loaded or supported.

---

## PWA / offline delivery

- App is already a PWA (`sw.js`). For genuine offline use, the model file(s) must be
  **cached** by the service worker.
- **Size budget:** Vosk small EN ~40–50 MB; Whisper-tiny ~75 MB. Don't put this in the
  base install — fetch + cache the model on **first dictation**, so initial PWA load
  stays light. Show a one-time "downloading voice model…" state.
- **Mobile:** WebGPU (Whisper) is inconsistent on mobile Safari/Chrome. Vosk (CPU WASM)
  is the safer bet for phones in the field.

---

## Next steps

1. Pick the engine (**Vosk-first** recommended).
2. Prototype behind the feature flag: wire `vosk-browser`, feed `handleFinalResult`,
   build the grammar from existing vocab.
3. Test number accuracy on real dimension phrases ("twelve foot six", "twelve six",
   "twelve and a half feet", "twenty foot six minus ten foot").
4. Measure mobile performance and verify the service-worker model cache works offline.
