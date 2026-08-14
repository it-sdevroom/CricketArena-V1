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
PROJECT_DIR="$(pwd -W 2>/dev/null || pwd)"

# --- Windows path length ---------------------------------------------------
# The New Architecture compiles C++ through CMake, and ninja bakes the full
# source path into every object filename. Under
# F:\Projects\Cricket\CricketArena-Mobile-App-v2\CricketArena that overruns
# Windows' 260-character limit and the build dies after half an hour of work:
#
#   ninja: error: Stat(...RNCSafeAreaViewShadowNode.cpp.o):
#          Filename longer than 260 characters
#
# Mapping the project to a one-letter virtual drive removes 57 characters from
# every path, which is comfortably enough. subst is per-session and changes
# nothing on disk.
if [ "${OS:-}" = "Windows_NT" ] && [ ${#PROJECT_DIR} -gt 24 ]; then
  SHORT_DRIVE="${SHORT_DRIVE:-X:}"
  # Map the PARENT, so the project lands at X:\<name> rather than at X:\.
  # Expo's autolinking walks up from the project root looking for package.json
  # and cannot cope with a drive root, failing with
  #   Couldn't find "package.json" up from path "X:\"
  PARENT_DIR=$(dirname "$PROJECT_DIR")
  PROJECT_NAME=$(basename "$PROJECT_DIR")
  WIN_PARENT=$(echo "$PARENT_DIR" | sed 's|/|\\|g')

  cmd //c "subst $SHORT_DRIVE /D" >/dev/null 2>&1 || true
  cmd //c "subst $SHORT_DRIVE $WIN_PARENT" >/dev/null 2>&1 || true

  MOUNT="/$(echo "${SHORT_DRIVE%:}" | tr 'A-Z' 'a-z')/$PROJECT_NAME"
  if [ -f "$MOUNT/package.json" ]; then
    echo "Short path:  $SHORT_DRIVE\\$PROJECT_NAME  (was $PROJECT_DIR)"
    # CMake caches absolute paths, so anything configured under the long path
    # has to go or it will keep using it.
    find "$MOUNT/android" "$MOUNT/node_modules" -type d -name ".cxx" -prune \
      -exec rm -rf {} + 2>/dev/null || true
    cd "$MOUNT"
  else
    echo "Could not map $SHORT_DRIVE; continuing from the long path." >&2
    echo "If the C++ build fails on filename length, free up that drive letter." >&2
  fi
fi

# --- toolchain -------------------------------------------------------------
# Two different Java requirements, which is easy to trip over:
#
#   * Gradle itself runs happily on 17 or newer, so Android Studio's bundled
#     JDK 21 is fine to launch the build with.
#   * React Native's Gradle plugin compiles its Kotlin against a toolchain
#     pinned to *exactly* 17. Gradle will not substitute 21, and if no 17 is
#     installed it tries to download one from Adoptium mid-build — which fails
#     on a slow connection and wastes the whole run.
#
# So we make sure a real JDK 17 exists up front. ~/.jdks is one of the
# locations Gradle auto-detects, so simply unpacking it there is enough; no
# gradle.properties entry is needed and it survives `expo prebuild`.
JDK17_DIR=$(find "$HOME/.jdks" -maxdepth 1 -type d -name "jdk-17*" 2>/dev/null | head -1)

if [ -z "$JDK17_DIR" ]; then
  echo "JDK 17 not found in ~/.jdks — fetching it (about 180 MB, resumable)."
  mkdir -p "$HOME/.jdks"

  # Corretto first, Adoptium second. Adoptium redirects to github.com, which is
  # not always resolvable here, whereas Corretto is served straight from AWS.
  # Both are fine builds of OpenJDK 17; whichever arrives is good enough.
  ( cd "$HOME/.jdks"
    for source in \
      "https://corretto.aws/downloads/latest/amazon-corretto-17-x64-windows-jdk.zip" \
      "https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse"
    do
      echo "  trying ${source%%/downloads*}"
      if curl -L --fail --retry 25 --retry-delay 4 --retry-all-errors --continue-at - \
           --connect-timeout 30 --speed-time 180 --speed-limit 512 \
           -o jdk17.zip "$source"
      then
        # A truncated archive is worse than none: verify before unpacking.
        if unzip -t jdk17.zip >/dev/null 2>&1; then
          unzip -q -o jdk17.zip && rm -f jdk17.zip
          break
        fi
        echo "  archive was corrupt, discarding"
        rm -f jdk17.zip
      fi
    done )

  JDK17_DIR=$(find "$HOME/.jdks" -maxdepth 1 -type d \( -name "jdk-17*" -o -name "*corretto-17*" \) | head -1)
fi

if [ -z "$JDK17_DIR" ]; then
  echo "Could not obtain a JDK 17. Install one, or build through EAS instead:" >&2
  echo "  npx eas-cli@latest build --platform android --profile preview" >&2
  exit 1
fi

[ -n "$JDK17_DIR" ] && echo "JDK 17:      $JDK17_DIR"

# Gradle itself launches on whichever JDK we hand it; 21 is fine.
for candidate in \
  "/c/Program Files/Android/Android Studio/jbr" \
  "C:/Program Files/Android/Android Studio/jbr" \
  "$JDK17_DIR" \
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
