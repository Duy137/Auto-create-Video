"""Video Renderer — Remotion CLI wrapper (Python → Remotion subprocess).

Input:  video_props.json path + output path.
Output: final.mp4 path.

Uses Semaphore(1) to ensure only 1 render runs at a time
(Railway Hobby Plan: 512MB RAM limit).

See MASTER_PLAN section "CLI Render Integration" for full spec.
"""

from __future__ import annotations

import asyncio
import re
import subprocess
from pathlib import Path
from typing import Any, Awaitable, Callable

from loguru import logger

from config import MAX_CONCURRENT_RENDERS


class RenderError(Exception):
    """Raised when Remotion rendering fails."""
    pass


RenderProgressCallback = Callable[[dict[str, Any]], Awaitable[None]]


# Semaphore size is configurable via MAX_CONCURRENT_RENDERS env var (default 1)
_render_semaphore = asyncio.Semaphore(MAX_CONCURRENT_RENDERS)

# Remotion project directory (relative to workspace root)
REMOTION_DIR = Path("remotion")

# Timeout: 15 minutes
RENDER_TIMEOUT = 900


_FRAME_PROGRESS_PATTERNS = [
    re.compile(
        r"(?i)\b(?:render(?:ed|ing)?|frame(?:s)?|encoded?)\D{0,24}(?P<done>\d{1,7})\s*(?:/|of)\s*(?P<total>\d{1,7})\b"
    ),
    re.compile(
        r"(?i)\b(?P<done>\d{1,7})\s*(?:/|of)\s*(?P<total>\d{1,7})\b.{0,40}\b(?:frame|render|encode)"
    ),
]
_PERCENT_PROGRESS_PATTERN = re.compile(r"(?i)(?P<pct>\d{1,3}(?:\.\d+)?)\s*%")


def _extract_render_progress(line: str) -> dict[str, Any] | None:
    text = line.strip()
    if not text:
        return None

    for pattern in _FRAME_PROGRESS_PATTERNS:
        match = pattern.search(text)
        if not match:
            continue

        done = int(match.group("done"))
        total = int(match.group("total"))
        if total <= 0:
            continue

        safe_done = min(max(done, 0), total)
        return {
            "frame_progress": safe_done / total,
            "rendered_frames": safe_done,
            "total_frames": total,
            "raw_line": text,
        }

    percent_match = _PERCENT_PROGRESS_PATTERN.search(text)
    if percent_match:
        pct = float(percent_match.group("pct"))
        if 0.0 <= pct <= 100.0:
            return {
                "frame_progress": pct / 100.0,
                "percent_progress": pct,
                "raw_line": text,
            }

    return None


async def render_video(
    props_path: str | Path,
    output_path: str | Path,
    progress_callback: RenderProgressCallback | None = None,
) -> Path:
    """Render video via Remotion CLI with error handling.

    Args:
        props_path: Absolute path to video_props.json.
        output_path: Absolute path for the output .mp4 file.

    Returns:
        Path to the rendered video file.

    Raises:
        RenderError: If Remotion render fails or times out.
    """
    props_path = Path(props_path).resolve()
    output_path = Path(output_path).resolve()

    if not props_path.exists():
        raise RenderError(f"Props file not found: {props_path}")

    # Ensure output directory exists
    output_path.parent.mkdir(parents=True, exist_ok=True)

    logger.info("Rendering video: {} → {}", props_path.name, output_path.name)
    logger.info("Waiting for render semaphore...")

    async with _render_semaphore:
        logger.info("Render semaphore acquired. Starting Remotion render...")

        # Use the source entrypoint and point Remotion at the staged public dir.
        # Passing out/bundle directly is invalid unless it contains index.html.
        # Our asset staging only creates out/bundle/public/assets/{job_id}/...
        cmd = [
            "npx", "remotion", "render",
            "src/index.ts",
            "AutoClipVideo",
            str(output_path),
            "--props", str(props_path),
            "--public-dir", "out/bundle/public",
            "--timeout", str(RENDER_TIMEOUT * 1000),
            "--concurrency=1",
            "--chromium-flags=--disable-dev-shm-usage --disable-setuid-sandbox",
        ]

        logger.debug("Command: {}", " ".join(cmd))

        loop = asyncio.get_running_loop()

        def _emit_progress_threadsafe(payload: dict[str, Any]) -> None:
            if progress_callback is None:
                return

            async def _deliver() -> None:
                try:
                    await progress_callback(payload)
                except Exception as exc:
                    logger.debug("Render progress callback failed: {}", exc)

            loop.call_soon_threadsafe(asyncio.create_task, _deliver())

        try:
            # Run in thread pool to avoid blocking event loop
            result = await asyncio.wait_for(
                loop.run_in_executor(
                    None,
                    _run_render_sync,
                    cmd,
                    str(REMOTION_DIR),
                    _emit_progress_threadsafe,
                ),
                timeout=RENDER_TIMEOUT,
            )
        except asyncio.TimeoutError:
            raise RenderError(
                f"Render timed out after {RENDER_TIMEOUT}s. "
                "Consider reducing video length or increasing timeout."
            )

        if not output_path.exists():
            raise RenderError(
                f"Render completed but output file not found: {output_path}"
            )

        file_size = output_path.stat().st_size
        logger.info(
            "Render complete: {} ({:.1f} MB)",
            output_path.name,
            file_size / (1024 * 1024),
        )

        # Active garbage collection after heavy render job
        import gc
        gc.collect()

        return output_path


def _run_render_sync(
    cmd: list[str],
    cwd: str,
    progress_hook: Callable[[dict[str, Any]], None] | None = None,
) -> subprocess.CompletedProcess:
    """Run Remotion render synchronously (called from thread pool).

    Streams stdout/stderr, parses progress lines, and reports structured progress.
    """
    import os
    from config import REMOTION_CHROME_EXECUTABLE

    # Prepare environment for subprocess
    env = os.environ.copy()
    if REMOTION_CHROME_EXECUTABLE:
        env["REMOTION_CHROME_EXECUTABLE"] = REMOTION_CHROME_EXECUTABLE

    try:
        is_windows = os.name == 'nt'
        process_cmd: str | list[str]
        if is_windows:
            process_cmd = subprocess.list2cmdline(cmd)
        else:
            process_cmd = cmd

        process = subprocess.Popen(
            process_cmd,
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            shell=is_windows,  # True on Windows to resolve npx.cmd, False on Linux
            env=env,
            bufsize=1,
        )
        if process.stdout is None:
            raise RenderError("Unable to capture Remotion output stream")

        tail_lines: list[str] = []
        buffered = ""
        last_progress = -1.0

        def _handle_line(raw: str) -> None:
            nonlocal last_progress
            line = raw.strip()
            if not line:
                return

            tail_lines.append(line)
            if len(tail_lines) > 80:
                del tail_lines[:-80]

            parsed = _extract_render_progress(line)
            if not parsed or progress_hook is None:
                return

            ratio = parsed.get("frame_progress")
            if not isinstance(ratio, (int, float)):
                return

            ratio_val = max(0.0, min(1.0, float(ratio)))
            if ratio_val < 1.0 and ratio_val <= last_progress + 0.002:
                return

            last_progress = max(last_progress, ratio_val)
            progress_hook(parsed)

        while True:
            chunk = process.stdout.read(1024)
            if not chunk:
                break

            buffered += chunk
            parts = re.split(r"[\r\n]+", buffered)
            buffered = parts.pop() if parts else ""
            for part in parts:
                _handle_line(part)

        if buffered:
            _handle_line(buffered)

        return_code = process.wait()

        if tail_lines:
            for line in tail_lines[-5:]:
                logger.debug("[remotion] {}", line.strip())

        if return_code != 0:
            stderr = "\n".join(tail_lines[-30:]) if tail_lines else "No output captured"
            logger.error("Remotion render failed (exit {}):\n{}", return_code, stderr)
            raise RenderError(
                f"Remotion render failed (exit code {return_code}):\n{stderr}"
            )

        return subprocess.CompletedProcess(
            args=cmd,
            returncode=return_code,
            stdout="\n".join(tail_lines),
            stderr="",
        )

    except subprocess.TimeoutExpired:
        raise RenderError(f"Remotion process timed out after {RENDER_TIMEOUT}s")
    except FileNotFoundError:
        raise RenderError(
            "npx not found. Ensure Node.js is installed and in PATH."
        )
