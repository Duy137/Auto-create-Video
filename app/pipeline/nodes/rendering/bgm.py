"""Built-in BGM library metadata and lookup helpers."""

from __future__ import annotations

from pathlib import Path
from typing import Any

_BGM_TRACKS: list[dict[str, Any]] = [
    # ── New tracks ────────────────────────────────────────────────────────────
    {
        "id": "deck-the-halls",
        "name": "Deck The Halls",
        "mood": "festive",
        "bpm": 120,
        "duration_sec": 120,
        "filename": "Deck The Halls - The Soundlings.mp3",
    },
    {
        "id": "delayed-baggage",
        "name": "Delayed Baggage",
        "mood": "upbeat",
        "bpm": 110,
        "duration_sec": 120,
        "filename": "Delayed Baggage - Ryan Stasik.mp3",
    },
    {
        "id": "flowers",
        "name": "Flowers",
        "mood": "chill",
        "bpm": 90,
        "duration_sec": 120,
        "filename": "Flowers - Anno Domini Beats.mp3",
    },
    {
        "id": "fifth-quadrant",
        "name": "The Fifth Quadrant",
        "mood": "rock",
        "bpm": 130,
        "duration_sec": 120,
        "filename": "The Fifth Quadrant - Dan _Lebo_ Lebowitz, Tone Seeker.mp3",
    },
]


from config import PROJECT_ROOT


def get_bgm_assets_dir() -> Path:
    return Path(PROJECT_ROOT) / "assets" / "bgm"


def list_bgm_tracks() -> list[dict[str, Any]]:
    tracks: list[dict[str, Any]] = []
    for track in _BGM_TRACKS:
        tracks.append(
            {
                "id": track["id"],
                "name": track["name"],
                "mood": track["mood"],
                "bpm": track["bpm"],
                "duration_sec": track["duration_sec"],
                "preview_url": f"/api/bgm/library/{track['id']}/file",
            }
        )
    return tracks


def resolve_bgm_track_path(track_id: str) -> Path | None:
    for track in _BGM_TRACKS:
        if track["id"] == track_id:
            path = get_bgm_assets_dir() / track["filename"]
            return path.resolve()
    return None
