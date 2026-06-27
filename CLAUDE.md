# CLAUDE.md — SehatCard

Portable, offline patient health summary for India. Lets a health worker capture a
patient's critical history, render it as a printable / QR card a doctor can read in
30 seconds with no internet, and emit a FHIR R4 document bundle as the bridge toward
ABDM/ABHA. Built for the last mile — the patients the funded PHR apps don't reach.

## Hard invariants — do not break these

1. **Single self-contained file, fully offline.** The shipped artifact is one HTML file
   with no runtime network calls and no CDN dependencies. It must work on an old laptop
   at a PHC with no internet. Any library (e.g. the QR generator) is vendored and inlined,
   never fetched at runtime.
2. **Never fabricate clinical codes.** The SNOMED/LOINC terminology is a small, clearly
   labelled *starter* set to be verified against NRCeS / the official SNOMED browser and
   swapped for real value sets. Do not invent codes or present unverified codes as
   authoritative. "Leave as plain text" must always remain a safe option.
3. **FHIR stays R4 and ABDM-shaped.** Bundle.type = "document", Composition is the first
   entry, every `urn:uuid:` reference resolves within the bundle. Run the validator before
   claiming conformance. Absent allergies are asserted (emptyReason `nilknown`), never
   silently blank.
4. **Crypto is real.** Records at rest are AES-256-GCM with a PBKDF2-derived key
   (150k iters, SHA-256, random salt). Do not weaken it, log keys, or persist plaintext.
   There is no passphrase recovery — keep it that way and keep saying so in the UI.
5. **Allergies are loud and explicit.** Present allergies prominently when present; show
   "No known allergies recorded" when absent. Never let unknown read as safe.

## Architecture (target after first refactor)

Currently one monolith (`sehatcard.html`). First task: split into modules + a build step
that inlines back to a single file, preserving invariant #1.

```
src/
  index.html        markup + styles
  app.js            UI wiring, render, storage flow
  fhir.js           buildFHIR + validateFHIR
  crypto.js         deriveKey / encrypt / decrypt
  terminology.js    SNOMED starter seed (swappable for NRCeS value sets)
vendor/
  qrcode.js         MIT, Kazuhiko Arase — keep the license header
tests/
  *.test.mjs        node-run unit tests (no DOM): FHIR shape, validator, crypto round-trip
build.mjs           concatenates src + vendor -> dist/sehatcard.html
dist/
  sehatcard.html    the shippable single file
```

## Commands

- Build the single file:  `node build.mjs`
- Run tests:              `node --test tests/`
- Serve locally:          `python3 -m http.server` (then open dist/sehatcard.html)

## Roadmap

- Replace starter terminology with verified NRCeS value sets (data problem, not code).
- Add LOINC only when vitals/labs are introduced (none yet — don't pre-wire it).
- ABDM sandbox: register as HIP/HIU, push a validated bundle through the consent gateway.
- Optional: seal the JSON export (currently a clearly-labelled plaintext backup).
