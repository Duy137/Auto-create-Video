"""Quick smoke test for Phase 1: Director Agent + Schema changes."""

from app.nodes.agents.director import build_default_direction, validate_direction
from app.state import Scene


def test_default_fallback():
    """Test 1: Default fallback produces valid output."""
    splitter_output = {
        "title": "Test Video",
        "scenes": [
            {"scene_index": 0, "scene_type": "title_card", "purpose": "hook", "narration": "Intro"},
            {"scene_index": 1, "scene_type": "stock_background", "purpose": "explain", "narration": "Body"},
            {"scene_index": 2, "scene_type": "info_card", "purpose": "list_steps", "narration": "Steps"},
            {"scene_index": 3, "scene_type": "stats_highlight", "purpose": "data_visual", "narration": "Stats"},
        ],
    }

    fallback = build_default_direction(splitter_output)

    assert fallback["topic"] == "General"
    assert fallback["mood"] == "professional_modern"
    assert len(fallback["scene_directions"]) == 4
    assert fallback["color_palette"]["primary"] == "#FF6B35"

    # Check scene_type mapping from purpose
    assert fallback["scene_directions"][0]["scene_type"] == "title_card"
    assert fallback["scene_directions"][0]["layout"] == "center_focus"
    assert fallback["scene_directions"][1]["scene_type"] == "stock_background"
    assert fallback["scene_directions"][1]["layout"] == "media_overlay"
    assert fallback["scene_directions"][2]["scene_type"] == "info_card"
    assert fallback["scene_directions"][2]["layout"] == "vertical_stack"
    assert fallback["scene_directions"][3]["scene_type"] == "stats_highlight"
    assert fallback["scene_directions"][3]["layout"] == "vertical_stack"

    print("  PASS: Default fallback produces valid output")


def test_validate_broken_direction():
    """Test 2: Validate and fix broken Director output."""
    broken = {
        "topic": "AI",
        "mood": "professional_modern",
        "color_palette": {"primary": "#FF0000", "secondary": "#00FF00", "background": "#000000", "text": "#FFFFFF"},
        "scene_directions": [
            # WRONG: title_card can't use vertical_stack → should be corrected to center_focus
            {"scene_index": 0, "scene_type": "title_card", "transition": "fade", "layout": "vertical_stack"},
            {"scene_index": 1, "scene_type": "stock_background", "transition": "slide", "layout": "media_overlay"},
            # Missing scenes 2 and 3 → should be filled with defaults
        ],
    }

    validated = validate_direction(broken, 4)
    dirs = validated["scene_directions"]

    assert len(dirs) == 4, f"Expected 4 directions, got {len(dirs)}"
    # Scene 0: layout should be corrected
    assert dirs[0]["layout"] == "center_focus", f"Expected center_focus, got {dirs[0]['layout']}"
    # Scene 1: should be unchanged
    assert dirs[1]["layout"] == "media_overlay"
    # Scene 2: filled with default
    assert dirs[2]["scene_type"] == "stock_background"
    # Scene 3: filled with default
    assert dirs[3]["scene_type"] == "stock_background"

    print("  PASS: Validate corrects broken Director output")


def test_backward_compat():
    """Test 3: Old Scene model (without new fields) still works."""
    old_scene = Scene(
        scene_index=0,
        scene_type="title_card",
        narration="Old video scene",
        visual_description="test",
        start_ms=0,
        end_ms=3000,
    )

    assert old_scene.transition == "fade"
    assert old_scene.purpose is None
    assert old_scene.layout == "center_focus"

    # model_dump should include defaults
    d = old_scene.model_dump()
    assert d["transition"] == "fade"
    assert d["layout"] == "center_focus"

    print("  PASS: Backward compatibility OK")


def test_merge_phases():
    """Test 4: _merge_phases combines 3 outputs correctly."""
    from app.nodes.content_parser import _merge_phases

    splitter = {
        "title": "Test",
        "scenes": [
            {
                "scene_index": 0,
                "scene_type": "stock_background",
                "purpose": "explain",
                "narration": "Original narration text",
                "keywords_to_highlight": ["Original"],
                "english_phrases": [],
            }
        ],
    }
    direction = {
        "topic": "AI",
        "mood": "professional_modern",
        "color_palette": {"primary": "#3B82F6", "secondary": "#FF6B35", "background": "#0F172A", "text": "#FFFFFF"},
        "scene_directions": [
            {"scene_index": 0, "scene_type": "title_card", "transition": "slide", "layout": "center_focus"}
        ],
    }
    enrichment = {
        "scenes": [
            {
                "scene_index": 0,
                "visual_description": "AI Technology",
                "image_query": "AI neural network",
                "video_query": "technology abstract",
                "card_items": None,
                "stats": None,
                "diagram_spec": None,
            }
        ],
    }

    result = _merge_phases(splitter, direction, enrichment)

    # Title from Splitter
    assert result["title"] == "Test"
    # Color palette from Director
    assert result["color_palette"]["primary"] == "#3B82F6"
    # Scene type overridden by Director (stock_background → title_card)
    assert result["scenes"][0]["scene_type"] == "title_card"
    # Narration preserved from Splitter
    assert result["scenes"][0]["narration"] == "Original narration text"
    # Transition from Director
    assert result["scenes"][0]["transition"] == "slide"
    # Visual description from Enricher
    assert result["scenes"][0]["visual_description"] == "AI Technology"
    # Purpose from Splitter
    assert result["scenes"][0]["purpose"] == "explain"

    print("  PASS: _merge_phases combines 3 outputs correctly")


if __name__ == "__main__":
    print("Phase 1 Smoke Tests")
    print("=" * 40)
    test_default_fallback()
    test_validate_broken_direction()
    test_backward_compat()
    test_merge_phases()
    print("=" * 40)
    print("All tests passed!")
