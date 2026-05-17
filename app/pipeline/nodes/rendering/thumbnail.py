"""Thumbnail extraction utility for rendered videos.

Uses imageio-ffmpeg to resolve the ffmpeg binary path on each platform,
then extracts a JPEG frame for dashboard/result preview.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from loguru import logger

try:
    import imageio_ffmpeg
except ModuleNotFoundError:
    imageio_ffmpeg = None


def extract_thumbnail(
    video_path: str | Path,
    output_path: str | Path | None = None,
    capture_second: float = 1.0,
) -> Path | None:
    """Extract a thumbnail frame from a video.

    Args:
        video_path: Path to final MP4.
        output_path: Output JPEG path. Defaults to sibling ``thumbnail.jpg``.
        capture_second: Preferred capture timestamp in seconds.

    Returns:
        Path to thumbnail if extraction succeeds, else None.
    """
    source = Path(video_path)
    if not source.exists():
        logger.warning("Thumbnail source video missing: {}", source)
        return None

    target = Path(output_path) if output_path else source.with_name("thumbnail.jpg")
    target.parent.mkdir(parents=True, exist_ok=True)

    ffmpeg_bin = (
        imageio_ffmpeg.get_ffmpeg_exe()
        if imageio_ffmpeg is not None
        else (shutil.which("ffmpeg") or "ffmpeg")
    )

    attempts = [max(0.0, float(capture_second)), 0.0]
    for second in attempts:
        cmd = [
            ffmpeg_bin,
            "-y",
            "-ss",
            f"{second:.3f}",
            "-i",
            str(source),
            "-frames:v",
            "1",
            "-q:v",
            "2",
            str(target),
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                check=False,
            )
            if result.returncode == 0 and target.exists() and target.stat().st_size > 0:
                logger.info("Thumbnail extracted: {}", target)
                return target
        except FileNotFoundError:
            logger.warning("ffmpeg not found on the system. Cannot extract thumbnail.")
            return None

    stderr_tail = (result.stderr or "")[-500:] if "result" in locals() else ""
    logger.warning("Thumbnail extraction failed for {}: {}", source, stderr_tail)
    return None
