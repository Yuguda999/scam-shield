# Scam Shield

**Check before you pay.** Scam Shield checks SMS, WhatsApp messages, emails and web pages for scams. Gemini Nano reads your message on your own device. When the cloud is needed, it only ever gets a copy that was redacted on the device, and only after you agree.

Built for [#BuildHybridAI 2026](https://firebasehybridaihackathon.devpost.com/) with [Firebase AI Logic hybrid inference](https://firebase.google.com/docs/ai-logic/hybrid), on **Web, Chrome extension and Android** from one Firebase project.

## Try it

| Platform | How |
|---|---|
| **Web** | https://scam-shield-hybrid.web.app — works in any browser. Chrome desktop with Gemini Nano runs checks on-device; other browsers use the redacted cloud path. |
| **Android** | Download `scam-shield-android-<version>.apk` from [Releases](https://github.com/Yuguda999/scam-shield/releases/latest), allow installs from your browser, open it. Then share any SMS or WhatsApp message to **Scam Shield**, or select text and choose **Check with Scam Shield**. Android 8.0+. |
| **Chrome extension** | Download `scam-shield-chrome-<version>.zip` from [Releases](https://github.com/Yuguda999/scam-shield/releases/latest) and unzip it. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, pick the folder. Click the Scam Shield icon, or right-click selected text → **Check with Scam Shield**. |

Each app has four sample messages (fake BVN update, fake credit alert, fake job offer, a normal family message) so you can try it without your own scam texts.

> **Judging builds and App Check.** Sideloaded Android apps cannot pass Play Integrity, and Chrome extensions cannot load reCAPTCHA, so the Release builds use App Check **debug tokens** issued only for judging (the hosted web app uses reCAPTCHA Enterprise). The project runs on the free Spark plan, and the judging tokens are revoked after judging.

## The problem

Fake bank credit alerts, "your BVN will be blocked" messages, job offers with a "training fee", Ponzi-style investments and OTP requests are everyday hazards for people in Nigeria. The people most exposed often have low-end phones and expensive data, and they are rightly wary of pasting private bank messages into a chatbot.

## How Scam Shield uses hybrid inference

Hybrid inference makes on-device AI possible. Scam Shield adds one rule on top: **raw messages never leave the device.**

| Situation | Firebase AI Logic mode | What the model sees |
|---|---|---|
| Gemini Nano is available and the message fits | `ONLY_ON_DEVICE` | The original message. Nothing is sent anywhere. |
| No on-device model, or the message is too long | `ONLY_IN_CLOUD`, after the user agrees | A copy redacted **on the device**: phone and account numbers, BVN/NIN, OTPs, cards, emails, link paths, person names |
| "Second opinion" button | `ONLY_IN_CLOUD` | The redacted copy |
| Explain in English | `PREFER_ON_DEVICE` | The finding, not the message |
| Explain in Hausa, Yorùbá, Igbo or Pidgin | `PREFER_IN_CLOUD` | The redacted finding. On-device models are only validated for English. |

**Why not `PREFER_ON_DEVICE` for everything?** When no local model exists, that mode falls back to the cloud **with the original prompt**. Scam Shield checks availability first and picks an explicit mode per call ([`src/core/router.ts`](src/core/router.ts), [`Router.kt`](android/app/src/main/java/ng/scamshield/app/core/Router.kt)). Text bound for the cloud is redacted on the device ([`redact.ts`](src/core/redact.ts), [`Redact.kt`](android/app/src/main/java/ng/scamshield/app/core/Redact.kt)), and the user sees the exact text before it is sent. When Gemini Nano is present it also finds person names to redact, in `ONLY_ON_DEVICE` mode so the raw text cannot leak even if the model disappears mid-call. Unit tests on both platforms check that no route sends raw text to the cloud.

On a phone without Gemini Nano (we test on a Redmi Note 13), the Android app reports "Cloud · redacted", redacts on the phone, asks for consent and gets the verdict from the cloud. That is the hackathon's own premise: on-device models are not on every device, and the app still works, privately.

### Firebase products

- **AI Logic** (hybrid inference): Web via the JS SDK (`InferenceMode`, `inferenceSource`, `initializeDeviceModel`), Android via `firebase-ai` + `firebase-ai-ondevice` (`OnDeviceConfig`, `onDeviceExtension.checkStatus()` / `download()`). Structured output with one schema on both paths.
- **App Check** protects the Gemini API: reCAPTCHA Enterprise (Fraud Defense) on the hosted site, debug provider in the extension and debug APK, Play Integrity in Android release builds. Public web builds have the debug token stripped at build time.
- **Remote Config** pushes scam patterns, on-device length limits and the cloud model name without a release.
- **Authentication** (anonymous) and **Firestore** hold community reports: redacted text only, append-only, field-validated by [`firestore.rules`](firestore.rules). Web and Android compute the same fingerprint, so a report from one shows up on the other ("1 person has reported this message this week").
- **Hosting** serves the web app.

## Features

- Verdict, risk score, scam type, warning signs quoted from the message, and practical next steps.
- A badge shows where each answer was computed (on this device / cloud · redacted), plus a "How was this checked?" panel with the exact text that was sent.
- Explanations in Hausa, Yorùbá, Igbo, Nigerian Pidgin or simple English.
- Community reports and a weekly "going around" panel.
- Android: share-to-check from any app and the text-selection menu. Chrome: side panel, right-click on selected text or a whole page.

## Build it yourself

You need your own Firebase project: enable **AI Logic → Gemini Developer API**, then register a web app and an Android app (`ng.scamshield.app`).

### Web app and Chrome extension

Node 22+, pnpm, Chrome desktop 139+ (Gemini Nano needs about 22 GB free disk space).

```bash
pnpm install
cp .env.example .env.local     # App Check debug token (any UUID v4) for the extension
pnpm build                     # Chrome extension -> dist/ext (Load unpacked)
echo 'VITE_RECAPTCHA_SITE_KEY=<reCAPTCHA Enterprise key>' > .env.web
pnpm build:web                 # web app -> dist/web, debug token stripped
pnpm deploy:web                # Firebase Hosting
pnpm deploy:rules              # Firestore rules
pnpm test                      # redaction, routing, community, parsing
```

Put your web config in `src/firebase/config.ts`, register the debug token with `firebase appcheck:debugtokens:create <token> --app <web app id>`, and register the reCAPTCHA key under **App Check → Fraud Defense**.

### Android

JDK 17 and the Android SDK (compile SDK 36).

```bash
cd android
# app/google-services.json from your Firebase Android app
echo "appcheck.debugToken=$(uuidgen)" >> local.properties   # then register it with the Firebase CLI
./gradlew :app:testDebugUnitTest :app:assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

`tools/release.sh` builds the judging APK and extension zip into `dist/release/`.

## Project layout

```
src/core/        pure logic: redaction, routing, prompts, schema, parsing (unit-tested)
src/firebase/    Firebase app, App Check, Remote Config, hybrid model calls, community
src/ui/          shared checker UI (no framework, model output rendered as text only)
src/ext/         Chrome extension entry points (side panel, service worker)
src/web/         hosted web app (landing section + checker)
android/app/     Kotlin + Jetpack Compose app
  core/          port of src/core with matching unit tests
  FirebaseEngine.kt  hybrid inference, redaction, Remote Config, Auth, Firestore
public/          extension manifest and icons
```

## Licence

[Apache-2.0](LICENSE)
