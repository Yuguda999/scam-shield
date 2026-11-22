#!/usr/bin/env bash
# Builds the installable artifacts for judges into dist/release/:
#   scam-shield-android-<version>.apk   debuggable APK (App Check debug provider)
#   scam-shield-chrome-<version>.zip    unpacked Chrome extension
#
# Sideloaded apps cannot pass Play Integrity and MV3 extensions cannot load
# reCAPTCHA, so both use App Check *debug tokens* dedicated to judging. Put them
# in a gitignored .judges.env (JUDGES_WEB_TOKEN=..., JUDGES_ANDROID_TOKEN=...),
# register them once with `firebase appcheck:debugtokens:create`, and revoke
# them after judging with `firebase appcheck:debugtokens:delete`.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${VERSION:=$(node -p "require('./package.json').version")}"
[ -f .judges.env ] || { echo "missing .judges.env" >&2; exit 1; }
# shellcheck disable=SC1091
. ./.judges.env
: "${JUDGES_WEB_TOKEN:?}" "${JUDGES_ANDROID_TOKEN:?}"
mkdir -p dist/release

# Chrome extension (process env beats .env.local in Vite).
VITE_APPCHECK_DEBUG_TOKEN="$JUDGES_WEB_TOKEN" npx vite build >/dev/null
(cd dist/ext && rm -f "../release/scam-shield-chrome-$VERSION.zip" && zip -qr "../release/scam-shield-chrome-$VERSION.zip" . -x '*.map')

# Android
(cd android && JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}" ./gradlew -q :app:assembleDebug -PappcheckDebugToken="$JUDGES_ANDROID_TOKEN")
cp android/app/build/outputs/apk/debug/app-debug.apk "dist/release/scam-shield-android-$VERSION.apk"

# Rebuild the local extension with the developer token so dist/ext is not left on the judges token.
npx vite build >/dev/null
ls -la dist/release
