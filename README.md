# SehatCard

A portable patient health summary for India — works on paper, offline, in any language.

A health worker captures a patient's critical history once; it renders as a printable
card with a QR code that **carries the summary itself**, so any doctor can scan and read
it with no internet and no patient smartphone. The same record can be emitted as a
**FHIR R4 document bundle**, the bridge toward the national ABDM/ABHA system.

Built for the last mile — the elderly, rural, and low-connectivity patients that the
funded PHR apps don't reach.

## Status

v0.2 — working prototype. **Not clinical-grade.** Encryption protects data at rest on the
device; it is not a substitute for a hardened backend, and the JSON export is plaintext.
The bundled SNOMED codes are a starter set to be verified before any real use.

## Run it

It's a single self-contained file. Open `dist/sehatcard.html` in any browser, or serve it:

```bash
python3 -m http.server 8000
# open http://localhost:8000/dist/sehatcard.html
```

No build, no install, no network required.

## What works

- Patient + critical-history capture; live printable card; EN / हिंदी / ಕನ್ನಡ labels
- Self-contained QR (offline summary, no server lookup)
- AES-256-GCM encryption at rest (PBKDF2 key, device passphrase)
- FHIR R4 document bundle export with an offline structural validator
- SNOMED CT coding layer (starter terminology — verify before clinical use)

## Structure & invariants

See `CLAUDE.md`. The non-negotiables: stays a single offline file, never fabricates
clinical codes, FHIR stays R4/ABDM-shaped, crypto stays real, allergies stay explicit.

## Roadmap

1. Split monolith into `src/` modules + `build.mjs` → `dist/sehatcard.html`
2. Replace starter terminology with verified NRCeS value sets
3. ABDM sandbox integration (HIP/HIU, consent gateway)

## Credits

QR generation: qrcode-generator by Kazuhiko Arase (MIT), vendored and inlined.
