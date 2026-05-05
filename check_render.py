import json

rp = json.loads(open("output/e3eacb632b06/video_props_render.json", encoding="utf-8").read())
s = rp.get("settings", {})
print("=== render props settings ===")
keys = ["custom_background_url", "custom_background_type", "custom_background_duration_sec",
        "customBackgroundDurationSec", "background_preset"]
for k in keys:
    v = s.get(k, "NOT SET")
    print(f"  {k}: {v}")
