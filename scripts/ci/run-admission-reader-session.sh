#!/usr/bin/env bash
set -euo pipefail

export XDG_RUNTIME_DIR="$RUNNER_TEMP/admission-reader-runtime"
export XDG_CONFIG_HOME="$RUNNER_TEMP/admission-reader-config"
export XDG_CACHE_HOME="$RUNNER_TEMP/admission-reader-cache"
export XDG_DATA_HOME="$RUNNER_TEMP/admission-reader-data"
export GTK_A11Y=atspi
export NO_AT_BRIDGE=0
export ORCA_DEBUG_LOG="$RUNNER_TEMP/admission-reader-native.out"
export ORCA_AUDIO_FILE="$RUNNER_TEMP/admission-reader-audio.raw"
reader_browser_locale="$(node --input-type=module -e 'import {ADMISSION_READER_PROBE} from "./tests/support/constants/admission-reader-probe.mjs"; process.stdout.write(ADMISSION_READER_PROBE.nativeBrowserLocale)')"
sudo locale-gen "$reader_browser_locale"
mkdir -p "$XDG_RUNTIME_DIR" "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME" "$XDG_DATA_HOME/orca/app-settings"
chmod 700 "$XDG_RUNTIME_DIR"
cp tests/support/config/admission-native-reader-settings.json "$XDG_DATA_HOME/orca/user-settings.conf"
for reader_application in 'Google Chrome for Testing' 'MiniBrowser'; do
  cp tests/support/config/admission-native-reader-application-settings.json "$XDG_DATA_HOME/orca/app-settings/$reader_application.conf"
done

cleanup() {
  printf '%s\n' '{"phase":"reader_session_cleanup_started"}'
  local reader_jobs=()
  mapfile -t reader_jobs < <(jobs -pr)
  for job_id in "${reader_jobs[@]}"; do kill "$job_id" 2>/dev/null || true; done
  sleep 1
  mapfile -t reader_jobs < <(jobs -pr)
  for job_id in "${reader_jobs[@]}"; do kill -KILL "$job_id" 2>/dev/null || true; done
  wait || true
  pulseaudio --kill >/dev/null 2>&1 || true
  printf '%s\n' '{"phase":"reader_session_cleanup_finished"}'
}
trap cleanup EXIT

dbus-update-activation-environment DISPLAY XAUTHORITY XDG_RUNTIME_DIR XDG_CONFIG_HOME XDG_CACHE_HOME XDG_DATA_HOME GTK_A11Y NO_AT_BRIDGE
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
reader_version_output="$("$reader_binary" --version)"
reader_version="$(printf '%s' "$reader_version_output" | node --input-type=module -e 'import {parseNativeReaderVersion} from "./tests/support/admission-reader-observation.mjs"; let output=""; for await(const chunk of process.stdin) output+=chunk; const version=parseNativeReaderVersion(output); if(!version) throw new Error("NativeReaderSession.readVersion failed: native_reader_version_unrecognized"); process.stdout.write(version);')"
export ORCA_BINARY_VERSION="$reader_version"
printf '{"phase":"reader_version_observed","version":"%s"}\n' "$ORCA_BINARY_VERSION"
if [[ -n "${ORCA_EXPECTED_VERSION:-}" && "$ORCA_BINARY_VERSION" != "$ORCA_EXPECTED_VERSION" ]]; then
  printf '%s\n' 'NativeReaderSession.verifyVersion failed: unexpected_reader_version' >&2
  exit 1
fi
export SPEECH_DISPATCHER_VERSION="$(speech-dispatcher --version | head -n 1)"
"$reader_binary" --user-prefs="$XDG_DATA_HOME/orca" --replace --enable=speech --disable=braille --debug --debug-file="$ORCA_DEBUG_LOG" > "$RUNNER_TEMP/admission-reader-service.log" 2>&1 &
if [[ "$#" -eq 0 ]]; then exit 2; fi
reader_command_status=0
"$@" || reader_command_status=$?
printf '{"phase":"reader_command_completed","exitCode":%d}\n' "$reader_command_status"
exit "$reader_command_status"
