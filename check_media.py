import sqlite3, json

conn = sqlite3.connect("data/autoclip.db")
cur = conn.cursor()
cur.execute("SELECT id, props FROM jobs ORDER BY created_at DESC LIMIT 1")
row = cur.fetchone()
job_id = row[0]
props = json.loads(row[1])
print(f"Job: {job_id}")
for s in props.get("scenes", []):
    idx = s.get("scene_index")
    stype = s.get("scene_type")
    url = s.get("media_url")
    mtype = s.get("media_type")
    print(f"\nScene {idx}: type={stype} media_type={mtype}")
    if url:
        print(f"  media_url={url}")
        # Simulate getPreviewUrl logic
        if url.startswith("http") or url.startswith("/api/"):
            print(f"  -> preview: {url[:80]}...")
        elif url.startswith("assets/"):
            print(f"  -> preview: /api/demo/{url}")
        else:
            normalized = url.replace("\\", "/")
            oidx = normalized.find("output/")
            if oidx >= 0:
                rel = normalized[oidx + len("output/"):]
                print(f"  -> preview: /api/outputs/{rel}")
            else:
                print(f"  -> preview: NULL (no output/ in path)")
    else:
        print(f"  media_url=None -> preview: NULL")

print(f"\nSettings bg: {props.get('settings', {}).get('custom_background_url')}")
conn.close()
