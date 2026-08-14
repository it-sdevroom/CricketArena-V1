#!/usr/bin/env bash
#
# Build an installable Android APK on this machine.
#
#   bash scripts/build-apk.sh
#
# No Expo account, no build queue and no fee: Android Studio ships a bundled
# JDK, and the Android SDK is already installed, so the whole thing runs
# locally. EAS is only worth reaching for when you need an iOS build (which
# requires macOS) or a Play Store .aab.
#
# The React Native template signs the release build with the debug keystore by
# default, which is exactly what you want for testing on your own phone: the
# APK installs without a signing ceremony. It is NOT suitable for the Play
# Store — that needs a real upload key, see the note at the bottom.
set -euo pipefail

cd "$(dirname "$0")/.."

# --- toolchain -------------------------------------------------------------
# Expo SDK 54 needs JDK 17 or newer. The system Java here is 8, so point at the
# JDK that ships inside Android Studio rather than asking anyone to install one.
for candidate in \
  "/c/Program Files/Android/Android Studio/jbr" \
  "C:/Program Files/Android/Android Studio/jbr" \
  "${JAVA_HOME:-}"
do
  if [ -x "$candidate/bin/java.exe" ] || [ -x "$candidate/bin/java" ]; then
    export JAVA_HOME="$candidate"
    break
  fi
done

if [ -z "${JAVA_HOME:-}" ]; then
  echo "Could not find a JDK 17+. Install Android Studio, or set JAVA_HOME." >&2
  exit 1
fi

export ANDROID_HOME="${ANDROID_HOME:-$LOCALAPPDATA/Android/Sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

echo "JDK:         $("$JAVA_HOME/bin/java" -version 2>&1 | head -1)"
echo "Android SDK: $ANDROID_HOME"

if [ ! -d "$ANDROID_HOME/platform-tools" ]; then
  echo "Android SDK looks incomplete: no platform-tools in $ANDROID_HOME" >&2
  exit 1
fi

# --- native project --------------------------------------------------------
# android/ is generated, not committed. Regenerating keeps it in step with
# app.config.ts instead of drifting the way a checked-in project does.
echo
echo "==> Generating the native Android project"
npx expo prebuild --platform android --no-install

# --- bundle and compile ----------------------------------------------------
# EXPO_PUBLIC_* values are inlined at bundle time, and Expo reads .env, so the
# APK ends up pointing at the real Supabase project rather than opening on the
# setup screen. Fail early if that file is missing.
if [ ! -f .env ]; then
  echo
  echo "No .env file. The APK would build but open on the setup screen." >&2
  echo "Create one with EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY." >&2
  exit 1
fi

echo
echo "==> Compiling (first run downloads Gradle and dependencies; allow 10-20 minutes)"
cd android
# --no-daemon keeps a long-lived Gradle process from holding file locks on
# Windows, which otherwise breaks the next prebuild.
./gradlew assembleRelease --no-daemon

# --- result ----------------------------------------------------------------
cd ..
APK=$(find android/app/build/outputs/apk/release -name "*.apk" | head -1)

if [ -z "$APK" ]; then
  echo "Build reported success but no APK was produced." >&2
  exit 1
fi

DEST="cricket-arena.apk"
cp "$APK" "$DEST"

echo
echo "  APK: $DEST  ($(du -h "$DEST" | cut -f1))"
echo
echo "  Install over USB with debugging enabled:"
echo "    adb install -r $DEST"
echo
echo "  Or copy it to the phone and open it; Android will ask to allow"
echo "  installing from this source."
echo
echo "  For the Play Store you need an .aab signed with a real upload key,"
echo "  not this debug-signed APK:"
echo "    cd android && ./gradlew bundleRelease"
