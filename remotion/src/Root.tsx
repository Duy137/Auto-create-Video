// remotion/src/Root.tsx
/**
 * Remotion composition registry.
 * Registers "AutoClipVideo" with sample default props for preview in Studio.
 */

import "./index.css";
import { Composition } from "remotion";
import { AutoClipVideo, calculateTimelineDurationInFrames } from "./AutoClipVideo";
import type { VideoProps } from "./schemas/videoProps";
import { camelizeKeys } from "./lib/utils";

// ── Sample data for Remotion Studio preview ──

const sampleProps: VideoProps = {
  jobId: "preview-001",
  title: "Deploy Agent AI Trong Vài Ngày",
  colorPalette: {
    primary: "#FF6B35",
    secondary: "#7B68EE",
    background: "#0F172A",
    text: "#FFFFFF",
  },
  audioUrl: "",
  wordTimestamps: [
    { text: "Deploy", startMs: 0, endMs: 400 },
    { text: "Agent", startMs: 400, endMs: 800 },
    { text: "AI", startMs: 800, endMs: 1100 },
    { text: "Trong", startMs: 1100, endMs: 1400 },
    { text: "Vài", startMs: 1400, endMs: 1700 },
    { text: "Ngày.", startMs: 1700, endMs: 2200 },
    { text: "Claude", startMs: 3000, endMs: 3500 },
    { text: "Managed", startMs: 3500, endMs: 4000 },
    { text: "Agents", startMs: 4000, endMs: 4500 },
    { text: "cho", startMs: 4500, endMs: 4700 },
    { text: "phép", startMs: 4700, endMs: 5000 },
    { text: "chạy", startMs: 5000, endMs: 5300 },
    { text: "AI", startMs: 5300, endMs: 5500 },
    { text: "agent", startMs: 5500, endMs: 5900 },
    { text: "trên", startMs: 5900, endMs: 6200 },
    { text: "cloud.", startMs: 6200, endMs: 6800 },
    { text: "Quy", startMs: 7000, endMs: 7300 },
    { text: "trình", startMs: 7300, endMs: 7600 },
    { text: "gồm", startMs: 7600, endMs: 7900 },
    { text: "ba", startMs: 7900, endMs: 8100 },
    { text: "bước", startMs: 8100, endMs: 8400 },
    { text: "chính.", startMs: 8400, endMs: 8900 },
    { text: "Softmax", startMs: 9000, endMs: 9500 },
    { text: "chuyển", startMs: 9500, endMs: 9800 },
    { text: "điểm", startMs: 9800, endMs: 10200 },
    { text: "thành", startMs: 10200, endMs: 10500 },
    { text: "xác", startMs: 10500, endMs: 10800 },
    { text: "suất.", startMs: 10800, endMs: 11300 },
    { text: "So", startMs: 12000, endMs: 12300 },
    { text: "sánh", startMs: 12300, endMs: 12600 },
    { text: "hai", startMs: 12600, endMs: 12900 },
    { text: "giải", startMs: 12900, endMs: 13200 },
    { text: "pháp.", startMs: 13200, endMs: 13800 },
  ],
  scenes: [
    {
      sceneIndex: 0,
      sceneType: "title_card",
      narration: "Deploy Agent AI Trong Vài Ngày",
      visualDescription: "Title screen with tech network",
      startMs: 0,
      endMs: 3000,
      transition: "fade",
      purpose: "hook",
      layout: "center_focus",
      imageQuery: "AI neural network dark",
      videoQuery: "AI technology animation",
      mediaUrl: null,
      mediaType: null,
      keywordsToHighlight: ["Agent AI", "Deploy"],
      englishPhrases: ["Agent AI", "Deploy"],
    },
    {
      sceneIndex: 1,
      sceneType: "stock_background",
      narration: "Claude Managed Agents cho phép chạy AI agent trên cloud.",
      visualDescription: "Cloud computing illustration",
      startMs: 3000,
      endMs: 7000,
      transition: "slide",
      purpose: "explain",
      layout: "media_overlay",
      imageQuery: "cloud computing server dark",
      videoQuery: "cloud data center aerial",
      mediaUrl: null,
      mediaType: null,
      keywordsToHighlight: ["Claude", "Managed Agents", "cloud"],
      englishPhrases: ["Claude", "Managed Agents", "cloud"],
      emoji: "🚀",
    },
    {
      sceneIndex: 2,
      sceneType: "info_card",
      narration: "Quy trình gồm ba bước chính.",
      visualDescription: "Three-step process",
      startMs: 7000,
      endMs: 9000,
      transition: "wipe",
      purpose: "list_steps",
      layout: "vertical_stack",
      imageQuery: null,
      videoQuery: null,
      mediaUrl: null,
      mediaType: null,
      keywordsToHighlight: ["quy trình", "ba bước"],
      englishPhrases: [],
      cardItems: [
        { icon: "📝", title: "Input Text", subtitle: "Nhập văn bản tiếng Việt" },
        { icon: "🤖", title: "AI Process", subtitle: "LLM parse + TTS + Media" },
        { icon: "🎬", title: "Render", subtitle: "Remotion xuất video" },
      ],
      emoji: "💡",
    },
    {
      sceneIndex: 3,
      sceneType: "stats_highlight",
      narration: "Softmax chuyển điểm thành xác suất.",
      visualDescription: "Softmax probability values",
      startMs: 9000,
      endMs: 12000,
      transition: "fade",
      purpose: "data_visual",
      layout: "horizontal_grid",
      imageQuery: null,
      videoQuery: null,
      mediaUrl: null,
      mediaType: null,
      keywordsToHighlight: ["Softmax", "xác suất"],
      englishPhrases: ["Softmax"],
      stats: [
        { label: "thảm", value: "2.0", color: "#4CAF50" },
        { label: "ghế", value: "1.4", color: "#7B68EE" },
        { label: "bàn", value: "1.1", color: "#3B82F6" },
        { label: "đèn", value: "0.8", color: "#FF6B35" },
      ],
      emoji: "📊",
    },
    {
      sceneIndex: 4,
      sceneType: "info_card",
      narration: "So sánh hai giải pháp.",
      visualDescription: "Comparison of solutions",
      startMs: 12000,
      endMs: 15000,
      transition: "slide",
      purpose: "compare",
      layout: "horizontal_grid",
      imageQuery: null,
      videoQuery: null,
      mediaUrl: null,
      mediaType: null,
      keywordsToHighlight: ["so sánh", "giải pháp"],
      englishPhrases: [],
      cardItems: [
        { icon: "🐢", title: "Traditional", subtitle: "Thủ công, chậm, nhiều bước" },
        { icon: "🚀", title: "AutoClip", subtitle: "Tự động, nhanh, 1 lệnh" },
      ],
    },
    {
      sceneIndex: 5,
      sceneType: "diagram",
      narration: "Hàm softmax chuyển điểm thô thành xác suất.",
      visualDescription: "Softmax Formula",
      startMs: 15000,
      endMs: 19000,
      transition: "fade",
      purpose: "data_visual",
      layout: "center_focus",
      imageQuery: null,
      videoQuery: null,
      mediaUrl: null,
      mediaType: null,
      keywordsToHighlight: ["softmax", "xác suất"],
      englishPhrases: ["softmax"],
      diagramSpec: {
        type: "math_formula",
        latex: "\\sigma(z_i) = \\frac{e^{z_i}}{\\sum_{j=1}^{K} e^{z_j}}",
        annotations: ["0 ≤ σ(zᵢ) ≤ 1", "Tổng các xác suất = 1"],
      },
    },
    {
      sceneIndex: 6,
      sceneType: "diagram",
      narration: "Hàm e mũ x tăng rất nhanh khi x lớn.",
      visualDescription: "Exponential Growth",
      startMs: 19000,
      endMs: 23000,
      transition: "slide",
      purpose: "data_visual",
      layout: "center_focus",
      imageQuery: null,
      videoQuery: null,
      mediaUrl: null,
      mediaType: null,
      keywordsToHighlight: ["e mũ x", "tăng nhanh"],
      englishPhrases: [],
      diagramSpec: {
        type: "line_chart",
        xRange: [-2, 3],
        function: "e^x",
        data: [
          { x: -2, y: 0.14, label: undefined },
          { x: -1, y: 0.37, label: undefined },
          { x: 0, y: 1.0, label: "(0, 1)" },
          { x: 1, y: 2.72, label: undefined },
          { x: 2, y: 7.39, label: undefined },
          { x: 3, y: 20.09, label: undefined },
        ],
        latex: "f(x) = e^x",
        annotations: ["Luôn dương", "Tăng nhanh"],
      },
    },
    {
      sceneIndex: 7,
      sceneType: "emoji_grid",
      narration: "Bốn công cụ AI phổ biến nhất hiện nay.",
      visualDescription: "AI Tools Overview",
      startMs: 23000,
      endMs: 27000,
      transition: "slide",
      purpose: "list_steps",
      layout: "grid_2x2",
      imageQuery: null,
      videoQuery: null,
      mediaUrl: null,
      mediaType: null,
      keywordsToHighlight: ["AI", "công cụ"],
      englishPhrases: ["ChatGPT", "Midjourney", "GitHub Copilot", "Suno AI"],
      cardItems: [
        { icon: "🤖", title: "ChatGPT", subtitle: "Trò chuyện thông minh" },
        { icon: "🎨", title: "Midjourney", subtitle: "Tạo hình ảnh từ text" },
        { icon: "💻", title: "GitHub Copilot", subtitle: "Gợi ý code tự động" },
        { icon: "🎵", title: "Suno AI", subtitle: "Sáng tác nhạc AI" },
      ],
    },
  ],
  settings: {
    aspectRatio: "9:16",
    fps: 30,
    transitionMode: "crossfade",
    bgmUrl: null,
    bgmVolume: 0.2,
    watermarkText: "@autoclip",
    subtitle: {
      enabled: true,
      font: "NotoSansVN-Bold",
      fontSize: 48,
      fontColor: "#FFFFFF",
      highlightColor: "#FF6B35",
      strokeColor: "#000000",
      strokeWidth: 2,
      position: "bottom",
      preset: "default",
    },
    sfx: {
      enabled: true,
      volume: 0.25,
    },
    watermarkPosition: "top-right",
    watermarkOpacity: 0.5,
    watermarkLogoUrl: null,
    watermarkMode: "text",
    cta: {
      enabled: false,
      mediaUrl: null,
      mediaType: "video",
      durationMs: 3000,
    },
    backgroundPreset: "steel_blue",
    customBackgroundUrl: null,
    customBackgroundType: "image",
    customBackgroundDurationSec: null,
  },
};

// ── Fallback duration for Studio preview ──

const previewDuration = calculateTimelineDurationInFrames(
  sampleProps.scenes,
  sampleProps.settings.fps
);

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="AutoClipVideo"
        component={AutoClipVideo}
        // Dynamic duration: calculated from actual props when rendering via CLI
        calculateMetadata={({ props }) => {
          const p = props as {
            scenes?: unknown;
            settings?: { fps?: unknown };
          };
          // Support both camelCase and snake_case (Python pipeline outputs snake_case)
          const rawScenes = Array.isArray(p.scenes) ? p.scenes : [];
          if (!rawScenes.length) {
            return {
              durationInFrames: previewDuration,
              fps: 30,
              width: 1080,
              height: 1920,
            };
          }
          const fps = typeof p.settings?.fps === "number" ? p.settings.fps : 30;
          const scenes = camelizeKeys(rawScenes) as VideoProps["scenes"];
          const durationInFrames = calculateTimelineDurationInFrames(scenes, fps);

          // CTA duration — must be added to total or CTA gets clipped
          const camelSettings = camelizeKeys(p.settings ?? {}) as {
            cta?: { enabled?: boolean; mediaUrl?: string | null; durationMs?: number };
          };
          const ctaCfg = camelSettings.cta;
          const ctaDurationFrames =
            ctaCfg?.enabled && ctaCfg?.mediaUrl
              ? Math.round(((ctaCfg.durationMs ?? 3000) / 1000) * fps)
              : 0;
          const ctaTransitionFrames = ctaDurationFrames > 0 ? 15 : 0;

          return {
            durationInFrames: Math.max(
              durationInFrames + ctaDurationFrames + ctaTransitionFrames,
              30,
            ),
            fps,
            width: 1080,
            height: 1920,
          };
        }}
        fps={sampleProps.settings.fps}
        width={1080}
        height={1920}
        durationInFrames={previewDuration}
        defaultProps={sampleProps}
      />
    </>
  );
};
