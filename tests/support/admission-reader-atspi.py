"""Inspect only the owned CI reader's native AT-SPI metadata; never generate speech."""
import json
import os
import sys
from collections import deque

if sys.platform != "linux" or os.environ.get("GITHUB_ACTIONS") != "true":
    raise RuntimeError("AdmissionReaderAtspi.start failed: disposable_linux_runner_required")

import gi
gi.require_version("Atspi", "2.0")
from gi.repository import Atspi, GLib

target, maximum_nodes, maximum_depth, timeout_ms = sys.argv[1:5]
mode = sys.argv[5] if len(sys.argv) > 5 else "status"
control_text = sys.argv[6] if len(sys.argv) > 6 else ""
if mode not in {"status", "focus"}:
    raise RuntimeError("AdmissionReaderAtspi.inspect failed: unsupported_observation_mode")
maximum_nodes, maximum_depth, timeout_ms = int(maximum_nodes), int(maximum_depth), int(timeout_ms)
Atspi.set_timeout(timeout_ms, timeout_ms)
allowed_attributes = {"container-live", "live", "container-atomic", "atomic", "container-relevant", "relevant", "xml-roles", "tag", "id", "toolkit"}
live_roles = {"status", "alert", "log"}
pending = deque([Atspi.get_desktop(0)])
seen, matches, unavailable, live_regions = set(), [], 0, []
focused_nodes, expected_nodes = [], []
text_observation = {
    "interfaceQueryFailures": 0, "interfacesReported": 0,
    "typedReadSuccesses": 0, "typedReadTypeErrors": 0,
    "typedReadAttributeErrors": 0,
    "typedReadPlatformErrors": 0, "typedReadOtherErrors": 0,
    "boundReadSuccesses": 0, "boundReadTypeErrors": 0,
    "boundReadAttributeErrors": 0,
    "boundReadPlatformErrors": 0, "boundReadOtherErrors": 0,
    "differingSuccessfulReads": 0, "controlTextMatches": 0,
}
while pending and len(seen) < maximum_nodes:
    current = pending.popleft()
    if current is None or hash(current) in seen:
        continue
    seen.add(hash(current))
    try:
        name = current.get_name() or ""
        if mode == "focus":
            states = current.get_state_set()
            facts = {
                "role": str(current.get_role_name()),
                "focused": states.contains(Atspi.StateType.FOCUSED),
                "active": states.contains(Atspi.StateType.ACTIVE),
                "showing": states.contains(Atspi.StateType.SHOWING),
                "visible": states.contains(Atspi.StateType.VISIBLE),
                "enabled": states.contains(Atspi.StateType.ENABLED),
                "editable": states.contains(Atspi.StateType.EDITABLE),
                "nameMatchesExpected": bool(target) and target in name,
            }
            if facts["focused"]:
                focused_nodes.append(facts)
            if facts["nameMatchesExpected"]:
                expected_nodes.append(facts)
            pending.extend(current.get_child_at_index(index) for index in range(current.get_child_count()))
            continue
        text = ""
        text_available = False
        text_read_succeeded = False
        interface_query_failed = False
        try:
            interface = current.get_text_iface()
            text_available = interface is not None
        except Exception:
            unavailable += 1
            interface_query_failed = True
            text_observation["interfaceQueryFailures"] += 1
        if text_available:
            text_observation["interfacesReported"] += 1
            # Dispatch through the Text interface explicitly, matching the reader's public SDK call.
            try:
                text = Atspi.Text.get_text(current, 0, -1) or ""
                text_read_succeeded = True
                text_observation["typedReadSuccesses"] += 1
                if control_text and control_text in text:
                    text_observation["controlTextMatches"] += 1
            except TypeError:
                unavailable += 1
                text_observation["typedReadTypeErrors"] += 1
            except AttributeError:
                unavailable += 1
                text_observation["typedReadAttributeErrors"] += 1
            except GLib.Error:
                unavailable += 1
                text_observation["typedReadPlatformErrors"] += 1
            except Exception:
                unavailable += 1
                text_observation["typedReadOtherErrors"] += 1
            # Compare the former call only after the speech observation. No text or exception
            # message is retained; these counters distinguish binding errors from platform errors.
            try:
                bound_text = interface.get_text(0, -1) or ""
                text_observation["boundReadSuccesses"] += 1
                if text_read_succeeded and bound_text != text:
                    text_observation["differingSuccessfulReads"] += 1
            except TypeError:
                text_observation["boundReadTypeErrors"] += 1
            except AttributeError:
                text_observation["boundReadAttributeErrors"] += 1
            except GLib.Error:
                text_observation["boundReadPlatformErrors"] += 1
            except Exception:
                text_observation["boundReadOtherErrors"] += 1
        try:
            attributes = current.get_attributes() or {}
            if any(attributes.get(key) in {"polite", "assertive"} for key in {"live", "container-live"}) or live_roles.intersection(attributes.get("xml-roles", "").split()):
                live_regions.append({
                    "role": str(current.get_role_name()),
                    "attributes": {key: value for key, value in attributes.items() if key in allowed_attributes},
                    "nameMatchesExpected": bool(target) and target in name,
                    "textMatchesExpected": bool(target) and target in text,
                    "textInterfaceAvailable": text_available,
                    "textReadSucceeded": text_read_succeeded,
                    "interfaceQueryFailed": interface_query_failed,
                })
        except Exception:
            unavailable += 1
        if target in name or target in text:
            chain, ancestor = [], current
            while ancestor is not None and len(chain) < maximum_depth:
                attributes = ancestor.get_attributes() or {}
                chain.append({"role": str(ancestor.get_role_name()), "attributes": {key: value for key, value in attributes.items() if key in allowed_attributes}})
                ancestor = ancestor.get_parent()
            matches.append(chain)
        pending.extend(current.get_child_at_index(index) for index in range(current.get_child_count()))
    except Exception:
        unavailable += 1
if mode == "focus":
    print(json.dumps({"scanned": len(seen), "unavailable": unavailable, "focusedNodes": focused_nodes, "expectedNodes": expected_nodes}))
else:
    print(json.dumps({"scanned": len(seen), "unavailable": unavailable, "matches": matches, "liveRegions": live_regions, "textObservation": text_observation}))
