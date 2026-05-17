"""Runnable demo for the palette package.

Usage:
    python -m app.pipeline.nodes.palette.demo

What it does:
1. Generates 3 sample videos with different (mood, category) inputs.
2. Prints the resulting global palette + per-scene variants as JSON.
3. Renders an HTML preview to ./palette_preview.html so you can eyeball.
"""

from __future__ import annotations

import json
from pathlib import Path

from .color_math import contrast_ratio
from .generator import generate_for_video


SAMPLES = [
    {
        "title": "AI Agents in Production",
        "mood": "professional_modern",
        "topic_category": "tech",
        "scene_purposes": ["hook", "explain", "list_steps", "data_visual", "conclude"],
    },
    {
        "title": "How to Save Your First $10k",
        "mood": "professional_modern",
        "topic_category": "finance",
        "scene_purposes": ["hook", "explain", "list_steps", "list_steps", "data_visual", "conclude"],
    },
    {
        "title": "5 Spots You Must Visit in Da Nang",
        "mood": "playful",
        "topic_category": "travel",
        "scene_purposes": ["hook", "list_steps", "list_steps", "list_steps", "list_steps", "list_steps", "conclude"],
    },
    {
        "title": "Climate Crisis: A Documentary",
        "mood": "dramatic",
        "topic_category": "documentary",
        "scene_purposes": ["hook", "explain", "data_visual", "compare", "conclude"],
    },
]


def render_preview_html(samples: list[dict]) -> str:
    """Build a self-contained HTML preview (no external assets)."""
    blocks = []
    for s in samples:
        gp, variants = generate_for_video(
            mood=s["mood"],
            topic_category=s["topic_category"],
            scene_purposes=s["scene_purposes"],
        )
        text_contrast = contrast_ratio(gp.text, gp.background)

        scene_cards = "\n".join(
            f'''
            <div class="scene" style="
              background:{v.background};
              color:{gp.text};
              border:1px solid {v.accent};
              opacity:{0.55 + 0.45 * v.intensity};
            ">
              <div class="role">{v.role}</div>
              <div class="dot" style="background:{v.accent}"></div>
              <div class="meta">
                <div>bg {v.background}</div>
                <div>accent {v.accent}</div>
                <div>intensity {v.intensity:.2f}</div>
              </div>
            </div>
            '''
            for v in variants
        )

        blocks.append(f'''
        <section class="video" style="background:{gp.background}; color:{gp.text};">
          <header>
            <h2>{s["title"]}</h2>
            <div class="tag">theme: <b>{gp.theme_name}</b> · mood: {gp.mood} · harmony: {gp.harmony}</div>
            <div class="tag">text/bg contrast: <b>{text_contrast:.2f}</b> (≥ 7 = AAA)</div>
          </header>
          <div class="swatches">
            <div class="sw" style="background:{gp.primary}">primary</div>
            <div class="sw" style="background:{gp.secondary}">secondary</div>
            <div class="sw" style="background:{gp.accent}">accent</div>
            <div class="sw" style="background:{gp.background}; border:1px solid {gp.text}">background</div>
            <div class="sw" style="background:{gp.text}; color:{gp.background}">text</div>
          </div>
          <div class="scenes">{scene_cards}</div>
        </section>
        ''')

    style = '''
    body { font: 14px/1.4 system-ui, sans-serif; background:#0a0a10; color:#fff; margin:0; padding:24px; }
    section.video { padding:20px; border-radius:14px; margin-bottom:20px; }
    section.video header h2 { margin:0 0 6px; font-size:20px; }
    .tag { font-size:12px; opacity:0.75; margin-bottom:4px; }
    .swatches { display:flex; gap:8px; margin:14px 0; flex-wrap:wrap; }
    .sw { padding:14px 18px; border-radius:8px; font-size:11px; min-width:90px; text-align:center; color:#fff;
          text-shadow: 0 1px 2px rgba(0,0,0,0.5); }
    .scenes { display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:10px; }
    .scene { padding:14px; border-radius:10px; position:relative; min-height:90px; }
    .role { font-weight:700; font-size:11px; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:6px; }
    .dot { width:18px; height:18px; border-radius:50%; position:absolute; top:10px; right:10px; }
    .meta { font-size:10px; opacity:0.85; line-height:1.5; }
    '''

    return f'''<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><title>Palette preview</title>
<style>{style}</style></head>
<body>
<h1>Palette generator preview</h1>
<p style="opacity:0.7">Approach C — curated themes + HSL-derived per-scene variants.</p>
{"".join(blocks)}
</body></html>'''


def main() -> None:
    print("=" * 70)
    print("PALETTE GENERATOR DEMO — Approach C (hybrid)")
    print("=" * 70)

    for s in SAMPLES:
        gp, variants = generate_for_video(
            mood=s["mood"],
            topic_category=s["topic_category"],
            scene_purposes=s["scene_purposes"],
        )
        text_contrast = contrast_ratio(gp.text, gp.background)
        primary_contrast = contrast_ratio(gp.primary, gp.background)

        print()
        print(f"▸ {s['title']}")
        print(f"  mood={s['mood']}  category={s['topic_category']}  → theme={gp.theme_name}")
        print(f"  global: primary={gp.primary}  secondary={gp.secondary}  accent={gp.accent}")
        print(f"          background={gp.background}  text={gp.text}")
        print(f"  contrast: text={text_contrast:.2f}  primary={primary_contrast:.2f}")
        print(f"  scenes ({len(variants)}):")
        for v in variants:
            print(
                f"    [{v.scene_index}] role={v.role:<12} bg={v.background} "
                f"accent={v.accent} intensity={v.intensity:.2f}"
            )

    # Render HTML preview into the same folder as this file
    out_path = Path(__file__).resolve().parent / "palette_preview.html"
    out_path.write_text(render_preview_html(SAMPLES), encoding="utf-8")
    print()
    print(f"✓ HTML preview: {out_path}")

    # Also print one full JSON example for piping into Remotion
    print()
    print("Sample JSON (first video) ready for Remotion props:")
    gp, variants = generate_for_video(
        mood=SAMPLES[0]["mood"],
        topic_category=SAMPLES[0]["topic_category"],
        scene_purposes=SAMPLES[0]["scene_purposes"],
    )
    payload = {
        "color_palette": {
            "primary": gp.primary,
            "secondary": gp.secondary,
            "background": gp.background,
            "text": gp.text,
        },
        "palette_meta": {
            "accent": gp.accent,
            "theme_name": gp.theme_name,
            "mood": gp.mood,
            "background_preset": gp.background_preset,
            "harmony": gp.harmony,
        },
        "scene_color_variants": [v.to_dict() for v in variants],
    }
    print(json.dumps(payload, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
