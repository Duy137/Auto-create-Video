import sqlite3, json

conn = sqlite3.connect("data/autoclip.db")
cur = conn.cursor()
cur.execute("SELECT id, settings, props FROM jobs WHERE status='done' ORDER BY created_at DESC LIMIT 1")
row = cur.fetchone()
job_id = row[0]
settings = json.loads(row[1]) if row[1] else {}
props = json.loads(row[2]) if row[2] else {}

print(f"Job: {job_id}")
print()
print("=== job.settings bg fields ===")
print(f"  custom_background_url: {settings.get('custom_background_url', 'NOT SET')}")
print(f"  custom_background_type: {settings.get('custom_background_type', 'NOT SET')}")
print(f"  custom_background_duration_sec: {settings.get('custom_background_duration_sec', 'NOT SET')}")
print()
ps = props.get("settings", {})
print("=== job.props.settings bg fields ===")
print(f"  custom_background_url: {ps.get('custom_background_url', 'NOT SET')}")
print(f"  custom_background_type: {ps.get('custom_background_type', 'NOT SET')}")
print(f"  custom_background_duration_sec: {ps.get('custom_background_duration_sec', 'NOT SET')}")
print(f"  background_preset: {ps.get('background_preset', 'NOT SET')}")

# Check render props file
import os
render_path = f"output/{job_id}/render_props.json"
if os.path.exists(render_path):
    rp = json.loads(open(render_path).read())
    rps = rp.get("settings", {})
    print()
    print("=== render_props.json settings bg fields ===")
    print(f"  custom_background_url: {rps.get('custom_background_url', 'NOT SET')}")
    print(f"  custom_background_type: {rps.get('custom_background_type', 'NOT SET')}")
    print(f"  customBackgroundDurationSec: {rps.get('customBackgroundDurationSec', 'NOT SET')}")
    print(f"  background_preset: {rps.get('background_preset', 'NOT SET')}")
else:
    print(f"\nrender_props.json NOT FOUND at {render_path}")
    # Try remotion dir
    rp2 = f"remotion/public/assets/{job_id}/render_props.json"
    if os.path.exists(rp2):
        rp = json.loads(open(rp2).read())
        rps = rp.get("settings", {})
        print(f"Found at {rp2}")
        print(f"  custom_background_url: {rps.get('custom_background_url', 'NOT SET')}")
    else:
        print(f"Also not at {rp2}")

conn.close()
