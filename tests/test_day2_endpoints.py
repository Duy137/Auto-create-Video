"""Day 2 integration tests — verify all production endpoints.

Run: python tests/test_day2_endpoints.py
Requires: server running on http://localhost:8080
"""

import httpx
import sys
import time

BASE = "http://localhost:8080/api"

def main():
    passed = 0
    failed = 0

    def check(name, condition, detail=""):
        nonlocal passed, failed
        if condition:
            print(f"  ✅ {name}")
            passed += 1
        else:
            print(f"  ❌ {name} — {detail}")
            failed += 1

    # ═══ 1. Health check ═══
    print("\n=== HEALTH CHECK ===")
    r = httpx.get(f"{BASE}/health")
    check("GET /health → 200", r.status_code == 200, f"got {r.status_code}")
    check("Response has status=ok", r.json().get("status") == "ok")

    # ═══ 2. Register ═══
    print("\n=== REGISTER ===")
    r = httpx.post(f"{BASE}/auth/register", json={
        "username": f"testuser_{int(time.time())}",
        "email": f"test_{int(time.time())}@example.com",
        "password": "password123",
    })
    check("POST /auth/register → 201", r.status_code == 201, f"got {r.status_code}: {r.text}")
    data = r.json()
    token = data.get("access_token", "")
    check("Response has access_token", len(token) > 10)
    check("Response has user object", "user" in data)
    check("User has username", "username" in data.get("user", {}))

    headers = {"Authorization": f"Bearer {token}"}

    # ═══ 3. Login ═══
    print("\n=== LOGIN ===")
    username = data.get("user", {}).get("username", "")
    r = httpx.post(f"{BASE}/auth/login", json={
        "username": username,
        "password": "password123",
    })
    check("POST /auth/login → 200", r.status_code == 200, f"got {r.status_code}: {r.text}")
    check("Login returns token", "access_token" in r.json())

    # ═══ 4. Login with wrong password ═══
    print("\n=== LOGIN WRONG PASSWORD ===")
    r = httpx.post(f"{BASE}/auth/login", json={
        "username": username,
        "password": "wrongpassword",
    })
    check("Wrong password → 401", r.status_code == 401, f"got {r.status_code}")

    # ═══ 5. Get /me ═══
    print("\n=== GET /me ===")
    r = httpx.get(f"{BASE}/auth/me", headers=headers)
    check("GET /auth/me → 200", r.status_code == 200, f"got {r.status_code}: {r.text}")
    check("/me returns username", r.json().get("username") == username)

    # ═══ 6. Get /me without token ═══
    print("\n=== UNAUTHENTICATED ===")
    r = httpx.get(f"{BASE}/auth/me")
    check("No token → 401", r.status_code == 401, f"got {r.status_code}")

    # ═══ 7. Duplicate register ═══
    print("\n=== DUPLICATE REGISTER ===")
    r = httpx.post(f"{BASE}/auth/register", json={
        "username": username,
        "email": f"{username}@example.com",
        "password": "password123",
    })
    check("Duplicate username → 409", r.status_code == 409, f"got {r.status_code}: {r.text}")

    # ═══ 8. Create Job ═══
    print("\n=== CREATE JOB ===")
    r = httpx.post(f"{BASE}/jobs", json={
        "input_text": "Day la mot doan van ban thu nghiem de tao video tu dong. No co it nhat 30 tu de vuot qua kiem tra dau vao cua he thong AutoClip AI pipeline. Chung ta can them nhieu tu hon nua de dam bao doan van du dai.",
        "settings": {
            "aspect_ratio": "9:16",
            "tts_engine": "openai",
            "voice": "nova",
            "speech_rate": 1.0,
            "transition_mode": "crossfade",
        },
    }, headers=headers)
    check("POST /jobs → 201", r.status_code == 201, f"got {r.status_code}: {r.text}")
    job = r.json()
    job_id = job.get("id", "")
    check("Job has id", len(job_id) > 0)
    check("Job status is pending", job.get("status") == "pending")
    check("Job has user_id", "user_id" in job)
    check("Job has created_at", "created_at" in job)

    # ═══ 9. List Jobs ═══
    print("\n=== LIST JOBS ===")
    r = httpx.get(f"{BASE}/jobs", headers=headers)
    check("GET /jobs → 200", r.status_code == 200, f"got {r.status_code}: {r.text}")
    jobs_data = r.json()
    check("Response has total", "total" in jobs_data)
    check("Response has jobs array", isinstance(jobs_data.get("jobs"), list))
    check("Total >= 1", jobs_data.get("total", 0) >= 1)

    # ═══ 10. Get Job Detail ═══
    print("\n=== GET JOB DETAIL ===")
    r = httpx.get(f"{BASE}/jobs/{job_id}", headers=headers)
    check("GET /jobs/id → 200", r.status_code == 200, f"got {r.status_code}: {r.text}")
    check("Job id matches", r.json().get("id") == job_id)

    # ═══ 11. Get non-existent job ═══
    print("\n=== NON-EXISTENT JOB ===")
    r = httpx.get(f"{BASE}/jobs/nonexistent", headers=headers)
    check("Non-existent job → 404", r.status_code == 404, f"got {r.status_code}")

    # ═══ 12. Download before done ═══
    print("\n=== DOWNLOAD NOT READY ===")
    r = httpx.get(f"{BASE}/jobs/{job_id}/download", headers=headers)
    check("Download before done → 400", r.status_code == 400, f"got {r.status_code}")

    # ═══ 13. BGM Upload validation ═══
    print("\n=== BGM UPLOAD (bad type) ===")
    r = httpx.post(
        f"{BASE}/bgm/upload",
        headers=headers,
        files={"file": ("test.txt", b"not audio", "text/plain")},
    )
    check("Bad content type → 400", r.status_code == 400, f"got {r.status_code}: {r.text}")

    # ═══ 14. Pagination ═══
    print("\n=== PAGINATION ===")
    r = httpx.get(f"{BASE}/jobs?page=1&per_page=5", headers=headers)
    check("Pagination → 200", r.status_code == 200, f"got {r.status_code}")
    check("Has pagination fields", "page" in r.json() and "per_page" in r.json())

    # ═══ Summary ═══
    print(f"\n{'='*40}")
    print(f"Results: {passed} passed, {failed} failed")
    print(f"{'='*40}")

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
