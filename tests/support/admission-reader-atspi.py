"""Inspect only this CI canary's native AT-SPI metadata; never generate speech."""
import json
import os
import sys
from collections import deque

if sys.platform != "linux" or os.environ.get("GITHUB_ACTIONS") != "true":
    raise RuntimeError("AdmissionReaderAtspi.start failed: disposable_linux_runner_required")

import gi
gi.require_version("Atspi", "2.0")
from gi.repository import Atspi

target, maximum_nodes, maximum_depth, timeout_ms = sys.argv[1:]
maximum_nodes, maximum_depth, timeout_ms = int(maximum_nodes), int(maximum_depth), int(timeout_ms)
Atspi.set_timeout(timeout_ms, timeout_ms)
allowed_attributes = {"container-live", "live", "container-atomic", "atomic", "container-relevant", "relevant", "xml-roles", "tag", "id"}
pending = deque([Atspi.get_desktop(0)])
seen, matches, unavailable = set(), [], 0
while pending and len(seen) < maximum_nodes:
    current = pending.popleft()
    if current is None or hash(current) in seen:
        continue
    seen.add(hash(current))
    try:
        name = current.get_name() or ""
        text = ""
        try:
            interface = current.get_text_iface()
            if interface is not None:
                text = interface.get_text(0, -1)
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
print(json.dumps({"scanned": len(seen), "unavailable": unavailable, "matches": matches}))
