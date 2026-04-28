# AutoClip Upgrade Guide

Tai lieu nay tong hop roadmap nang cap chat luong video va UI/UX theo 6 phase.

## Muc tieu

- Video dep hon, motion muot hon, co nhan nhan manh o cac canh quan trong.
- Search media chat luong hon, query cinematic hon.
- UI demo de dung hon, ben vung hon, co timeout/backoff va retry.

## Tong quan phase

| Phase | Trong tam | Trang thai |
|:--|:--|:--|
| 1 | Caption + title animation | Done |
| 2 | Particle + background cinematic | Done |
| 3 | Scene animation polish + transition intelligence | Done |
| 4 | Component polish (progress, watermark, overlay) | Done |
| 5 | Prompt + media strategy | Done |
| 6 | Demo UI/UX | Done |

## Chi tiet theo phase

### Phase 1 - Caption va text animation

- Animated caption da co dynamic group theo do dai tu.
- Active word co spring bounce, glow pulse, va lift nhe theo truc Y.
- TitleCard da co per-word entrance, stagger ro rang hon.

File lien quan:
- remotion/src/components/AnimatedCaption.tsx
- remotion/src/scenes/TitleCard.tsx

### Phase 2 - Particle va background

- Floating particles da tang so luong, drift da truc, glow blur, pulse opacity.
- TitleCard gradient da co chuyen dong goc + color stop.
- StockBackground da co Ken Burns easing + rotate nhe.
- Center-focus gradient da animate theo frame.

File lien quan:
- remotion/src/components/FloatingParticles.tsx
- remotion/src/scenes/TitleCard.tsx
- remotion/src/scenes/StockBackground.tsx

### Phase 3 - Scene animation polish

- InfoCard va EmojiGrid da co alternate slide direction, rotate nhe, shadow grow.
- Icon trong card da co bounce trễ.
- StatsHighlight da co completion pulse, flash, underline grow.
- Transition da co zoom option va duration dong theo scene type.
- Transition none da la instant that su (khong chen bridge transition).

File lien quan:
- remotion/src/scenes/InfoCard.tsx
- remotion/src/scenes/EmojiGrid.tsx
- remotion/src/scenes/StatsHighlight.tsx
- remotion/src/lib/transitions.ts
- remotion/src/AutoClipVideo.tsx
- remotion/src/schemas/videoProps.ts

### Phase 4 - Component polish

- ProgressBar da co gradient va glow dot dau thanh.
- Watermark da co fade in/out va breathe pulse.
- Background overlay da doi sang palette tint thay vi den cung.

File lien quan:
- remotion/src/components/ProgressBar.tsx
- remotion/src/components/Watermark.tsx
- remotion/src/components/BackgroundVideo.tsx
- remotion/src/scenes/StockBackground.tsx

### Phase 5 - Prompt va media strategy

- Director prompt/schema da them transition zoom.
- Enricher prompt da them guideline query cinematic, portrait, tranh query qua generic.
- Media search da tang per_page, co retry query khi hit video thap.
- Orchestrator da uu tien video cho stock_background.
- Splitter schema da dong bo emoji_grid.

File lien quan:
- app/nodes/agents/director.py
- app/nodes/content_parser.py
- app/nodes/media_searcher.py
- app/orchestrator.py

### Phase 6 - Demo UI/UX

- Responsive breakpoints cho 768px va 480px.
- Toast thong bao thay alert.
- Polling co timeout, exponential backoff, retry.
- JSON editor co format/copy/reset + validate realtime.
- Progress percent + mini progress bar + log level color.
- Accessibility co aria label, aria-live, focus-visible.

File lien quan:
- api/static/demo/index.html
- api/static/demo/style.css
- api/static/demo/script.js

## Thu tu trien khai khuyen nghi

1. Motion core (Phase 1 + 2).
2. Scene polish + transition logic (Phase 3).
3. Component finishing (Phase 4).
4. Prompt va media strategy (Phase 5).
5. Demo UX va reliability (Phase 6).

## Cac buoc verify

### Remotion

1. Chay studio:

```bash
cd remotion
npx remotion studio
```

2. Preview tung scene type va kiem tra:
- Caption bounce va group transition.
- Card alternate direction.
- Stats pulse/flash/underline.
- ProgressBar gradient + glow.
- Watermark fade in/out.

### Pipeline

1. Kiem tra parser + media strategy:

```bash
python run_pipeline.py test_input.txt --skip-render
```

2. Kiem tra test nhanh:

```bash
pytest tests/test_media_searcher.py tests/test_phase1_director.py -q
```

### Web demo

1. Start API:

```bash
uvicorn api.main:app --reload --port 8000
```

2. Mo demo:

http://localhost:8000/demo/

3. Test mobile mode trong DevTools (375px va 768px):
- wizard khong vo layout
- toast hien/tu dong tat
- polling timeout/backoff/retry hoat dong

## Luu y

- Khong doi JSON contract dau vao Remotion.
- Khong them dependency lon moi cho frontend demo.
- Neu render cham, uu tien giam particle blur truoc.