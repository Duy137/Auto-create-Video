"""Video Renderer — Remotion CLI wrapper (Python → Remotion subprocess).

Input:  video_props.json path + output path.
Output: final.mp4 path.

Uses Semaphore(1) to ensure only 1 render runs at a time
(Railway Hobby Plan: 512MB RAM limit).

See MASTER_PLAN section "CLI Render Integration" for full spec.
"""

from __future__ import annotations

import asyncio
import subprocess
from pathlib import Path

from loguru import logger


class RenderError(Exception):
    """Raised when Remotion rendering fails."""
    pass


# Only 1 render at a time (Railway RAM constraint)
_render_semaphore = asyncio.Semaphore(1)

# Remotion project directory (relative to workspace root)
REMOTION_DIR = Path("remotion")

# Timeout: 15 minutes
RENDER_TIMEOUT = 900


async def render_video(
    props_path: str | Path,
    output_path: str | Path,
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

        cmd = [
            "npx", "remotion", "render",
            "src/index.ts",
            "AutoClipVideo",
            str(output_path),
            "--props", str(props_path),
            "--timeout", str(RENDER_TIMEOUT * 1000),  # Remotion uses ms
            "--concurrency=1",  # Prevent multi-tab video seeking jitter
        ]

        logger.debug("Command: {}", " ".join(cmd))

        try:
            # Run in thread pool to avoid blocking event loop
            loop = asyncio.get_event_loop()
            result = await asyncio.wait_for(
                loop.run_in_executor(
                    None,
                    _run_render_sync,
                    cmd,
                    str(REMOTION_DIR),
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

        return output_path


def _run_render_sync(cmd: list[str], cwd: str) -> subprocess.CompletedProcess:
    """Run Remotion render synchronously (called from thread pool).

    Captures stdout/stderr for logging and error reporting.
    """
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=RENDER_TIMEOUT,
            shell=True,  # Required on Windows to resolve npx.cmd
        )

        if result.stdout:
            for line in result.stdout.strip().split("\n")[-5:]:
                logger.debug("[remotion] {}", line.strip())

        if result.returncode != 0:
            stderr = result.stderr or "No stderr output"
            logger.error("Remotion render failed (exit {}):\n{}", result.returncode, stderr)
            raise RenderError(
                f"Remotion render failed (exit code {result.returncode}):\n{stderr}"
            )

        return result

    except subprocess.TimeoutExpired:
        raise RenderError(f"Remotion process timed out after {RENDER_TIMEOUT}s")
    except FileNotFoundError:
        raise RenderError(
            "npx not found. Ensure Node.js is installed and in PATH."
        )
