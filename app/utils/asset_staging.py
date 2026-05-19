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


def _get_signed_url_for_path(path: Path) -> str:
	if not path or not path.exists():
		return ""
	from api.signed_url import generate_signed_url_token
	
	rel_path = None
	try:
		rel_path = path.resolve().relative_to(Path(OUTPUT_DIR).resolve()).as_posix()
	except ValueError:
		try:
			rel_path = path.resolve().relative_to((Path(REMOTION_DIR) / "public").resolve()).as_posix()
		except ValueError:
			pass
			
	if rel_path:
		token = generate_signed_url_token(rel_path)
		return f"/api/files/{rel_path}?token={token}"
	
	return path.as_uri()


async def stage_assets_for_remotion(
	job_id: str,
	video_props_dict: dict,
	job_dir: Path,
) -> Path:
	"""Stage assets into remotion/out/bundle/public and return render-ready props path."""
	logger.info("━━━ Staging Assets for Remotion ━━━")
	out_public_dir = Path(REMOTION_DIR) / "out" / "bundle" / "public"
	
	original_public_dir = Path(REMOTION_DIR) / "public"
	if original_public_dir.exists():
		shutil.copytree(str(original_public_dir), str(out_public_dir), dirs_exist_ok=True, ignore=shutil.ignore_patterns("assets"))
		
	remotion_assets_dir = job_dir / "media"
	remotion_assets_dir.mkdir(parents=True, exist_ok=True)

	props_dict = dict(video_props_dict)

	# Stage audio
	audio_url = props_dict.get("audio_url", "")
	audio_source = resolve_local_path(audio_url)
	if audio_source is None or not audio_source.exists():
		audio_source = job_dir / "audio" / "full.mp3"
	if not audio_source.exists():
		raise FileNotFoundError(f"Audio file not found at '{audio_url}' or fallback {audio_source}")
	props_dict["audio_url"] = _get_signed_url_for_path(audio_source)

	# Stage optional BGM
	settings = props_dict.get("settings")
	if isinstance(settings, dict):
		bgm_url = settings.get("bgm_url")
		if isinstance(bgm_url, str) and bgm_url:
			bgm_source = resolve_local_path(bgm_url)
			if bgm_source and bgm_source.exists():
				settings["bgm_url"] = _get_signed_url_for_path(bgm_source)

	# Stage optional custom background
	if isinstance(settings, dict):
		custom_bg_url = settings.get("custom_background_url")
		if isinstance(custom_bg_url, str) and custom_bg_url:
			bg_source = resolve_local_path(custom_bg_url)
			if bg_source is None and custom_bg_url.startswith("assets/"):
				bg_source = Path(REMOTION_DIR) / "public" / custom_bg_url
			
			if bg_source and bg_source.exists():
				settings["custom_background_url"] = _get_signed_url_for_path(bg_source)
			else:
				settings["custom_background_url"] = None
                
		cta_media_url = settings.get("cta", {}).get("mediaUrl")
		if isinstance(cta_media_url, str) and cta_media_url:
			cta_source = resolve_local_path(cta_media_url)
			if cta_source and cta_source.exists():
				settings["cta"]["mediaUrl"] = _get_signed_url_for_path(cta_source)

		watermark_logo_url = settings.get("watermark_logo_url")
		if isinstance(watermark_logo_url, str) and watermark_logo_url:
			logo_source = resolve_local_path(watermark_logo_url)
			if logo_source and logo_source.exists():
				settings["watermark_logo_url"] = _get_signed_url_for_path(logo_source)


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
					scene["media_url"] = _get_signed_url_for_path(local_dest)
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
				scene["media_url"] = _get_signed_url_for_path(local_source)
			else:
				logger.warning(
					"  Media file not found for scene {}: {}",
					scene_idx,
					media_url,
				)
				scene["media_url"] = None

	# Update Settings with signed URLs
	settings = props_dict.get("settings", {})
	
	def _resolve_setting_path(url_val: str | None) -> str | None:
		if not url_val:
			return url_val
		if url_val.startswith("http://") or url_val.startswith("https://") or url_val.startswith("/api/files/"):
			return url_val
			
		local_path = resolve_local_path(url_val)
		if local_path and local_path.exists():
			return _get_signed_url_for_path(local_path)
			
		possible_path = Path(OUTPUT_DIR) / url_val
		if possible_path.exists():
			return _get_signed_url_for_path(possible_path)
			
		return url_val

	for key in ["bgm_url", "watermark_logo_url", "custom_background_url"]:
		if settings.get(key):
			settings[key] = _resolve_setting_path(settings[key])
			
	if settings.get("cta") and settings["cta"].get("media_url"):
		settings["cta"]["media_url"] = _resolve_setting_path(settings["cta"]["media_url"])

	logger.info("=== STAGED RENDER JSON ===")
	logger.info("  scene_types: {}", [s.get("scene_type") for s in props_dict.get("scenes", [])])
	logger.info("  media_urls:  {}", [str(s.get("media_url", "NONE"))[:60] for s in props_dict.get("scenes", [])])

	render_props_path = job_dir / "video_props_render.json"
	render_props_path.write_text(
		json.dumps(props_dict, indent=2, ensure_ascii=False),
		encoding="utf-8",
	)
	logger.info("  Staged assets, props saved to {}", render_props_path)

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

	if url_or_path.startswith("/api/files/"):
		relative_path = url_or_path[len("/api/files/"):]
		if "?" in relative_path:
			relative_path = relative_path.split("?", 1)[0]
		return Path(OUTPUT_DIR) / relative_path

	if url_or_path.startswith("bgm/"):
		return Path(OUTPUT_DIR) / url_or_path

	if url_or_path.startswith("assets/") or url_or_path.startswith("media/") or (len(url_or_path.split("/")) > 1 and url_or_path.split("/")[1] in ["assets", "media"]):
		return Path(OUTPUT_DIR) / url_or_path

	if "/api/bgm/library/" in url_or_path:
		parts = url_or_path.split("/")
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
