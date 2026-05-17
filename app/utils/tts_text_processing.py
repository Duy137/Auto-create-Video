"""TTS text/timestamp processing helpers."""

from __future__ import annotations

from loguru import logger

from app.pipeline.nodes.audio.preprocessor import preprocess_for_tts
from app.state import WordTimestamp


def build_display_word_timestamps(
	deduped_narrations: list[str],
	timing_word_timestamps: list[WordTimestamp],
	processed_word_counts: list[int],
	engine_name: str,
) -> list[WordTimestamp]:
	"""Map processed alignment tokens back to display-friendly original text.

	Timing stays anchored to processed TTS tokens. For subtitle/display output,
	we greedily merge those processed tokens back into original scene segments
	whose preprocessed form matches the spoken audio.
	"""
	if not timing_word_timestamps or not processed_word_counts:
		return list(timing_word_timestamps)

	expected_count = sum(processed_word_counts)
	if expected_count != len(timing_word_timestamps):
		logger.warning(
			"Display timestamp remap skipped: expected {} processed words, got {} timestamps",
			expected_count,
			len(timing_word_timestamps),
		)
		return list(timing_word_timestamps)

	display_word_timestamps: list[WordTimestamp] = []
	ts_idx = 0
	for narration, scene_word_count in zip(deduped_narrations, processed_word_counts):
		slice_end = ts_idx + scene_word_count
		display_word_timestamps.extend(
			build_scene_display_word_timestamps(
				narration,
				timing_word_timestamps[ts_idx:slice_end],
				engine_name,
			)
		)
		ts_idx = slice_end

	return display_word_timestamps


def build_scene_display_word_timestamps(
	original_narration: str,
	processed_scene_timestamps: list[WordTimestamp],
	engine_name: str,
) -> list[WordTimestamp]:
	"""Merge processed tokens back into original-text subtitle tokens for one scene."""
	original_words = original_narration.split()
	if not original_words or not processed_scene_timestamps:
		return list(processed_scene_timestamps)

	processed_words = [wt.text for wt in processed_scene_timestamps]
	display_timestamps: list[WordTimestamp] = []
	original_idx = 0
	processed_idx = 0

	while original_idx < len(original_words) and processed_idx < len(processed_scene_timestamps):
		matched = False
		max_window = min(4, len(original_words) - original_idx)
		for original_window in range(1, max_window + 1):
			original_segment = " ".join(
				original_words[original_idx:original_idx + original_window]
			)
			processed_segment = preprocess_for_tts(
				original_segment,
				engine_name=engine_name,
			).split()
			if not processed_segment:
				continue

			processed_window = len(processed_segment)
			if processed_idx + processed_window > len(processed_scene_timestamps):
				continue

			if processed_segment != processed_words[processed_idx:processed_idx + processed_window]:
				continue

			display_timestamps.append(
				WordTimestamp(
					text=original_segment,
					start_ms=processed_scene_timestamps[processed_idx].start_ms,
					end_ms=processed_scene_timestamps[processed_idx + processed_window - 1].end_ms,
				)
			)
			original_idx += original_window
			processed_idx += processed_window
			matched = True
			break

		if matched:
			continue

		fallback = processed_scene_timestamps[processed_idx]
		fallback_text = (
			original_words[original_idx]
			if original_idx < len(original_words)
			else fallback.text
		)
		display_timestamps.append(
			WordTimestamp(
				text=fallback_text,
				start_ms=fallback.start_ms,
				end_ms=fallback.end_ms,
			)
		)
		original_idx += 1 if original_idx < len(original_words) else 0
		processed_idx += 1

	if processed_idx < len(processed_scene_timestamps):
		display_timestamps.extend(processed_scene_timestamps[processed_idx:])

	return display_timestamps
