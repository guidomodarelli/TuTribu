"""Observe scoped SDK event metadata without querying text, changing focus or speaking."""
import json
import os
import signal
import sys

if sys.platform != "linux" or os.environ.get("GITHUB_ACTIONS") != "true" or not os.environ.get("DISPLAY"):
    raise RuntimeError("AdmissionReaderEvents.start failed: disposable_linux_display_required")

import gi
gi.require_version("Atspi", "2.0")
from gi.repository import Atspi, GLib

expected, serialized_configuration = sys.argv[1:3]
configuration = json.loads(serialized_configuration)
Atspi.init()
Atspi.set_timeout(configuration["queryTimeoutMs"], configuration["queryTimeoutMs"])
groups = {}
observed_events = read_failures = dropped_events = 0
completion = configuration["completions"]["deadline"]
loop = GLib.MainLoop()


def observe(event):
    """Keep only enums, flags and bounded lengths for the owned MiniBrowser."""
    global observed_events, read_failures, dropped_events
    try:
        application = event.source.get_application()
        if application is None or application.get_name() != configuration["application"]:
            return
        event_type = next((registered for registered in configuration["eventTypes"] if event.type.startswith(registered)), None)
        if event_type is None:
            return
        attributes = event.source.get_attributes() or {}
        toolkit_name = attributes.get("toolkit", "")
        toolkit = next((family for family, names in configuration["toolkits"].items() if isinstance(toolkit_name, str) and any(toolkit_name.casefold() == name.casefold() for name in names)), configuration["defaultToolkit"])
        role_id = int(event.source.get_role())
        live_region = any(attributes.get(name) in {"polite", "assertive"} for name in ("live", "container-live"))
        payload_is_text = isinstance(event.any_data, str)
        expected_text = payload_is_text and expected in event.any_data
        data_length = min(len(event.any_data), configuration["maximumDataLength"]) if payload_is_text else 0
        identity = (event_type, toolkit, role_id, live_region, payload_is_text, expected_text)
        observed_events += 1
        if identity not in groups:
            if len(groups) >= configuration["maximumGroups"]:
                dropped_events += 1
                return
            groups[identity] = {"eventType": event_type, "toolkit": toolkit, "roleId": role_id, "liveRegion": live_region, "payloadIsText": payload_is_text, "expectedTextInPayload": expected_text, "maximumDataLength": 0, "count": 0}
        group = groups[identity]
        group["count"] += 1
        group["maximumDataLength"] = max(group["maximumDataLength"], data_length)
    except Exception:
        read_failures += 1


def finish(reason):
    """End this bounded subscription; never alter the browser or the reader."""
    global completion
    completion = reason
    loop.quit()
    return False


listener = Atspi.EventListener.new(observe)
registered_events = []
try:
    for event_type in configuration["eventTypes"]:
        if listener.register(event_type) is not True:
            raise RuntimeError("AdmissionReaderEvents.register failed: subscription_unconfirmed")
        registered_events.append(event_type)
    GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, signal.SIGTERM, lambda: finish(configuration["completions"]["stopped"]))
    GLib.timeout_add(configuration["durationMs"], lambda: finish(configuration["completions"]["deadline"]))
    print(json.dumps({"phase": configuration["phases"]["ready"]}), flush=True)
    loop.run()
finally:
    for event_type in registered_events:
        listener.deregister(event_type)

observation = {"registeredEvents": registered_events, "completion": completion, "observedEvents": observed_events, "readFailures": read_failures, "droppedEvents": dropped_events, "groups": list(groups.values())}
print(json.dumps({"phase": configuration["phases"]["completed"], "observation": observation}), flush=True)
