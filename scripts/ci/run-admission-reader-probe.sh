#!/usr/bin/env bash
set -euo pipefail

export XDG_RUNTIME_DIR="$RUNNER_TEMP/admission-reader-runtime"
export XDG_CONFIG_HOME="$RUNNER_TEMP/admission-reader-config"
export XDG_CACHE_HOME="$RUNNER_TEMP/admission-reader-cache"
export GTK_A11Y=atspi
export NO_AT_BRIDGE=0
export ORCA_DEBUG_LOG="$RUNNER_TEMP/admission-reader-native.out"
export ORCA_AUDIO_FILE="$RUNNER_TEMP/admission-reader-audio.raw"
mkdir -p "$XDG_RUNTIME_DIR" "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME"
chmod 700 "$XDG_RUNTIME_DIR"

cleanup() {
  while read -r job_id; do kill "$job_id" 2>/dev/null || true; done < <(jobs -pr)
  wait || true
  pulseaudio --kill >/dev/null 2>&1 || true
}
trap cleanup EXIT

gsettings set org.gnome.desktop.interface toolkit-accessibility true
gsettings set org.gnome.desktop.a11y.applications screen-reader-enabled true
pulseaudio --start --exit-idle-time=-1
pactl load-module module-null-sink sink_name=admission_reader >/dev/null
pactl set-default-sink admission_reader
pactl set-sink-volume admission_reader 100%
reader_sample_rate="$(node --input-type=module -e 'import {ADMISSION_READER_PROBE} from "./tests/support/constants/admission-reader-probe.mjs"; process.stdout.write(String(ADMISSION_READER_PROBE.sampleRate))')"
parec --device=admission_reader.monitor --format=s16le --rate="$reader_sample_rate" --channels=1 > "$ORCA_AUDIO_FILE" &
openbox --sm-disable > "$RUNNER_TEMP/admission-reader-window-manager.log" 2>&1 &
reader_binary="${ORCA_BINARY_PATH:-orca}"
export ORCA_BINARY_VERSION="$("$reader_binary" --version)"
if [[ -n "${ORCA_EXPECTED_VERSION:-}" ]]; then test "$ORCA_BINARY_VERSION" = "$ORCA_EXPECTED_VERSION"; fi
export SPEECH_DISPATCHER_VERSION="$(speech-dispatcher --version | head -n 1)"
"$reader_binary" --replace --enable=speech --disable=braille --debug --debug-file="$ORCA_DEBUG_LOG" > "$RUNNER_TEMP/admission-reader-service.log" 2>&1 &
node scripts/ci/run-admission-reader-probe.mjs
