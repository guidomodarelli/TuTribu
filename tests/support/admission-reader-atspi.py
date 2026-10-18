"""Inspect only the owned CI reader's native AT-SPI metadata; never generate speech."""
import json
import os
import sys
from collections import deque

if sys.platform != "linux" or os.environ.get("GITHUB_ACTIONS") != "true":
    raise RuntimeError("AdmissionReaderAtspi.start failed: disposable_linux_runner_required")

import gi
gi.require_version("Atspi", "2.0")
from gi.repository import Atspi

target, maximum_nodes, maximum_depth, timeout_ms = sys.argv[1:5]
mode = sys.argv[5] if len(sys.argv) > 5 else "status"
if mode not in {"status", "focus"}:
    raise RuntimeError("AdmissionReaderAtspi.inspect failed: unsupported_observation_mode")
maximum_nodes, maximum_depth, timeout_ms = int(maximum_nodes), int(maximum_depth), int(timeout_ms)
Atspi.set_timeout(timeout_ms, timeout_ms)
allowed_attributes = {"container-live", "live", "container-atomic", "atomic", "container-relevant", "relevant", "xml-roles", "tag", "id", "toolkit"}
live_roles = {"status", "alert", "log"}
pending = deque([Atspi.get_desktop(0)])
seen, matches, unavailable, live_regions = set(), [], 0, []
focused_nodes, expected_nodes = [], []
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
        try:
            interface = current.get_text_iface()
            if interface is not None:
                text = interface.get_text(0, -1)
                text_available = True
        except Exception:
            unavailable += 1
        try:
            attributes = current.get_attributes() or {}
            if any(attributes.get(key) in {"polite", "assertive"} for key in {"live", "container-live"}) or live_roles.intersection(attributes.get("xml-roles", "").split()):
                live_regions.append({
                    "role": str(current.get_role_name()),
                    "attributes": {key: value for key, value in attributes.items() if key in allowed_attributes},
                    "nameMatchesExpected": bool(target) and target in name,
                    "textMatchesExpected": bool(target) and target in text,
                    "textInterfaceAvailable": text_available,
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
    print(json.dumps({"scanned": len(seen), "unavailable": unavailable, "matches": matches, "liveRegions": live_regions}))
