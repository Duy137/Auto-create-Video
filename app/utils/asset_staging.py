"""Asset staging helpers for Remotion render input preparation."""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from urllib.parse import unquote, urlparse

from loguru import logger

from app.pipeline.nodes.media.searcher import download_media
from app.pipeline.nodes.rendering.bgm import resolve_bgm_track_path
from config import OUTPUT_DIR, REMOTION_DIR


async def stage_assets_for_remotion(
	job_id: str,
	video_props_dict: dict,
	job_dir: Path,
) -> Path:
	"""Stage assets into remotion/out/bundle/public and return render-ready props path."""
	logger.info("━━━ Staging Assets for Remotion ━━━")
	# Assets go into the public dir passed to Remotion via
	# `--public-dir out/bundle/public`; staticFile("assets/...") resolves there.
	out_public_dir = Path(REMOTION_DIR) / "out" / "bundle" / "public"
	
	# Ensure base static files (sfx, fonts, etc.) from remotion/public are present in the staging dir
	original_public_dir = Path(REMOTION_DIR) / "public"
	if original_public_dir.exists():
		shutil.copytree(str(original_public_dir), str(out_public_dir), dirs_exist_ok=True)
		
	remotion_assets_dir = out_public_dir / "assets" / job_id
	remotion_assets_dir.mkdir(parents=True, exist_ok=True)

	# Stage audio
	props_dict = dict(video_props_dict)
	audio_url = props_dict.get("audio_url", "")
	audio_source = resolve_local_path(audio_url)
	if audio_source is None or not audio_source.exists():
		audio_source = job_dir / "audio" / "full.mp3"
	if not audio_source.exists():
		raise FileNotFoundError(
			f"Audio file not found at '{audio_url}' or fallback {audio_source}"
		)
	audio_dest = remotion_assets_dir / "full.mp3"
	shutil.copy2(str(audio_source), str(audio_dest))
	props_dict["audio_url"] = f"assets/{job_id}/full.mp3"

	# Stage optional BGM
	settings = props_dict.get("settings")
	if isinstance(settings, dict):
		bgm_url = settings.get("bgm_url")
		if isinstance(bgm_url, str) and bgm_url:
			bgm_source = resolve_local_path(bgm_url)
			if bgm_source and bgm_source.exists():
				bgm_suffix = bgm_source.suffix.lower() or ".mp3"
				bgm_dest = remotion_assets_dir / f"bgm{bgm_suffix}"
				shutil.copy2(str(bgm_source), str(bgm_dest))
				settings["bgm_url"] = f"assets/{job_id}/{bgm_dest.name}"

	# Stage optional custom background
	if isinstance(settings, dict):
		custom_bg_url = settings.get("custom_background_url")
		if isinstance(custom_bg_url, str) and custom_bg_url:
			bg_source = resolve_local_path(custom_bg_url)
			# If it's a relative Remotion asset path, resolve from REMOTION_DIR/public
			if bg_source is None and custom_bg_url.startswith("assets/"):
				bg_source = Path(REMOTION_DIR) / "out" / "bundle" / "public" / custom_bg_url
			
			if bg_source and bg_source.exists():
				bg_suffix = bg_source.suffix.lower() or ".jpg"
				bg_dest = remotion_assets_dir / f"custom_bg{bg_suffix}"
				# Only copy if source and dest are different files
				try:
					if bg_source.resolve() != bg_dest.resolve():
						shutil.copy2(str(bg_source), str(bg_dest))
						logger.info("  Staged custom background: {} → {}", bg_source, bg_dest)
					else:
						logger.info("  Custom background already in place: {}", bg_dest)
				except Exception as e:
					logger.warning("  Failed to stage custom background: {}", e)
					settings["custom_background_url"] = None
				else:
					# Verify file exists at destination before committing the URL
					if bg_dest.exists():
						settings["custom_background_url"] = f"assets/{job_id}/{bg_dest.name}"
					else:
						logger.warning("  Custom background dest missing after staging, clearing URL")
						settings["custom_background_url"] = None
			else:
				logger.warning("  Custom background source not found: {}, clearing URL", custom_bg_url)
				settings["custom_background_url"] = None

	# Stage scene media
	scenes = props_dict.get("scenes", [])
	for scene in scenes:
		media_url = scene.get("media_url")
		if not media_url:
			continue

		scene_idx = scene.get("scene_index", 0)

		if media_url.startswith("http://") or media_url.startswith("https://"):
			ext = ".mp4" if scene.get("media_type") == "video" else ".jpg"
			media_filename = f"scene_{scene_idx}{ext}"
			local_dest = remotion_assets_dir / media_filename
			logger.info(
				"  Staging scene {} remote media: {} -> {}",
				scene_idx,
				media_url[:80],
				local_dest,
			)

			download_ok = False
			for attempt in range(2):
				try:
					await download_media(media_url, str(local_dest), timeout=60)
					scene["media_url"] = f"assets/{job_id}/{media_filename}"
					logger.info(
						"  Scene {} media staged ({:.0f}KB)",
						scene_idx,
						local_dest.stat().st_size / 1024,
					)
					download_ok = True
					break
				except Exception as e:
					if attempt == 0:
						logger.warning(
							"  Download attempt 1 failed for scene {}: {}, retrying...",
							scene_idx,
							e,
						)
					else:
						logger.error(
							"  Download failed for scene {} after 2 attempts: {}",
							scene_idx,
							e,
						)
			if not download_ok:
				scene["media_url"] = None
		else:
			local_source = resolve_local_path(media_url)
			if local_source is None:
				media_filename = f"scene_{scene_idx}.mp4"
				local_source = job_dir / "media" / media_filename
				if not local_source.exists():
					media_filename = f"scene_{scene_idx}.jpg"
					local_source = job_dir / "media" / media_filename

			if local_source and local_source.exists():
				media_filename = f"scene_{scene_idx}{local_source.suffix}"
				shutil.copy2(
					str(local_source),
					str(remotion_assets_dir / media_filename),
				)
				scene["media_url"] = f"assets/{job_id}/{media_filename}"
			else:
				logger.warning(
					"  Media file not found for scene {}: {}",
					scene_idx,
					media_url,
				)
				scene["media_url"] = None

	logger.info("=== STAGED RENDER JSON ===")
	logger.info("  scene_types: {}", [s.get("scene_type") for s in props_dict.get("scenes", [])])
	logger.info("  media_urls:  {}", [str(s.get("media_url", "NONE"))[:60] for s in props_dict.get("scenes", [])])

	render_props_path = job_dir / "video_props_render.json"
	render_props_path.write_text(
		json.dumps(props_dict, indent=2, ensure_ascii=False),
		encoding="utf-8",
	)
	logger.info("  Staged assets to {}", remotion_assets_dir)

	return render_props_path


def resolve_local_path(url_or_path: str) -> Path | None:
	"""Resolve a media URL/path string to a local Path."""
	if not url_or_path:
		return None

	if url_or_path.startswith("file:///"):
		parsed = urlparse(url_or_path)
		local = Path(unquote(parsed.path))
		if len(local.parts) > 1 and len(local.parts[0]) == 1 and local.parts[0] == "/":
			local = Path(unquote(parsed.path[1:]))
		return local

	if url_or_path.startswith("http://") or url_or_path.startswith("https://"):
		return None

	if url_or_path.startswith("/api/outputs/"):
		relative_path = url_or_path[len("/api/outputs/"):]
		return Path(OUTPUT_DIR) / relative_path
	if url_or_path.startswith("api/outputs/"):
		relative_path = url_or_path[len("api/outputs/"):]
		return Path(OUTPUT_DIR) / relative_path

	# Handle signed URLs that leaked into DB (e.g. "/api/files/bgm/x.mp3?token=...")
	if url_or_path.startswith("/api/files/"):
		relative_path = url_or_path[len("/api/files/"):]
		if "?" in relative_path:
			relative_path = relative_path.split("?", 1)[0]
		return Path(OUTPUT_DIR) / relative_path

	# Relative paths rooted at OUTPUT_DIR (e.g. "bgm/1_abc123.mp3")
	if url_or_path.startswith("bgm/"):
		return Path(OUTPUT_DIR) / url_or_path

	# Handle library BGM URLs: /api/bgm/library/{track_id}/file
	if "/api/bgm/library/" in url_or_path:
		parts = url_or_path.split("/")
		# Find the part after 'library'
		try:
			lib_idx = parts.index("library")
			track_id = parts[lib_idx + 1]
			return resolve_bgm_track_path(track_id)
		except (ValueError, IndexError):
			pass

	path = Path(url_or_path)
	if path.is_absolute():
		return path

	return None
