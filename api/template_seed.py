"""System template presets and seeding helper."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.database import Template

SYSTEM_TEMPLATES: list[dict[str, Any]] = [
    {
        "slug": "short-news",
        "name": "Tin nhanh",
        "description": "Phong cách bản tin nhanh cho cập nhật hằng ngày.",
        "category": "news",
        "settings": {
            "aspect_ratio": "9:16",
            "tts_engine": "openai",
            "voice": "nova",
            "speech_rate": 1.06,
            "transition_mode": "crossfade",
            "bgm_mode": "none",
            "subtitle_enabled": True,
            "subtitle_font_size": 50,
            "subtitle_position": "bottom",
            "subtitle_highlight_color": "#FF6B35",
        },
        "example_script": "Tin nóng: tóm tắt sự kiện chính trong 3 cảnh ngắn.",
        "thumbnail_url": None,
    },
    {
        "slug": "product-promo",
        "name": "Quảng cáo sản phẩm",
        "description": "Giới thiệu tính năng, lợi ích và lời kêu gọi hành động.",
        "category": "marketing",
        "settings": {
            "aspect_ratio": "9:16",
            "tts_engine": "openai",
            "voice": "alloy",
            "speech_rate": 1.0,
            "transition_mode": "fade_to_black",
            "bgm_mode": "none",
            "subtitle_enabled": True,
            "subtitle_font_size": 46,
            "subtitle_position": "bottom",
            "subtitle_highlight_color": "#22C55E",
        },
        "example_script": "Nêu vấn đề khách hàng gặp phải, demo giải pháp và ưu đãi đặc biệt.",
        "thumbnail_url": None,
    },
    {
        "slug": "education-explainer",
        "name": "Bài giảng giáo dục",
        "description": "Định dạng giải thích có cấu trúc cho nội dung học tập.",
        "category": "education",
        "settings": {
            "aspect_ratio": "16:9",
            "tts_engine": "openai",
            "voice": "sage",
            "speech_rate": 0.95,
            "transition_mode": "crossfade",
            "bgm_mode": "none",
            "subtitle_enabled": True,
            "subtitle_font_size": 44,
            "subtitle_position": "bottom",
            "subtitle_highlight_color": "#3B82F6",
        },
        "example_script": "Dạy một khái niệm: định nghĩa, ví dụ và bài học thực tế.",
        "thumbnail_url": None,
    },
    {
        "slug": "story-mode",
        "name": "Kể chuyện",
        "description": "Nhịp kể chuyện dành cho hành trình và câu chuyện cá nhân.",
        "category": "storytelling",
        "settings": {
            "aspect_ratio": "9:16",
            "tts_engine": "openai",
            "voice": "shimmer",
            "speech_rate": 0.92,
            "transition_mode": "fade_to_black",
            "bgm_mode": "none",
            "subtitle_enabled": True,
            "subtitle_font_size": 48,
            "subtitle_position": "bottom",
            "subtitle_highlight_color": "#F97316",
        },
        "example_script": "Mở đầu bằng xung đột, dẫn đến bước ngoặt, kết bằng bài học.",
        "thumbnail_url": None,
    },
    {
        "slug": "comparison-review",
        "name": "So sánh đánh giá",
        "description": "Định dạng so sánh sản phẩm hoặc công cụ song song.",
        "category": "review",
        "settings": {
            "aspect_ratio": "1:1",
            "tts_engine": "openai",
            "voice": "echo",
            "speech_rate": 1.0,
            "transition_mode": "crossfade",
            "bgm_mode": "none",
            "subtitle_enabled": True,
            "subtitle_font_size": 42,
            "subtitle_position": "bottom",
            "subtitle_highlight_color": "#A855F7",
        },
        "example_script": "So sánh phương án A và B về giá, chất lượng và đưa ra khuyến nghị.",
        "thumbnail_url": None,
    },
]


async def seed_system_templates(db: AsyncSession) -> int:
    """Create or update built-in templates. Returns number of changed rows."""
    changed_rows = 0

    for payload in SYSTEM_TEMPLATES:
        result = await db.execute(select(Template).where(Template.slug == payload["slug"]))
        existing = result.scalar_one_or_none()

        if existing is None:
            db.add(
                Template(
                    slug=payload["slug"],
                    name=payload["name"],
                    description=payload["description"],
                    category=payload["category"],
                    settings=payload["settings"],
                    example_script=payload["example_script"],
                    thumbnail_url=payload["thumbnail_url"],
                    is_system=True,
                    is_active=True,
                )
            )
            changed_rows += 1
            continue

        fields_to_sync = {
            "name": payload["name"],
            "description": payload["description"],
            "category": payload["category"],
            "settings": payload["settings"],
            "example_script": payload["example_script"],
            "thumbnail_url": payload["thumbnail_url"],
            "is_system": True,
            "is_active": True,
        }
        updated = False
        for field_name, value in fields_to_sync.items():
            if getattr(existing, field_name) != value:
                setattr(existing, field_name, value)
                updated = True

        if updated:
            changed_rows += 1

    return changed_rows
