"""CLI entry point for AutoClip pipeline.

Usage:
    python run_pipeline.py input.txt
    python run_pipeline.py --input text.txt
    python run_pipeline.py --text "Your content here"
    python run_pipeline.py --input text.txt --skip-render
"""

import argparse
import asyncio
import sys
from pathlib import Path

from loguru import logger


def main():
    parser = argparse.ArgumentParser(
        description="AutoClip — Text to Video Pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Examples:\n"
               "  python run_pipeline.py input.txt\n"
               "  python run_pipeline.py --input text.txt --voice nova\n"
               "  python run_pipeline.py --text 'Content here...' --skip-render\n",
    )

    # Input: positional arg or --input/--text flags
    parser.add_argument("file", nargs="?", type=str, help="Path to text file (positional)")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--input", type=str, help="Path to text file")
    group.add_argument("--text", type=str, help="Direct text input")

    # Options
    parser.add_argument("--job-id", type=str, default=None, help="Custom job ID")
    parser.add_argument("--voice", type=str, default="nova", help="TTS voice (default: nova)")
    parser.add_argument("--rate", type=float, default=1.0, help="Speech rate (default: 1.0)")
    parser.add_argument("--skip-render", action="store_true", help="Skip Remotion render (outputs JSON only)")

    args = parser.parse_args()

    # Resolve input text
    text = None

    if args.file:
        text = _read_file(args.file)
    elif args.input:
        text = _read_file(args.input)
    elif args.text:
        text = args.text
    else:
        parser.print_help()
        sys.exit(1)

    if not text or not text.strip():
        logger.error("Empty text provided")
        sys.exit(1)

    logger.info("AutoClip CLI")
    logger.info("Input: {} characters, ~{} words", len(text), len(text.split()))
    logger.info("Voice: {}, Rate: {}", args.voice, args.rate)

    # Run pipeline
    from app.orchestrator import run_pipeline

    try:
        output_path = asyncio.run(
            run_pipeline(
                text,
                job_id=args.job_id,
                voice=args.voice,
                rate=args.rate,
                skip_render=args.skip_render,
            )
        )
        logger.info("✅ Done! Output: {}", output_path)
    except KeyboardInterrupt:
        logger.warning("Interrupted by user")
        sys.exit(130)
    except Exception as e:
        logger.error("Pipeline failed: {}", e)
        sys.exit(1)


def _read_file(path: str) -> str:
    """Read text from a file path."""
    text_path = Path(path)
    if not text_path.exists():
        logger.error("File not found: {}", text_path)
        sys.exit(1)
    return text_path.read_text(encoding="utf-8")


if __name__ == "__main__":
    main()
