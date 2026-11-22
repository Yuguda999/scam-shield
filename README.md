# Scam Shield

**Check before you pay.** Scam Shield checks SMS, WhatsApp messages, emails and web pages for scams. It reads your messages with the AI on your own device, and anything that has to go to the cloud is redacted first.

**Try it:** https://scam-shield-hybrid.web.app (works in any browser; Chrome with Gemini Nano runs checks on-device).

Built for [#BuildHybridAI 2026](https://firebasehybridaihackathon.devpost.com/) with [Firebase AI Logic hybrid inference](https://firebase.google.com/docs/ai-logic/hybrid).

## The problem

Fake bank credit alerts, "your BVN will be blocked" messages, fake job offers with "training fees", Ponzi-style investments and OTP requests cost Nigerians billions of naira every year. The people most exposed often can't afford data for heavy apps, and they are rightly wary of pasting private bank messages into a chatbot.

## How Scam Shield uses hybrid inference

Hybrid inference makes on-device AI possible. Scam Shield adds one rule on top: **raw messages never leave the device.**

| Situation | Firebase AI Logic mode | What the model sees |
|---|---|---|
| Gemini Nano is available and the message fits | `ONLY_ON_DEVICE` | The original message. Nothing is sent anywhere. |
| No on-device model, or the message is too long | `ONLY_IN_CLOUD`, after the user agrees | A copy redacted **on the device** (phones, account numbers, BVN/NIN, OTPs, cards, emails, link paths, person names) |
| "Second opinion" button | `ONLY_IN_CLOUD` | The redacted copy |
| Explain in English | `PREFER_ON_DEVICE` | The finding, not the message |
| Explain in Hausa, Yorùbá, Igbo or Pidgin | `PREFER_IN_CLOUD` | The redacted finding. Chrome's on-device model is only validated for English. |

Why not just use `PREFER_ON_DEVICE` for everything? When no local model exists, that mode falls back to the cloud **with the original prompt**. Scam Shield checks availability first ([`src/core/router.ts`](src/core/router.ts)). When a message is bound for the cloud, it redacts it ([`src/core/redact.ts`](src/core/redact.ts)) and shows the user the exact text before sending. When the on-device model is ready, it also finds person names to redact. Unit tests check that no route sends raw text to the cloud.

Other Firebase products:

- **App Check** protects the Gemini API: reCAPTCHA Enterprise (Fraud Defense) on the hosted site, a debug token in the Chrome extension (MV3 extensions cannot load reCAPTCHA). Public web builds have the debug token stripped at build time.
- **Authentication** (anonymous) and **Firestore** store community reports: redacted text only, append-only, field-validated by [`firestore.rules`](firestore.rules).
- **Hosting** serves the web app.
- **Remote Config** pushes new scam patterns, the on-device length limit and the cloud model name without a new release.
- Structured output uses one JSON Schema for both paths: `responseConstraint` on-device and `responseJsonSchema` in the cloud.

## Features

- Side panel: paste a message, or right-click selected text or a page and choose **Check with Scam Shield**.
- Verdict, risk score, scam type, warning signs quoted from the message, and practical next steps.
- A badge shows where each answer was computed (🔒 on this device / ☁️ cloud · redacted), with a "How was this checked?" panel.
- Explanations in Hausa, Yorùbá, Igbo, Nigerian Pidgin or simple English.

## Run it

Requirements: Node 22+, pnpm, and Chrome desktop 139+ (the on-device model also needs about 22 GB of free disk space).

```bash
pnpm install
cp .env.example .env.local   # then put an App Check debug token (any UUID v4) in it
pnpm build                   # outputs dist/ext
```

1. In your Firebase project: enable **AI Logic → Gemini Developer API**, register a web app and copy its config into `src/firebase/config.ts`. Then under **App Check → Apps → ⋮ → Manage debug tokens**, add the token from `.env.local`.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose `dist/ext`.
3. Click the Scam Shield icon to open the side panel. If the status chip says "tap to download", click it to fetch Gemini Nano. Until the model is ready, checks use the redacted cloud path.

### Web app

```bash
echo 'VITE_RECAPTCHA_SITE_KEY=<your reCAPTCHA Enterprise key>' > .env.web
pnpm build:web          # dist/web, debug token stripped
pnpm deploy:web         # Firebase Hosting
pnpm deploy:rules       # Firestore rules
```

Register the same key under **App Check → Fraud Defense** for your web app, with your hosting domain in the key's domain list.

```bash
pnpm test        # unit tests: redaction, routing, community, output parsing
pnpm typecheck
```

## Project layout

```
src/core/       pure logic: redaction, routing, prompts, schema, parsing (unit-tested)
src/firebase/   Firebase app, App Check, Remote Config, hybrid model calls
src/ui/         side panel UI (no framework, model output rendered as text only)
src/ext/        Chrome extension entry points (side panel, service worker)
src/web/        hosted web app entry (landing section + checker)
public/         manifest and icons
```

## Licence

[Apache-2.0](LICENSE)
