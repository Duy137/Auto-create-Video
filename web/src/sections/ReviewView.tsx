import { memo, useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { api } from '@/api/client'
import { toast } from "sonner"
import { showErrorToast } from '@/components/SystemErrorReport'
import {
  ArrowLeft, Clapperboard, Edit3, RefreshCw,
  Image as ImageIcon, Film, Play, Pause, LoaderCircle,
  Settings2, ListVideo, Palette, Upload, GripVertical,
  AlertTriangle, CheckCircle2,
  Copy, Trash2, Plus, RotateCcw, RotateCw
} from 'lucide-react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const TRANSITION_OPTIONS = ['fade', 'slide', 'wipe', 'zoom', 'flip', 'clock-wipe', 'iris', 'none']

/** Deep equality check */
function deepEqual(a: any, b: any): boolean {
  if (a === b) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  return keysA.every(key => deepEqual(a[key], b[key]))
}

const TRANSITION_LABELS: Record<string, string> = {
  fade: 'Mờ dần',
  slide: 'Trượt',
  wipe: 'Lau',
  zoom: 'Phóng to',
  flip: 'Lật',
  'clock-wipe': 'Đồng hồ',
  iris: 'Mống mắt',
  none: 'Không',
}

// Only these scene types use external stock media (Pexels).
// Other types render gradient/animated backgrounds — no media needed.
const NEEDS_MEDIA = new Set(['stock_background', 'media_showcase', 'title_card', 'cryptovn101_news'])

const SCENE_TYPE_LABELS: Record<string, string> = {
  title_card: 'Thẻ tiêu đề',
  stock_background: 'Video nền',
  info_card: 'Thẻ thông tin',
  stats_highlight: 'Số liệu',
  diagram: 'Sơ đồ',
  emoji_grid: 'Lưới biểu tượng',
  comparison: 'So sánh',
  media_showcase: 'Trình chiếu phương tiện',
  timeline: 'Dòng thời gian',
  story_beats: 'Cảnh emoji động',
  cryptovn101_news: 'Bản tin (CryptoVN101)',
}

const AUDIT_SIGNAL_LABELS: Record<string, string> = {
  vlm_fallback: 'AI rerank không khả dụng',
  low_confidence: 'Độ tự tin AI thấp',
  no_selection: 'Không tìm được phương tiện',
  aspect_mismatch: 'Tỉ lệ ảnh/video không phù hợp',
  duration_too_short: 'Video quá ngắn so với lời thoại',
  keyword_no_overlap: 'Từ khoá không khớp',
}

function translateAuditSignal(signal: string): string {
  return AUDIT_SIGNAL_LABELS[signal] || signal
}

const MIN_SCENE_MS = 500
const LONG_NARRATION_WARNING_MS = 30_000
const LOW_RES_MIN_EDGE_PX = 720

interface ComparisonSide {
  label: string
  points: string[]
  sentiment?: string
}

interface TimelineEvent {
  label: string
  title: string
  description?: string
}

interface Scene {
  scene_type?: string | null
  narration: string
  visual_description?: string | null
  start_ms: number
  end_ms: number
  media_url?: string | null
  media_type?: string | null
  poster_url?: string | null
  _preview_url?: string | null
  transition?: string | null
  image_query?: string | null
  video_query?: string | null
  card_items?: Array<{ icon: string; title: string; subtitle: string }> | null
  stats?: Array<{ label: string; value: string; color: string }> | null
  diagram_spec?: Record<string, any> | null
  comparison_sides?: ComparisonSide[] | null
  timeline_events?: TimelineEvent[] | null
  /** Story Beats fallback (Concept D) — populated when scene_type === "story_beats" */
  story_beats?: Array<{ text: string; emoji: string; start_ms: number; end_ms: number }> | null
  /** Optional VLM audit metadata attached by backend rerank step */
  audit?: {
    passed?: boolean
    signals?: string[]
    confidence?: number
    min_confidence?: number
    suggested_fallback?: string | null
    rule_details?: Record<string, any> | null
  } | null
  media_layout?: 'cinema' | 'fullscreen' | 'fit' | null
  /** Sub-layout for scenes (stock_background, title_card) */
  layout?: 'center_focus' | 'media_overlay' | 'vertical_stack' | 'horizontal_grid' | 'grid_2x2' | 'news_intro' | 'educational' | 'tutorial' | 'commercial' | null
  /** Keywords highlighted in narration (matches Remotion render) */
  keywords_to_highlight?: string[] | null
  /** Optional media metadata used by review-only warnings */
  media_width?: number | null
  media_height?: number | null
  _media_width?: number | null
  _media_height?: number | null
}

interface WarningSceneItem {
  sceneIndex: number
  reasons: string[]
}

interface VideoProps {
  scenes: Scene[]
  color_palette?: Record<string, string>
  audio_url?: string | null
}

interface ReviewViewProps {
  jobId: string
  videoProps: VideoProps
  selectedSceneIndex: number
  onSelectScene: (index: number) => void
  onRenderStart: () => void
  onBackToSetup: () => void
  onPropsUpdate: (props: VideoProps) => void
}

/** Get browser-accessible URL for scene media preview */
function getPreviewUrl(scene: Scene): string | null {
  const url = scene.media_url
  if (!url) return null
  if (url.startsWith('http') || url.startsWith('/api/')) return url
  // Relative asset path (e.g. "assets/jobid/scene_1.mp4") → serve via API
  if (url.startsWith('assets/')) return `/api/demo/${url}`
  // Local absolute path (e.g. "D:\...\output\jobid\media\scene.mp4") → serve via API
  const normalized = url.replace(/\\/g, '/')
  const outputIdx = normalized.indexOf('output/')
  if (outputIdx >= 0) {
    const relPath = normalized.substring(outputIdx + 'output/'.length)
    return `/api/outputs/${relPath}`
  }
  // Fallback: check _preview_url
  return scene._preview_url || null
}

/** Prefer backend-provided poster for video thumbnails to avoid decoding many videos in sidebar. */
function getScenePosterUrl(scene: Scene): string | null {
  if (scene.media_type !== 'video') return null
  if (scene.poster_url) return scene.poster_url
  return null
}

/** Remotion StockBackground only supports center_focus or media_overlay. */
function getStockBackgroundLayout(scene?: Scene): 'center_focus' | 'media_overlay' {
  return scene?.layout === 'center_focus' ? 'center_focus' : 'media_overlay'
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function getSceneDurationMs(scene?: Scene): number {
  if (!scene) return MIN_SCENE_MS
  return Math.max(MIN_SCENE_MS, (scene.end_ms || 0) - (scene.start_ms || 0))
}

function toPositiveNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return null
}

function getSceneMediaDimensions(scene?: Scene): { width: number; height: number } | null {
  if (!scene) return null
  const raw = scene as any
  const width = toPositiveNumber(raw._media_width ?? raw.media_width ?? raw.width)
  const height = toPositiveNumber(raw._media_height ?? raw.media_height ?? raw.height)
  if (!width || !height) return null
  return { width, height }
}

async function readFileMediaDimensions(file: File): Promise<{ width: number; height: number } | null> {
  const objectUrl = URL.createObjectURL(file)
  try {
    if (file.type.startsWith('image/')) {
      return await new Promise((resolve) => {
        const img = new Image()
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
        img.onerror = () => resolve(null)
        img.src = objectUrl
      })
    }

    if (file.type.startsWith('video/')) {
      return await new Promise((resolve) => {
        const video = document.createElement('video')
        video.preload = 'metadata'
        video.onloadedmetadata = () => resolve({ width: video.videoWidth, height: video.videoHeight })
        video.onerror = () => resolve(null)
        video.src = objectUrl
      })
    }

    return null
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function getTotalDurationMs(scenes: Scene[]): number {
  if (!scenes.length) return 0
  return Math.max(...scenes.map((s) => s.end_ms || 0))
}

function getSceneIndexAtMs(scenes: Scene[], currentMs: number): number {
  if (!scenes.length) return 0
  const found = scenes.findIndex((scene) => currentMs >= scene.start_ms && currentMs < scene.end_ms)
  if (found >= 0) return found
  if (currentMs >= scenes[scenes.length - 1].end_ms) return scenes.length - 1
  return 0
}

function formatMs(ms: number): string {
  const safe = Math.max(0, Math.floor(ms))
  const totalSec = Math.floor(safe / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  const msec = safe % 1000
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(Math.floor(msec / 100)).padStart(1, '0')}`
}

function normalizeScenesByDuration(scenes: Scene[]): Scene[] {
  let cursor = 0
  return scenes.map((scene) => {
    const duration = getSceneDurationMs(scene)
    const normalized: Scene = {
      ...scene,
      start_ms: cursor,
      end_ms: cursor + duration,
    }
    cursor += duration
    return normalized
  })
}

function resolveAudioPreviewUrl(rawAudioUrl: string | null | undefined, jobId: string): string | null {
  if (!rawAudioUrl || typeof rawAudioUrl !== 'string') return null
  if (rawAudioUrl.startsWith('http://') || rawAudioUrl.startsWith('https://') || rawAudioUrl.startsWith('/api/')) {
    return rawAudioUrl
  }

  if (rawAudioUrl.startsWith('assets/')) {
    return `/api/demo/${rawAudioUrl}`
  }

  const filePath = rawAudioUrl.replace(/^file:\/\//, '').replace(/\\/g, '/')
  const outputToken = `/output/${jobId}/`
  const outputIndex = filePath.lastIndexOf(outputToken)
  if (outputIndex >= 0) {
    const relative = filePath.slice(outputIndex + outputToken.length)
    return `/api/outputs/${jobId}/${relative}`
  }

  if (filePath.startsWith(`output/${jobId}/`)) {
    return `/api/outputs/${filePath.slice('output/'.length)}`
  }

  if (filePath.includes(`/audio/`) || filePath.endsWith('/full.mp3')) {
    return `/api/outputs/${jobId}/audio/full.mp3`
  }

  return null
}

/**
 * Renders narration with per-word keyword highlighting.
 * Mirrors the Remotion <NarrationText> behavior in StockBackground.tsx:
 * keywords get primary color + glow, others get text color + soft shadow.
 */
function NarrationHighlighted({
  text, keywords, primary, textColor, fontSize,
}: {
  text: string
  keywords: string[]
  primary: string
  textColor: string
  fontSize: number
}) {
  if (!text) return null
  const keywordSet = new Set((keywords || []).map(k => k.toLowerCase()))
  const words = text.split(/\s+/).filter(Boolean)
  return (
    <div
      className="text-center font-bold leading-snug max-w-[92%] mx-auto"
      style={{ fontSize: `${fontSize}px`, color: textColor }}
    >
      {words.map((word, i) => {
        const cleaned = word.toLowerCase().replace(/[.,!?;:"'()]/g, '')
        const isKeyword = keywordSet.has(cleaned)
        return (
          <span
            key={i}
            style={{
              color: isKeyword ? primary : textColor,
              fontWeight: isKeyword ? 900 : 700,
              textShadow: isKeyword
                ? `0 0 12px ${primary}99, 0 0 24px ${primary}55, 0 2px 6px rgba(0,0,0,0.6)`
                : '0 2px 6px rgba(0,0,0,0.55)',
              marginRight: '0.28em',
              display: 'inline-block',
            }}
          >
            {word}
          </span>
        )
      })}
    </div>
  )
}

/**
 * Watermark overlay matching Remotion <Watermark> positioning + mode.
 * Sized down proportionally for the 9:16 preview frame.
 */
function WatermarkPreview({
  settings, primary,
}: {
  settings: any
  primary: string
}) {
  if (!settings) return null
  const mode = settings.watermark_mode || 'text'
  const text = settings.watermark_text
  const logo = settings.watermark_logo_url
  const position = settings.watermark_position || 'bottom-right'
  const opacity = settings.watermark_opacity ?? 0.5

  const showLogo = (mode === 'logo' || mode === 'both') && !!logo
  const showText = (mode === 'text' || mode === 'both') && !!text
  if (!showLogo && !showText) return null

  const positionStyle: React.CSSProperties = (() => {
    switch (position) {
      case 'top-left': return { top: 12, left: 12 }
      case 'top-right': return { top: 12, right: 12 }
      case 'bottom-left': return { bottom: 32, left: 12 }
      case 'center': return { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }
      case 'bottom-right':
      default: return { bottom: 32, right: 12 }
    }
  })()

  return (
    <div
      className="absolute z-50 flex flex-col items-center pointer-events-none"
      style={{ ...positionStyle, opacity }}
    >
      {showLogo && (
        <img
          src={logo.startsWith('/api/') ? logo : `/api/demo/${logo}`}
          alt=""
          className="object-contain"
          style={{ width: 36, height: 36, marginBottom: showText ? 2 : 0 }}
        />
      )}
      {showText && (
        <span
          className="font-bold uppercase"
          style={{
            fontSize: 9,
            letterSpacing: 2,
            color: primary,
            opacity: 0.85,
            textShadow: '0 1px 4px rgba(0,0,0,0.7)',
          }}
        >
          {text}
        </span>
      )}
    </div>
  )
}

/** Thin progress bar at frame bottom — matches Remotion <ProgressBar>. */
function ProgressBarPreview({
  primary, secondary, progress = 0.4,
}: { primary: string; secondary?: string; progress?: number }) {
  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-40"
      style={{ height: 2, backgroundColor: 'rgba(255,255,255,0.08)' }}
    >
      <div
        style={{
          width: `${progress * 100}%`,
          height: '100%',
          background: `linear-gradient(90deg, ${primary}, ${secondary || primary})`,
        }}
      />
    </div>
  )
}

/**
 * Render-accurate preview of stock_background media_overlay layout:
 * blurred media (8px) + dark overlay (55%) + visual description badge.
 * If media is missing, fallback gradient matches BackgroundVideo behavior.
 * + centered narration with keyword highlighting.
 */
function StockBackgroundWithMedia({
  scene, palette, mediaUrl, mediaType, playing, onLoad, onError,
}: {
  scene: Scene
  palette: Record<string, string>
  mediaUrl?: string | null
  mediaType?: string | null
  playing: boolean
  onLoad: () => void
  onError: () => void
}) {
  const primary = palette.primary || '#6366f1'
  const secondary = palette.secondary || primary
  const bg = palette.background || '#0a0a0a'
  const text = palette.text || '#ffffff'
  const fontSize = scene.narration.length > 200 ? 15 : scene.narration.length > 120 ? 18 : 22

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Layer 1: blurred media (mimics blur 8px + scale 1.1 from BackgroundVideo) */}
      <div className="absolute inset-0 overflow-hidden">
        {mediaUrl ? (
          mediaType === 'video' ? (
            <video
              key={mediaUrl}
              src={mediaUrl}
              autoPlay={playing}
              muted
              loop={playing}
              className="w-full h-full object-cover"
              style={{ filter: 'blur(8px)', transform: 'scale(1.15)' }}
              onLoadedData={onLoad}
              onError={onError}
            />
          ) : (
            <img
              key={mediaUrl}
              src={mediaUrl}
              alt=""
              className="w-full h-full object-cover"
              style={{ filter: 'blur(8px)', transform: 'scale(1.15)' }}
              onLoad={onLoad}
              onError={onError}
              referrerPolicy="no-referrer"
            />
          )
        ) : (
          <div
            className="w-full h-full"
            style={{ background: `linear-gradient(135deg, ${bg} 0%, ${secondary}33 100%)` }}
          />
        )}
      </div>
      {/* Layer 2: dark overlay 55% (matches BackgroundVideo overlayOpacity) */}
      <div className="absolute inset-0" style={{ backgroundColor: bg, opacity: 0.55 }} />

      {/* Layer 3: content — vertical center, with visual description badge */}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-6">
        {scene.visual_description && (
          <div
            className="mb-3 px-3 py-1 rounded-full font-medium"
            style={{
              fontSize: 10,
              letterSpacing: 2,
              backgroundColor: `${primary}22`,
              border: `1px solid ${primary}44`,
              color: primary,
            }}
          >
            {scene.visual_description.slice(0, 40)}
          </div>
        )}
        <NarrationHighlighted
          text={scene.narration}
          keywords={scene.keywords_to_highlight || []}
          primary={primary}
          textColor={text}
          fontSize={fontSize}
        />
      </div>
    </div>
  )
}

/** "Chưa có media" empty state for scene types that need stock media. */
function EmptyMediaPlaceholder() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-4 bg-muted/20">
      <ImageIcon className="w-12 h-12 opacity-20" />
      <span className="text-sm font-medium opacity-60">Chưa có phương tiện</span>
      <span className="text-xs opacity-70">Tìm trên Pexels hoặc tải lên từ máy tính</span>
    </div>
  )
}

/**
 * Top-level scene preview dispatcher — renders the right preview based on
 * scene_type and media availability, layered with watermark + progress bar
 * to match the actual rendered output as closely as possible.
 */
function ScenePreview({
  scene, palette, settings, mediaUrl, mediaError, progress, playing, onMediaLoad, onMediaError, onRetry, onReSearch
}: {
  scene: Scene | undefined
  palette: Record<string, string>
  settings: any
  mediaUrl: string | null
  mediaLoading: boolean
  mediaError: boolean
  progress: number
  playing: boolean
  onMediaLoad: () => void
  onMediaError: () => void
  onRetry?: () => void
  onReSearch?: () => void
}) {
  if (!scene) return null
  const sceneType = scene.scene_type || ''
  const stockLayout = getStockBackgroundLayout(scene)
  const primary = palette.primary || '#6366f1'
  const secondary = palette.secondary

  // Special case: media_showcase has unique layout-driven rendering — kept inline below.
  // We never reach here for media_showcase; ReviewView handles it directly.

  let body: React.ReactNode
  if (mediaError) {
    body = (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/60 backdrop-blur-sm z-50 gap-3">
        <AlertTriangle className="w-8 h-8 text-destructive/80" />
        <span className="text-sm font-medium text-muted-foreground">Phương tiện không tải được</span>
        <div className="flex gap-2 mt-2">
          {onRetry && (
            <Button size="sm" variant="outline" className="bg-background/50 h-8 hover:bg-background/80" onClick={(e) => { e.stopPropagation(); onRetry(); }}>
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Thử lại
            </Button>
          )}
          {onReSearch && (
            <Button size="sm" className="h-8 shadow-lg hover:scale-105 transition-transform" onClick={(e) => { e.stopPropagation(); onReSearch(); }}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Tìm Media khác
            </Button>
          )}
        </div>
      </div>
    )
  } else if (sceneType === 'stock_background' && stockLayout === 'media_overlay') {
    body = (
      <StockBackgroundWithMedia
        scene={scene}
        palette={palette}
        mediaUrl={mediaUrl}
        mediaType={scene.media_type}
        playing={playing}
        onLoad={onMediaLoad}
        onError={onMediaError}
      />
    )
  } else if (sceneType === 'title_card') {
    // Title card: media is optional — always render the layout mockup.
    // The mockup itself handles media background + overlay when media_url is present.
    body = (
      <div className="absolute inset-0">
        <ScenePreviewMockup scene={scene} palette={palette} hasCustomBg={!!settings?.custom_background_url} mediaUrl={mediaUrl} settings={settings} />
      </div>
    )
  } else if (NEEDS_MEDIA.has(sceneType) && !mediaUrl) {
    body = <EmptyMediaPlaceholder />
  } else {
    // For non-media types and stock_background with center_focus layout,
    // ScenePreviewMockup renders the gradient + structural mockup.
    body = (
      <div className="absolute inset-0">
        <ScenePreviewMockup scene={scene} palette={palette} hasCustomBg={!!settings?.custom_background_url} mediaUrl={mediaUrl} settings={settings} />
      </div>
    )
  }

  return (
    <>
      {body}
      {/* Global overlays — present in real render */}
      <WatermarkPreview settings={settings} primary={primary} />
      <ProgressBarPreview primary={primary} secondary={secondary} progress={progress} />
    </>
  )
}

/** Visual mockup preview for non-stock scene types */
function ScenePreviewMockup({ scene, palette, hasCustomBg = false, mediaUrl, settings }: { scene: Scene; palette: Record<string, string>; hasCustomBg?: boolean; mediaUrl?: string | null; settings?: any }) {
  const bgPresetId = settings?.background_preset || 'steel_blue'
  const GRADIENT_PRESETS: Record<string, string> = {
    deep_ocean: "radial-gradient(ellipse at 20% 80%, #1a3d6b 0%, #0e1e32 40%, #080e1a 100%)",
    midnight_ember: "radial-gradient(ellipse at 80% 20%, #4a1818 0%, #1e1020 50%, #0e0810 100%)",
    aurora_borealis: "radial-gradient(ellipse at 50% 0%, #145030 0%, #0e2838 40%, #081420 100%)",
    cosmic_purple: "radial-gradient(ellipse at 30% 70%, #301a55 0%, #181035 50%, #0c0818 100%)",
    golden_dusk: "radial-gradient(ellipse at 70% 30%, #3d3012 0%, #201a0a 40%, #12100a 100%)",
    cyber_teal: "radial-gradient(ellipse at 40% 60%, #124040 0%, #0e2530 50%, #081418 100%)",
    rose_noir: "radial-gradient(ellipse at 60% 80%, #401530 0%, #201018 50%, #100a10 100%)",
    forest_depth: "radial-gradient(ellipse at 50% 50%, #164018 0%, #0e2410 50%, #081408 100%)",
    steel_blue: "radial-gradient(ellipse at 30% 30%, #1a3355 0%, #102035 50%, #081018 100%)",
    warm_slate: "radial-gradient(ellipse at 60% 40%, #302a22 0%, #1c1814 50%, #12100e 100%)",
    electric_indigo: "radial-gradient(ellipse at 20% 50%, #251660 0%, #141035 50%, #0c0818 100%)",
    obsidian: "radial-gradient(ellipse at 50% 50%, #282828 0%, #181818 50%, #0c0c0c 100%)",
  };
  const presetGradient = GRADIENT_PRESETS[bgPresetId] || GRADIENT_PRESETS.steel_blue;

  // Scene content uses transparent background so the preset gradient
  // (rendered by the wrapper div at line 1112) shows through — matching
  // how Remotion renders scenes over AnimatedBackground (Layer 0).
  const bg = 'transparent'
  const primary = palette?.primary || '#6366f1'
  const text = palette?.text || '#ffffff'
  const secondary = palette?.secondary || primary
  const hasMedia = !!mediaUrl

  const renderContent = () => {
    switch (scene.scene_type) {
      case 'stock_background': {
        // center_focus layout: gradient background only (no media), narration centered.
        // Mirrors StockBackground.tsx center_focus branch.
        const fontSize = scene.narration.length > 200 ? 14 : scene.narration.length > 120 ? 16 : 19
        return (
          <div
            className="w-full h-full relative flex flex-col items-center justify-center px-6"
            style={{
              background: hasCustomBg ? 'transparent' : `linear-gradient(180deg, ${bg} 0%, ${(palette?.secondary || primary)}22 40%, ${bg} 100%)`,
            }}
          >
            {scene.visual_description && (
              <div
                className="mb-3 px-3 py-1 rounded-full font-medium"
                style={{
                  fontSize: 10,
                  letterSpacing: 2,
                  backgroundColor: `${primary}22`,
                  border: `1px solid ${primary}44`,
                  color: primary,
                }}
              >
                {scene.visual_description.slice(0, 40)}
              </div>
            )}
            <NarrationHighlighted
              text={scene.narration}
              keywords={scene.keywords_to_highlight || []}
              primary={primary}
              textColor={text}
              fontSize={fontSize}
            />
          </div>
        )
      }

      case 'cryptovn101_news': {
        const BRAND_COLOR = "#C6FD01";
        return (
          <div className="w-full h-full relative overflow-hidden" style={{ background: bg }}>
            {/* Layer 1: Media — Top 50% */}
            <div className="absolute top-0 left-0 right-0 h-1/2 overflow-hidden bg-black">
              {hasMedia && mediaUrl ? (
                scene.media_type === 'video' ? (
                  <video key={mediaUrl} src={mediaUrl} className="w-full h-full object-cover opacity-90" autoPlay muted loop playsInline />
                ) : (
                  <img key={mediaUrl} src={mediaUrl} className="w-full h-full object-cover opacity-90" alt="" referrerPolicy="no-referrer" />
                )
              ) : (
                <div className="w-full h-full" style={{ background: `linear-gradient(160deg, ${bg} 0%, ${primary}22 50%, ${bg} 100%)` }} />
              )}
            </div>

            {/* Layer 2: Source badge */}
            <div className="absolute left-[8%] opacity-85 z-10" style={{ top: '12%' }}>
              <div className="text-[9px] font-semibold text-white bg-black/60 px-2 py-0.5 rounded shadow-md">
                Nguồn: Tổng hợp
              </div>
            </div>

            {/* Layer 3 & 5: Dark gradient + Brand color tint on bottom half */}
            <div className="absolute bottom-0 left-0 right-0 h-[60%] flex flex-col justify-center px-[10%]" 
                 style={{ 
                   background: `linear-gradient(to bottom, transparent 0%, rgba(5,10,0,0.8) 30%, rgba(20,45,0,0.85) 60%, rgba(15,35,0,0.95) 100%)` 
                 }}>
              
              {/* Content Box */}
              <div className="relative z-20 flex flex-col mt-4">
                {/* Accent line */}
                <div className="h-[3px] w-8 rounded-sm mb-3" style={{ backgroundColor: BRAND_COLOR }} />
                
                {/* Logo + Channel name */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center overflow-hidden border border-white/10 shrink-0">
                    <span className="text-[8px] font-bold" style={{ color: BRAND_COLOR }}>CVN</span>
                  </div>
                  <span className="text-[17px] font-extrabold tracking-wide drop-shadow-md whitespace-nowrap" style={{ color: BRAND_COLOR }}>
                    CryptoVN 101
                  </span>
                </div>

                {/* Headline text */}
                <div className="text-[13px] font-extrabold text-white leading-snug drop-shadow-lg uppercase line-clamp-4">
                  {scene.narration?.slice(0, 100) || scene.visual_description}
                </div>
              </div>
            </div>
          </div>
        )
      }

      case 'title_card': {
        const mode = scene.layout || 'standard'

        if (mode === 'news_intro') {
          return (
            <div className="w-full h-full relative overflow-hidden" style={{ background: bg }}>
              {/* Media or gradient background */}
              {hasMedia && mediaUrl ? (
                scene.media_type === 'video' ? (
                  <video key={mediaUrl} src={mediaUrl} className="absolute inset-0 w-full h-full object-cover opacity-80" autoPlay muted loop playsInline />
                ) : (
                  <img key={mediaUrl} src={mediaUrl} className="absolute inset-0 w-full h-full object-cover opacity-80" alt="" referrerPolicy="no-referrer" />
                )
              ) : (
                <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${bg} 0%, ${primary}15 40%, ${bg} 100%)` }} />
              )}
              {/* Heavy gradient overlay (ensures text contrast) */}
              <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, transparent 20%, ${bg}80 45%, ${bg}E6 70%, ${bg} 100%)` }} />
              {/* Diagonal texture */}
              <div className="absolute bottom-0 left-0 right-0 h-[55%] opacity-[0.06]" style={{ backgroundImage: `repeating-linear-gradient(45deg, ${primary} 0, ${primary} 1px, transparent 0, transparent 50%)`, backgroundSize: '20px 20px', WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 30%)' }} />
              {/* Bottom content — safe zone: bottom 18%, right 20% */}
              <div className="absolute bottom-[18%] left-[6%] right-[20%] flex flex-col">
                <div className="h-[3px] w-12 rounded-full mb-3" style={{ background: `linear-gradient(90deg, ${primary}, ${secondary})`, boxShadow: `0 0 8px ${primary}80` }} />
                <div className="text-lg font-black leading-tight line-clamp-3 text-white">
                  {scene.visual_description || scene.narration?.slice(0, 60)}
                </div>
              </div>
            </div>
          )
        }

        if (mode === 'educational') {
          return (
            <div className="w-full h-full flex flex-col relative overflow-hidden" style={{ background: bg }}>
              {/* Media or gradient background */}
              {hasMedia && mediaUrl ? (
                <>
                  {scene.media_type === 'video' ? (
                    <video src={mediaUrl} className="absolute inset-0 w-full h-full object-cover" autoPlay muted loop playsInline />
                  ) : (
                    <img src={mediaUrl} className="absolute inset-0 w-full h-full object-cover" alt="" />
                  )}
                  <div className="absolute inset-0" style={{ background: `${bg}CC` }} />
                </>
              ) : null}
              {/* Left accent bar */}
              <div className="absolute left-0 top-0 bottom-0 w-[3%]" style={{ background: `linear-gradient(180deg, ${primary}, ${secondary})` }} />
              {/* Radial glow */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[40%] rounded-full opacity-20" style={{ background: `radial-gradient(ellipse, ${primary}, transparent 70%)`, filter: 'blur(30px)' }} />
              {/* Content — safe zone: bottom 18%, right 20% */}
              <div className="flex-1 flex flex-col justify-center pl-[12%] pr-[22%] pb-[18%] pt-[10%] gap-4 relative">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">💡</span>
                </div>
                <div className="text-xl font-black leading-tight line-clamp-4" style={{ color: text }}>
                  {scene.visual_description || scene.narration?.slice(0, 100)}
                </div>
                <div className="h-[4px] w-24 rounded-full" style={{ background: `linear-gradient(90deg, ${primary}, ${secondary})` }} />
              </div>
            </div>
          )
        }

        if (mode === 'tutorial') {
          return (
            <div className="w-full h-full relative overflow-hidden" style={{ background: bg }}>
              {/* Media or gradient background */}
              {hasMedia && mediaUrl ? (
                <>
                  {scene.media_type === 'video' ? (
                    <video src={mediaUrl} className="absolute inset-0 w-full h-full object-cover" autoPlay muted loop playsInline />
                  ) : (
                    <img src={mediaUrl} className="absolute inset-0 w-full h-full object-cover" alt="" />
                  )}
                  <div className="absolute inset-0" style={{ background: `${bg}DD` }} />
                </>
              ) : (
                <div className="absolute inset-0" style={{ background: `linear-gradient(150deg, ${bg} 0%, ${primary}0D 50%, ${bg} 100%)` }} />
              )}
              {/* Decorative corner circles */}
              <div className="absolute -top-[10%] -right-[8%] w-[55%] aspect-square rounded-full" style={{ background: `radial-gradient(circle, ${primary}12 0%, transparent 70%)` }} />
              <div className="absolute -bottom-[15%] -left-[10%] w-[45%] aspect-square rounded-full" style={{ background: `radial-gradient(circle, ${secondary}10 0%, transparent 70%)` }} />
              {/* Giant watermark number */}
              <div className="absolute right-[2%] top-1/2 -translate-y-1/2 opacity-[0.05] pointer-events-none" style={{ fontWeight: 900, fontSize: '300px', lineHeight: 0.85, color: primary }}>1</div>
              {/* Dot grid */}
              <div className="absolute inset-0 opacity-40" style={{ backgroundImage: `radial-gradient(${text}08 1px, transparent 1px)`, backgroundSize: '20px 20px' }} />
              {/* Content — safe zone: bottom 18%, right 22% */}
              <div className="absolute inset-0 flex flex-col justify-center p-[8%] pr-[22%] pb-[18%]">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})`, boxShadow: `0 4px 16px ${primary}50` }} />
                </div>
                <div className="text-xl font-black leading-tight line-clamp-4" style={{ color: text }}>
                  {scene.visual_description || scene.narration?.slice(0, 80)}
                </div>
                <div className="h-[4px] w-20 rounded-full mt-4" style={{ background: `linear-gradient(90deg, ${primary}, ${secondary})`, boxShadow: `0 0 10px ${primary}50` }} />
              </div>
            </div>
          )
        }

        if (mode === 'commercial') {
          return (
            <div className="w-full h-full relative overflow-hidden" style={{ background: bg }}>
              {/* Media or gradient background */}
              {hasMedia && mediaUrl ? (
                scene.media_type === 'video' ? (
                  <video src={mediaUrl} className="absolute inset-0 w-full h-full object-cover" autoPlay muted loop playsInline />
                ) : (
                  <img src={mediaUrl} className="absolute inset-0 w-full h-full object-cover" alt="" />
                )
              ) : (
                <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${bg} 0%, ${primary}15 40%, ${bg} 100%)` }} />
              )}
              {/* Cinematic vignette */}
              <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 60% at center, transparent 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.85) 100%)' }} />
              {/* Floating particles (static dots) */}
              {[20, 45, 70, 85, 30, 60].map((x, i) => (
                <div key={i} className="absolute rounded-full bg-white" style={{ left: `${x}%`, top: `${(i * 23 + 15) % 90}%`, width: 2 + (i % 2), height: 2 + (i % 2), opacity: 0.12 + (i % 3) * 0.05 }} />
              ))}
              {/* Content card — safe zone */}
              <div className="absolute inset-0 flex items-center justify-center p-[6%] pr-[20%] pb-[18%]">
                <div className="w-full flex flex-col items-center gap-5 p-6 border rounded" style={{ borderColor: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(12px)', backgroundColor: 'rgba(0,0,0,0.35)' }}>
                  {/* Top divider */}
                  <div className="w-12 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)' }} />
                  {/* Brand */}
                  {/* Title */}
                  <div className="text-lg font-extrabold text-center leading-tight line-clamp-3 text-white">
                    {scene.visual_description || scene.narration?.slice(0, 80)}
                  </div>
                  {/* Bottom divider */}
                  <div className="w-12 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)' }} />
                  {/* Accent dot */}
                  <div className="w-2 h-2 rounded-full" style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})`, boxShadow: `0 0 8px ${primary}80` }} />
                </div>
              </div>
            </div>
          )
        }

        return (
          <div className="w-full h-full flex flex-col items-center justify-center p-8 gap-4"
            style={{ background: hasCustomBg ? 'transparent' : `linear-gradient(135deg, ${bg}, ${primary}20)` }}>
            <div className="text-2xl font-black text-center leading-tight line-clamp-3" style={{ color: text }}>
              {scene.visual_description || scene.narration?.slice(0, 80)}
            </div>
            <div className="w-16 h-1 rounded-full shrink-0" style={{ backgroundColor: primary }} />
          </div>
        )
      }

      case 'info_card':
        return (
          <div className="w-full h-full flex flex-col items-center justify-center p-8 gap-4"
            style={{ background: bg }}>
            {scene.visual_description && (
              <div className="text-lg font-bold text-center leading-tight line-clamp-2" style={{ color: text }}>
                {scene.visual_description}
              </div>
            )}
            <div className="w-full max-w-[280px] p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur space-y-3">
              <div className="w-8 h-8 rounded-lg shrink-0" style={{ backgroundColor: `${primary}30` }} />
              <p className="text-sm leading-relaxed" style={{ color: text }}>
                {scene.narration?.slice(0, 100)}
              </p>
            </div>
          </div>
        )

      case 'stats_highlight':
        return (
          <div className="w-full h-full flex flex-col items-center justify-center p-8 gap-4"
            style={{ background: bg }}>
            {scene.visual_description && (
              <div className="text-xl font-bold text-center leading-tight line-clamp-2 mb-2" style={{ color: text }}>
                {scene.visual_description}
              </div>
            )}
            <div className="flex flex-col gap-3">
              {scene.stats?.length ? (
                scene.stats.slice(0, 3).map((stat, i) => (
                  <div key={i} className="text-center">
                    <div className="text-3xl font-black" style={{ color: stat.color || primary }}>
                      {stat.value}
                    </div>
                    <div className="text-xs opacity-60" style={{ color: text }}>{stat.label}</div>
                  </div>
                ))
              ) : (
                <div className="text-4xl font-black" style={{ color: primary }}>85%</div>
              )}
            </div>
            <p className="text-xs text-center opacity-60 max-w-[200px]" style={{ color: text }}>
              {scene.narration?.slice(0, 60)}
            </p>
          </div>
        )

      case 'comparison':
        return (
          <div className="w-full h-full flex flex-col relative pt-12" style={{ background: bg }}>
            {scene.visual_description && (
              <div className="absolute top-6 left-0 right-0 px-6 text-base font-bold text-center leading-tight line-clamp-1" style={{ color: text }}>
                {scene.visual_description}
              </div>
            )}
            <div className="flex-1 flex w-full">
              {(scene.comparison_sides || []).slice(0, 2).map((side, i) => (
                <div key={i} className="flex-1 flex flex-col items-center justify-center p-4 gap-2"
                  style={{ borderRight: i === 0 ? '1px solid rgba(255,255,255,0.1)' : 'none' }}>
                  <span className="text-sm font-bold" style={{ color: i === 0 ? '#22C55E' : '#EF4444' }}>
                    {side.label}
                  </span>
                  <ul className="text-xs opacity-70 space-y-1 text-center" style={{ color: text }}>
                    {side.points?.slice(0, 3).map((p, j) => <li key={j}>• {p}</li>)}
                  </ul>
                </div>
              ))}
            </div>
            <div className="absolute top-[60%] left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white/10 backdrop-blur px-3 py-1 rounded-full text-xs font-bold" style={{ color: text }}>
              VS
            </div>
          </div>
        )

      case 'timeline':
        return (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 gap-3"
            style={{ background: bg }}>
            {scene.visual_description && (
              <div className="text-lg font-bold text-center leading-tight line-clamp-2 mb-2" style={{ color: text }}>
                {scene.visual_description}
              </div>
            )}
            <div className="w-full max-w-[280px] space-y-2">
              {(scene.timeline_events || []).slice(0, 4).map((ev, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: primary }} />
                  <span className="text-xs font-mono opacity-70 shrink-0" style={{ color: text }}>{ev.label}</span>
                  <span className="text-xs truncate" style={{ color: text }}>{ev.title}</span>
                </div>
              ))}
            </div>
          </div>
        )

      case 'diagram':
        return (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 gap-2"
            style={{ background: bg }}>
            <div className="text-xs font-bold uppercase tracking-wider opacity-70" style={{ color: text }}>Sơ đồ</div>
            {scene.visual_description && (
              <div className="text-sm font-bold text-center leading-tight line-clamp-1 mb-1" style={{ color: text }}>
                {scene.visual_description}
              </div>
            )}
            <div className="space-y-2 w-full max-w-[240px]">
              {['Bước 1', 'Bước 2', 'Bước 3'].map((step, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ backgroundColor: `${primary}30`, color: primary }}>
                    {i + 1}
                  </div>
                  <div className="flex-1 h-px" style={{ backgroundColor: `${primary}30` }} />
                  <span className="text-xs" style={{ color: text }}>{step}</span>
                </div>
              ))}
            </div>
          </div>
        )

      case 'emoji_grid':
        return (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 gap-3"
            style={{ background: bg }}>
            {scene.visual_description && (
              <div className="text-lg font-bold text-center leading-tight line-clamp-2 mb-2" style={{ color: text }}>
                {scene.visual_description}
              </div>
            )}
            {scene.card_items?.length ? (
              <div className="grid grid-cols-2 gap-2 max-w-[260px]">
                {scene.card_items.slice(0, 4).map((item, i) => (
                  <div key={i} className="p-3 rounded-xl bg-white/5 text-center space-y-1">
                    <div className="text-2xl">{item.icon}</div>
                    <div className="text-[10px] font-medium leading-tight" style={{ color: text }}>{item.title}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3 text-3xl">
                {['⚡', '🎨', '💰'].map((e, i) => <span key={i}>{e}</span>)}
              </div>
            )}
          </div>
        )

      case 'story_beats': {
        const beats = (scene.story_beats || []).slice(0, 3)
        const fallbackRows = [
          { emoji: '✨', text: scene.narration?.split(' ').slice(0, 5).join(' ') || 'Nhịp nội dung 1' },
          { emoji: '⚡', text: scene.narration?.split(' ').slice(5, 10).join(' ') || 'Nhịp nội dung 2' },
          { emoji: '🎯', text: scene.narration?.split(' ').slice(10, 15).join(' ') || 'Nhịp nội dung 3' },
        ]
        const rows = beats.length ? beats : fallbackRows

        return (
          <div
            className="w-full h-full flex flex-col justify-center px-6 gap-3"
            style={{
              background: hasCustomBg ? 'transparent' : `linear-gradient(180deg, ${primary}18 0%, ${bg} 60%, ${(palette?.secondary || primary)}18 100%)`,
            }}
          >
            {scene.visual_description && (
              <div className="text-lg font-bold text-center leading-tight line-clamp-2 mb-2" style={{ color: text }}>
                {scene.visual_description}
              </div>
            )}
            {rows.map((beat, idx) => {
              const isCurrent = idx === rows.length - 1
              return (
                <div
                  key={`story-beat-mock-${idx}`}
                  className="rounded-xl border px-3 py-2 flex items-center gap-3"
                  style={{
                    borderColor: isCurrent ? `${primary}66` : 'rgba(255,255,255,0.12)',
                    backgroundColor: isCurrent ? `${primary}22` : 'rgba(255,255,255,0.04)',
                    opacity: isCurrent ? 1 : 0.65,
                  }}
                >
                  <span className="text-2xl leading-none shrink-0">{beat.emoji}</span>
                  <span
                    className="text-xs leading-snug line-clamp-2"
                    style={{ color: isCurrent ? text : `${text}CC`, fontWeight: isCurrent ? 700 : 500 }}
                  >
                    {beat.text}
                  </span>
                </div>
              )
            })}
          </div>
        )
      }

      case 'media_showcase': {
        const mediaLayout = scene.media_layout || 'cinema'
        if (mediaLayout === 'fullscreen') {
          return (
            <div className="w-full h-full flex items-center justify-center overflow-hidden relative" style={{ background: bg }}>
              {hasMedia && mediaUrl && (
                <img src={mediaUrl} className="absolute inset-0 w-full h-full object-cover opacity-80" alt="" />
              )}
              <div className="text-center space-y-2 relative z-10 bg-black/40 p-4 rounded-xl backdrop-blur-md">
                <Film className="w-10 h-10 mx-auto text-primary/80" />
                <p className="text-xs" style={{ color: text }}>Toàn màn hình</p>
              </div>
            </div>
          )
        }


        return (
          <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 relative overflow-hidden" style={{ background: bg }}>
            {hasMedia && mediaUrl && (
              <img src={mediaUrl} className="absolute inset-0 w-full h-full object-cover opacity-20 blur-sm" alt="" />
            )}
            <p className="text-sm font-bold text-center relative z-10 drop-shadow-md" style={{ color: text }}>
              {scene.visual_description?.slice(0, 40) || scene.narration?.slice(0, 40)}
            </p>
            <div className="w-[240px] h-[135px] rounded-xl bg-black/40 border border-white/20 flex items-center justify-center overflow-hidden shadow-2xl relative z-10 backdrop-blur-md">
              {hasMedia && mediaUrl ? (
                <img src={mediaUrl} className="w-full h-full object-cover" alt="" />
              ) : (
                <Play className="w-8 h-8 text-primary/50" />
              )}
            </div>
          </div>
        )
      }

      default:
        return (
          <div className="w-full h-full flex flex-col items-center justify-center gap-4"
            style={{ background: hasCustomBg ? 'transparent' : `linear-gradient(135deg, ${primary}20, ${bg}, ${primary}10)` }}>
            <Palette className="w-10 h-10 text-primary/40" />
            <Badge variant="secondary" className="text-xs">
              {SCENE_TYPE_LABELS[scene.scene_type || ''] || scene.scene_type}
            </Badge>
          </div>
        )
    }
  }

  const globalBgUrl = settings?.custom_background_url ? getPreviewUrl({ media_url: settings.custom_background_url } as any) : null;
  const isGlobalVideo = globalBgUrl?.split('?')[0].match(/\.(mp4|webm|mov)$/i);

  return (
    <div className="w-full h-full relative overflow-hidden" style={{ background: hasCustomBg ? 'transparent' : presetGradient }}>
      {hasCustomBg && globalBgUrl && (
        isGlobalVideo ? (
          <video key={globalBgUrl} src={globalBgUrl} className="absolute inset-0 w-full h-full object-cover opacity-80" autoPlay muted loop playsInline />
        ) : (
          <img key={globalBgUrl} src={globalBgUrl} className="absolute inset-0 w-full h-full object-cover opacity-80" alt="" referrerPolicy="no-referrer" />
        )
      )}
      <div className="relative z-10 w-full h-full">
        {renderContent()}
      </div>
    </div>
  )
}

function ScenePlayer({
  isPlaying,
  currentMs,
  sceneStartMs,
  sceneEndMs,
  onToggle,
  onSeek,
}: {
  isPlaying: boolean
  currentMs: number
  sceneStartMs: number
  sceneEndMs: number
  onToggle: () => void
  onSeek: (ms: number) => void
}) {
  const safeCurrent = clampNumber(currentMs, sceneStartMs, sceneEndMs)
  return (
    <div className="w-full max-w-[460px] mt-4 p-3 rounded-xl border border-white/10 bg-background/45 backdrop-blur-md space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Button size="sm" variant={isPlaying ? 'secondary' : 'default'} className="h-8 gap-2" onClick={onToggle}>
          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          {isPlaying ? 'Tạm dừng' : 'Phát'}
        </Button>
        <div className="text-xs font-mono text-muted-foreground">
          {formatMs(safeCurrent)} / {formatMs(sceneEndMs)}
        </div>
      </div>
      <input
        type="range"
        min={sceneStartMs}
        max={Math.max(sceneStartMs, sceneEndMs)}
        step={33}
        value={safeCurrent}
        onChange={(e) => onSeek(Number(e.target.value))}
        className="w-full h-1.5 accent-primary"
      />
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span><kbd className="font-mono bg-muted px-1 py-0.5 rounded text-[11px]">Space</kbd> Phát/Tạm dừng</span>
        <span><kbd className="font-mono bg-muted px-1 py-0.5 rounded text-[11px]">← →</kbd> Chuyển cảnh</span>
        <span><kbd className="font-mono bg-muted px-1 py-0.5 rounded text-[11px]">Ctrl+S</kbd> Lưu nháp</span>
        <span><kbd className="font-mono bg-muted px-1 py-0.5 rounded text-[11px]">Ctrl+Z</kbd> Hoàn tác</span>
        <span><kbd className="font-mono bg-muted px-1 py-0.5 rounded text-[11px]">Delete</kbd> Xóa cảnh</span>
      </div>
    </div>
  )
}

function TimelineRuler({
  scenes,
  selectedSceneIndex,
  totalDurationMs,
  currentMs,
  onSeekPointerDown,
  onSceneClick,
  onTrimHandleMouseDown,
  onSceneContextMenu,
  timelineRef,
}: {
  scenes: Scene[]
  selectedSceneIndex: number
  totalDurationMs: number
  currentMs: number
  onSeekPointerDown: (event: React.MouseEvent<HTMLDivElement>) => void
  onSceneClick: (index: number) => void
  onTrimHandleMouseDown: (event: React.MouseEvent<HTMLButtonElement>, edge: 'start' | 'end', index: number) => void
  onSceneContextMenu: (event: React.MouseEvent<HTMLDivElement>, index: number) => void
  timelineRef: React.RefObject<HTMLDivElement | null>
}) {
  const safeTotal = Math.max(1, totalDurationMs)
  const caretLeft = `${(clampNumber(currentMs, 0, safeTotal) / safeTotal) * 100}%`

  return (
    <div className="w-full max-w-[780px] mt-5">
      <div className="flex items-center justify-between text-xs mb-1 px-1">
        <span className="font-semibold text-[var(--text-primary)]">Dòng thời gian</span>
        <span className="font-mono text-[var(--text-tertiary)]">{formatMs(currentMs)} / {formatMs(safeTotal)}</span>
      </div>
      <div
        ref={timelineRef}
        className="relative h-16 rounded-xl border border-white/10 bg-muted/30 overflow-hidden select-none"
        onMouseDown={onSeekPointerDown}
      >
        {scenes.map((scene, index) => {
          const left = (scene.start_ms / safeTotal) * 100
          const width = Math.max(0.8, ((scene.end_ms - scene.start_ms) / safeTotal) * 100)
          const isActive = index === selectedSceneIndex

          return (
            <div
              key={`timeline-scene-${index}`}
              className={cn(
                'absolute top-1.5 bottom-1.5 rounded-lg border cursor-pointer transition-all',
                isActive
                  ? 'bg-primary/30 border-primary/60 ring-1 ring-primary/40'
                  : 'bg-card/60 border-white/10 hover:border-primary/30'
              )}
              style={{ left: `${left}%`, width: `${width}%` }}
              onClick={(e) => {
                e.stopPropagation()
                onSceneClick(index)
              }}
              onContextMenu={(e) => onSceneContextMenu(e, index)}
            >
              <div className="absolute inset-0 px-2 py-1 flex items-end justify-between gap-1 pointer-events-none">
                <span className="text-xs font-mono text-[var(--text-primary)]">{index + 1}</span>
                <span className="text-xs text-[var(--text-primary)] truncate">{SCENE_TYPE_LABELS[scene.scene_type || ''] || scene.scene_type}</span>
              </div>

              {isActive && (
                <>
                  <button
                    type="button"
                    className="absolute -left-1 top-0 bottom-0 w-2 rounded-full bg-primary/90 cursor-ew-resize"
                    onMouseDown={(e) => onTrimHandleMouseDown(e, 'start', index)}
                    title="Kéo để chỉnh start_ms"
                    aria-label={`Kéo để chỉnh start_ms cảnh ${index + 1}`}
                  />
                  <button
                    type="button"
                    className="absolute -right-1 top-0 bottom-0 w-2 rounded-full bg-primary/90 cursor-ew-resize"
                    onMouseDown={(e) => onTrimHandleMouseDown(e, 'end', index)}
                    title="Kéo để chỉnh end_ms"
                    aria-label={`Kéo để chỉnh end_ms cảnh ${index + 1}`}
                  />
                </>
              )}
            </div>
          )
        })}

        <div className="absolute top-0 bottom-0 w-[2px] bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.8)] pointer-events-none"
          style={{ left: caretLeft }} />
      </div>
    </div>
  )
}

function RenderReadinessStrip({
  requiredMediaCount,
  readyMediaCount,
  missingMediaSceneIndexes,
  missingNarrationSceneIndexes,
  warningSceneItems,
  onSeekScene,
}: {
  requiredMediaCount: number
  readyMediaCount: number
  missingMediaSceneIndexes: number[]
  missingNarrationSceneIndexes: number[]
  warningSceneItems: WarningSceneItem[]
  onSeekScene: (sceneIndex: number) => void
}) {
  const warningCount = warningSceneItems.length
  const hasIssue = missingMediaSceneIndexes.length > 0 || missingNarrationSceneIndexes.length > 0 || warningCount > 0

  return (
    <div className="bg-muted/10 p-3 rounded-lg border border-white/5 mb-2 shadow-sm">
      <div className="flex flex-col gap-2">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Đủ phương tiện: {readyMediaCount}/{requiredMediaCount}
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-3 py-1 text-xs font-semibold text-destructive">
          <ImageIcon className="h-3.5 w-3.5" />
          Thiếu phương tiện: {missingMediaSceneIndexes.length}
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-semibold text-orange-300">
          <Edit3 className="h-3.5 w-3.5" />
          Thiếu lời thoại: {missingNarrationSceneIndexes.length}
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5" />
          Cảnh báo: {warningCount}
        </div>
      </div>

      {missingMediaSceneIndexes.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-3 border-t border-white/5">
          <span className="text-[10px] uppercase tracking-wider text-destructive/90 w-full">Thiếu phương tiện bắt buộc</span>
          {missingMediaSceneIndexes.map((sceneIndex) => (
            <button
              key={`missing-media-${sceneIndex}`}
              type="button"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive hover:bg-destructive/20"
              onClick={() => onSeekScene(sceneIndex)}
            >
              Cảnh {sceneIndex + 1}
            </button>
          ))}
        </div>
      )}

      {missingNarrationSceneIndexes.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 pt-2 border-t border-white/5">
          <span className="text-[10px] uppercase tracking-wider text-orange-300 w-full">Thiếu lời thoại</span>
          {missingNarrationSceneIndexes.map((sceneIndex) => (
            <button
              key={`missing-narration-${sceneIndex}`}
              type="button"
              className="rounded-md border border-orange-500/35 bg-orange-500/10 px-2 py-1 text-xs font-semibold text-orange-200 hover:bg-orange-500/20"
              onClick={() => onSeekScene(sceneIndex)}
            >
              Cảnh {sceneIndex + 1}
            </button>
          ))}
        </div>
      )}

      {warningSceneItems.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 pt-2 border-t border-white/5">
          <span className="text-[10px] uppercase tracking-wider text-amber-300 w-full">Cảnh báo</span>
          {warningSceneItems.map((item) => (
            <button
              key={`warning-${item.sceneIndex}`}
              type="button"
              className="rounded-md border border-amber-500/35 bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-100 hover:bg-amber-500/20"
              onClick={() => onSeekScene(item.sceneIndex)}
              title={item.reasons.join(' • ')}
            >
              Cảnh {item.sceneIndex + 1}: {item.reasons.join(' • ')}
            </button>
          ))}
        </div>
      )}

      {!hasIssue && (
        <div className="mt-2 text-xs text-emerald-300/90">
          Danh sách kiểm tra đã ổn. Có thể kết xuất.
        </div>
      )}
    </div>
  )
}

interface SceneThumbnailProps {
  scene: Scene
  isActive: boolean
  hasMissingMedia: boolean
  hasLongNarrationWarning: boolean
}

const SceneThumbnail = memo(function SceneThumbnail({
  scene,
  isActive,
  hasMissingMedia,
  hasLongNarrationWarning,
}: SceneThumbnailProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [shouldLoadMedia, setShouldLoadMedia] = useState(false)

  const previewUrl = getPreviewUrl(scene)
  const posterUrl = getScenePosterUrl(scene)
  const needsMedia = NEEDS_MEDIA.has(scene.scene_type || '')

  useEffect(() => {
    const node = containerRef.current
    if (!node) return

    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      setShouldLoadMedia(true)
      return
    }

    const root = node.closest('[data-radix-scroll-area-viewport]')
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries
        if (entry?.isIntersecting) {
          setShouldLoadMedia(true)
          observer.disconnect()
        }
      },
      {
        root: root instanceof Element ? root : null,
        rootMargin: '260px 0px',
        threshold: 0.01,
      }
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const renderMedia = () => {
    if (!previewUrl) {
      if (needsMedia) {
        return (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
            <ImageIcon size={16} />
          </div>
        )
      }

      return (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 via-background to-secondary/20">
          <Palette size={14} className="text-primary/40" />
        </div>
      )
    }

    if (!shouldLoadMedia) {
      return <div className="w-full h-full bg-black/35" />
    }

    if (scene.media_type === 'video') {
      if (posterUrl) {
        return (
          <img
            src={posterUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
          />
        )
      }

      return (
        <video
          src={previewUrl}
          preload="none"
          autoPlay
          muted
          loop
          playsInline
          className="w-full h-full object-cover"
        />
      )
    }

    return (
      <img
        src={previewUrl}
        alt=""
        loading="lazy"
        decoding="async"
        className="w-full h-full object-cover"
      />
    )
  }

  return (
    <div
      ref={containerRef}
      className="relative shrink-0 w-[45px] h-[80px] rounded-md bg-black/40 overflow-hidden shadow-inner border border-white/5"
    >
      {renderMedia()}
      {hasMissingMedia && (
        <div className="absolute top-1 left-1 rounded-md bg-destructive px-1 py-0.5 text-xs font-bold text-white shadow">
          !
        </div>
      )}
      {hasLongNarrationWarning && (
        <div className="absolute top-1 right-1 rounded-md bg-amber-500 px-1 py-0.5 text-xs font-bold text-black shadow">
          30s+
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1">
        <div className="text-xs text-white font-mono text-right mr-1">
          {((scene.end_ms - scene.start_ms) / 1000).toFixed(1)}s
        </div>
      </div>
      {isActive && <div className="absolute inset-0 border-2 border-primary rounded-lg" />}
    </div>
  )
}, (prevProps, nextProps) => (
  prevProps.isActive === nextProps.isActive &&
  prevProps.hasMissingMedia === nextProps.hasMissingMedia &&
  prevProps.hasLongNarrationWarning === nextProps.hasLongNarrationWarning &&
  prevProps.scene.scene_type === nextProps.scene.scene_type &&
  prevProps.scene.media_url === nextProps.scene.media_url &&
  prevProps.scene._preview_url === nextProps.scene._preview_url &&
  prevProps.scene.media_type === nextProps.scene.media_type &&
  prevProps.scene.poster_url === nextProps.scene.poster_url &&
  prevProps.scene.start_ms === nextProps.scene.start_ms &&
  prevProps.scene.end_ms === nextProps.scene.end_ms
))

function SortableSceneCard({
  id,
  scene,
  index,
  isActive,
  hasMissingMedia,
  hasLongNarrationWarning,
  onSelect,
  onContextMenu,
}: {
  id: string
  scene: Scene
  index: number
  isActive: boolean
  hasMissingMedia: boolean
  hasLongNarrationWarning: boolean
  onSelect: () => void
  onContextMenu: (e: React.MouseEvent<HTMLButtonElement>) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : 1,
  }

  return (
    <button
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      className={cn(
        'w-full flex items-start gap-2 p-2 rounded-xl text-left transition-all group',
        isActive
          ? 'bg-card shadow-sm border border-primary/20 ring-1 ring-primary/10'
          : 'hover:bg-accent/50 border border-transparent'
      )}
    >
      <span
        className="mt-0.5 h-5 w-5 rounded-md border border-white/10 bg-background/70 flex items-center justify-center text-muted-foreground cursor-grab active:cursor-grabbing shrink-0"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={12} />
      </span>

      <SceneThumbnail
        scene={scene}
        isActive={isActive}
        hasMissingMedia={hasMissingMedia}
        hasLongNarrationWarning={hasLongNarrationWarning}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1 mb-0.5">
          <span className={cn('text-[10px] font-bold uppercase tracking-wider', isActive ? 'text-primary' : 'text-muted-foreground')}>
            Cảnh {index + 1}
          </span>
          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 font-mono truncate max-w-[72px]">
            {SCENE_TYPE_LABELS[scene.scene_type || ''] || scene.scene_type || '?'}
          </Badge>
        </div>
        <p className={cn('text-[11px] line-clamp-2 leading-relaxed italic opacity-80', isActive ? 'text-foreground' : 'text-muted-foreground')}>
          "{scene.narration}"
        </p>
      </div>
    </button>
  )
}

export default function ReviewView({
  jobId,
  videoProps,
  selectedSceneIndex,
  onSelectScene,
  onRenderStart,
  onBackToSetup,
  onPropsUpdate
}: ReviewViewProps) {
  const [rendering, setRendering] = useState(false)
  const [mediaLoading, setMediaLoading] = useState(true)
  const [mediaError, setMediaError] = useState(false)
  const [ctaDragOver, setCtaDragOver] = useState(false)
  const [rightPanelTab, setRightPanelTab] = useState<'scene' | 'video'>('scene')
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window === 'undefined' ? 1440 : window.innerWidth))
  const [leftPanelOpen, setLeftPanelOpen] = useState(false)
  const [rightPanelOpen, setRightPanelOpen] = useState(false)
  const [leftWidth, setLeftWidth] = useState(240)
  const [rightWidth, setRightWidth] = useState(280)
  const leftResizingRef = useRef(false)
  const rightResizingRef = useRef(false)
  const resizeStartXRef = useRef(0)
  const resizeStartWidthRef = useRef(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [backConfirmOpen, setBackConfirmOpen] = useState(false)
  const [currentMs, setCurrentMs] = useState(0)
  const [audioSrc, setAudioSrc] = useState<string | null>(null)
  const [audioReady, setAudioReady] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sceneIndex: number } | null>(null)
  const [timelineDrag, setTimelineDrag] = useState<{
    mode: 'seek' | 'trim-start' | 'trim-end'
    sceneIndex: number
  } | null>(null)

  // Dirty tracking & Autosave
  const [lastSavedProps, setLastSavedProps] = useState<VideoProps | null>(videoProps || null)
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [historyStack, setHistoryStack] = useState<VideoProps[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)

  const MAX_HISTORY = 50

  const audioRef = useRef<HTMLAudioElement>(null)
  const rafRef = useRef<number | null>(null)
  const playStartPerfRef = useRef(0)
  const playStartMsRef = useRef(0)
  const currentMsRef = useRef(0)
  const lastAudioSyncAtRef = useRef(0)
  const timelineRef = useRef<HTMLDivElement>(null)
  const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)


  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  )

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (leftResizingRef.current) {
        const delta = e.clientX - resizeStartXRef.current
        setLeftWidth(Math.min(400, Math.max(160, resizeStartWidthRef.current + delta)))
      } else if (rightResizingRef.current) {
        const delta = resizeStartXRef.current - e.clientX
        setRightWidth(Math.min(480, Math.max(220, resizeStartWidthRef.current + delta)))
      }
    }
    const onMouseUp = () => {
      leftResizingRef.current = false
      rightResizingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])



  useEffect(() => {
    if (viewportWidth >= 1440) {
      setLeftPanelOpen(false)
      setRightPanelOpen(false)
      return
    }
    if (viewportWidth >= 1024) {
      setRightPanelOpen(false)
    }
  }, [viewportWidth])

  const handleRetryMedia = useCallback((index: number) => {
    if (!videoProps) return
    const newProps = { ...videoProps }
    const scenes = [...newProps.scenes]
    const currentUrl = scenes[index].media_url || ''
    if (currentUrl) {
      scenes[index] = {
        ...scenes[index],
        media_url: currentUrl.split('?')[0] + '?t=' + Date.now()
      }
      onPropsUpdate({ ...newProps, scenes })
      toast.info('Đang tải lại phương tiện...')
    }
  }, [videoProps, onPropsUpdate])

  const handleQuickReSearch = useCallback(async (index: number) => {
    if (!videoProps) return
    const scene = videoProps.scenes[index]
    const query = scene.image_query || scene.video_query
    if (!query) {
      toast.error('Cảnh này chưa có từ khóa tìm kiếm')
      return
    }

    const loadingToast = toast.loading('Đang tìm media khác...')
    try {
      const result = await api.post(`/jobs/${jobId}/scenes/${index}/re-search`, {
        image_query: query,
        video_query: query,
      })
      toast.success(`Đã đổi media cho cảnh ${index + 1}`, { id: loadingToast })

      const newProps = { ...videoProps }
      const scenes = [...newProps.scenes]
      scenes[index] = {
        ...scenes[index],
        media_url: result.media_url,
        media_type: result.media_type,
        poster_url: result.poster_url ?? (result.media_type === 'image' ? result.media_url : null),
        _media_width: result.width ? Number(result.width) : null,
        _media_height: result.height ? Number(result.height) : null,
      }
      onPropsUpdate({ ...newProps, scenes })
    } catch (err: any) {
      showErrorToast(err, {
        source: 'review_media_search',
        jobId,
        fallback: 'Tìm kiếm thất bại',
        prefix: 'Tìm kiếm thất bại',
        id: loadingToast,
      })
    }
  }, [videoProps, jobId, onPropsUpdate])

  const buildScenesForPatch = useCallback((sceneList: Scene[]) => {
    return sceneList.map((s) => {
      const { media_url, media_type, poster_url, _preview_url, ...editableFields } = s as any
      return editableFields
    })
  }, [])

  const saveDraft = useCallback(async (silent = false) => {
    if (!videoProps) return
    try {
      setIsSaving(true)
      await api.patch(`/jobs/${jobId}/props`, {
        scenes: buildScenesForPatch(videoProps.scenes),
        settings: (videoProps as any).settings || {},
        color_palette: (videoProps as any).color_palette || undefined,
      })
      setLastSavedProps(videoProps)
      if (!silent) toast.success('Đã lưu bản nháp')
    } catch (err: any) {
      showErrorToast(err, {
        source: 'review_save_draft',
        jobId,
        fallback: 'Lưu nháp thất bại',
        prefix: 'Lưu nháp thất bại',
      })
    } finally {
      setIsSaving(false)
    }
  }, [videoProps, jobId, buildScenesForPatch])

  const scheduleAutosave = useCallback(() => {
    if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current)
    autosaveTimeoutRef.current = setTimeout(() => {
      if (isDirty && videoProps) {
        saveDraft(true)
      }
    }, 1500)
  }, [isDirty, videoProps, saveDraft])

  const handleUndo = useCallback(() => {
    if (historyIndex <= 0) return
    const newIndex = historyIndex - 1
    const targetProps = historyStack[newIndex]
    if (targetProps) {
      onPropsUpdate(targetProps)
      setHistoryIndex(newIndex)
      toast.info('Hoàn tác')
    }
  }, [historyIndex, historyStack, onPropsUpdate])

  const handleRedo = useCallback(() => {
    if (historyIndex >= historyStack.length - 1) return
    const newIndex = historyIndex + 1
    const targetProps = historyStack[newIndex]
    if (targetProps) {
      onPropsUpdate(targetProps)
      setHistoryIndex(newIndex)
      toast.info('Làm lại')
    }
  }, [historyIndex, historyStack, onPropsUpdate])

  const scenes = videoProps?.scenes || []
  const palette = videoProps?.color_palette || {}
  const settings = (videoProps as any)?.settings || {}
  const selectedScene = scenes[selectedSceneIndex] || scenes[0]
  const selectedSceneStartMs = selectedScene?.start_ms ?? 0
  const selectedSceneEndMs = selectedScene?.end_ms ?? 0
  const totalDurationMs = useMemo(() => getTotalDurationMs(scenes), [scenes])
  const sortableIds = useMemo(() => scenes.map((_, index) => `scene-${index}`), [scenes])
  const isThreeColumnLayout = viewportWidth >= 1440
  const isTabletLayout = viewportWidth >= 1024 && viewportWidth < 1440
  const isMobileLayout = viewportWidth < 1024
  const requiredMediaSceneIndexes = useMemo(
    () => scenes.reduce<number[]>((acc, scene, index) => {
      if (NEEDS_MEDIA.has(scene.scene_type || '')) acc.push(index)
      return acc
    }, []),
    [scenes]
  )
  const missingMediaSceneIndexes = useMemo(
    () => requiredMediaSceneIndexes.filter((sceneIndex) => !scenes[sceneIndex]?.media_url),
    [requiredMediaSceneIndexes, scenes]
  )
  const missingNarrationSceneIndexes = useMemo(
    () => scenes.reduce<number[]>((acc, scene, index) => {
      if (!scene.narration || !scene.narration.trim()) acc.push(index)
      return acc
    }, []),
    [scenes]
  )
  const longNarrationSceneIndexes = useMemo(
    () => scenes.reduce<number[]>((acc, scene, index) => {
      if (getSceneDurationMs(scene) > LONG_NARRATION_WARNING_MS) acc.push(index)
      return acc
    }, []),
    [scenes]
  )
  const lowResolutionSceneItems = useMemo(
    () => scenes.reduce<Array<{ sceneIndex: number; width: number; height: number }>>((acc, scene, index) => {
      if (!scene.media_url) return acc
      const dimensions = getSceneMediaDimensions(scene)
      if (!dimensions) return acc
      if (Math.min(dimensions.width, dimensions.height) < LOW_RES_MIN_EDGE_PX) {
        acc.push({ sceneIndex: index, width: dimensions.width, height: dimensions.height })
      }
      return acc
    }, []),
    [scenes]
  )
  const warningSceneItems = useMemo<WarningSceneItem[]>(() => {
    const byScene = new Map<number, string[]>()

    longNarrationSceneIndexes.forEach((sceneIndex) => {
      byScene.set(sceneIndex, [`Lời thoại > ${LONG_NARRATION_WARNING_MS / 1000}s`])
    })

    lowResolutionSceneItems.forEach((item) => {
      const reasons = byScene.get(item.sceneIndex) || []
      reasons.push(`Phương tiện độ phân giải thấp (${item.width}x${item.height})`)
      byScene.set(item.sceneIndex, reasons)
    })

    return Array.from(byScene.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([sceneIndex, reasons]) => ({ sceneIndex, reasons }))
  }, [longNarrationSceneIndexes, lowResolutionSceneItems])
  const missingMediaSceneSet = useMemo(() => new Set(missingMediaSceneIndexes), [missingMediaSceneIndexes])
  const longNarrationSceneSet = useMemo(() => new Set(longNarrationSceneIndexes), [longNarrationSceneIndexes])
  const readyMediaCount = requiredMediaSceneIndexes.length - missingMediaSceneIndexes.length
  const renderDisabledReason = useMemo(() => {
    // Media is optional for all scene types — Remotion renders gradient fallbacks.
    // Missing media is shown as a soft warning, not a render blocker.
    return null
  }, [])
  const storyBeatsSuggestion = useMemo(() => {
    const audit = selectedScene?.audit
    if (!audit) return null
    if (selectedScene?.scene_type === 'story_beats') return null
    if (audit.suggested_fallback !== 'story_beats') return null
    return audit
  }, [selectedScene])

  const jumpToScene = useCallback((sceneIndex: number) => {
    const scene = scenes[sceneIndex]
    if (!scene) return
    setIsPlaying(false)
    onSelectScene(sceneIndex)
    setCurrentMs(scene.start_ms)
  }, [scenes, onSelectScene])

  const applySceneChanges = useCallback((nextScenes: Scene[], nextSelectedIndex: number, seekTo: 'start' | 'keep' = 'start') => {
    if (!videoProps || !nextScenes.length) return
    const normalizedSelected = clampNumber(nextSelectedIndex, 0, nextScenes.length - 1)
    const nextProps = { ...videoProps, scenes: nextScenes }

    // Add to undo/redo history
    const newStack = historyStack.slice(0, historyIndex + 1)
    newStack.push(nextProps)
    if (newStack.length > MAX_HISTORY) newStack.shift()
    setHistoryStack(newStack)
    setHistoryIndex(newStack.length - 1)

    onPropsUpdate(nextProps)
    onSelectScene(normalizedSelected)
    if (seekTo === 'start') {
      setCurrentMs(nextScenes[normalizedSelected].start_ms)
    } else {
      setCurrentMs((prev) => clampNumber(prev, 0, getTotalDurationMs(nextScenes)))
    }
  }, [videoProps, historyStack, historyIndex, onPropsUpdate, onSelectScene, MAX_HISTORY])

  const cloneScene = useCallback((scene: Scene): Scene => {
    return {
      ...scene,
      card_items: scene.card_items ? scene.card_items.map((item) => ({ ...item })) : scene.card_items,
      stats: scene.stats ? scene.stats.map((item) => ({ ...item })) : scene.stats,
      diagram_spec: scene.diagram_spec ? { ...scene.diagram_spec } : scene.diagram_spec,
      comparison_sides: scene.comparison_sides
        ? scene.comparison_sides.map((side) => ({ ...side, points: [...side.points] }))
        : scene.comparison_sides,
      timeline_events: scene.timeline_events
        ? scene.timeline_events.map((event) => ({ ...event }))
        : scene.timeline_events,
      story_beats: scene.story_beats ? scene.story_beats.map((beat) => ({ ...beat })) : scene.story_beats,
      audit: scene.audit
        ? {
          ...scene.audit,
          signals: scene.audit.signals ? [...scene.audit.signals] : scene.audit.signals,
          rule_details: scene.audit.rule_details ? { ...scene.audit.rule_details } : scene.audit.rule_details,
        }
        : scene.audit,
      keywords_to_highlight: scene.keywords_to_highlight ? [...scene.keywords_to_highlight] : scene.keywords_to_highlight,
    }
  }, [])

  const createInsertedScene = useCallback((baseScene?: Scene): Scene => {
    const fallbackType = baseScene?.scene_type || 'stock_background'
    return {
      scene_type: fallbackType,
      narration: 'Cảnh mới',
      visual_description: baseScene?.visual_description || 'Mô tả cảnh mới',
      start_ms: 0,
      end_ms: Math.max(3000, getSceneDurationMs(baseScene)),
      media_url: null,
      media_type: null,
      poster_url: null,
      transition: baseScene?.transition || 'fade',
      image_query: baseScene?.image_query || '',
      video_query: baseScene?.video_query || '',
      media_layout: baseScene?.media_layout || null,
      layout: fallbackType === 'stock_background' ? 'media_overlay' : null,
      keywords_to_highlight: [],
    }
  }, [])

  const handleDeleteScene = useCallback((index: number = selectedSceneIndex) => {
    if (!videoProps) return
    if (videoProps.scenes.length <= 1) {
      toast.error('Không thể xóa cảnh cuối cùng')
      return
    }
    const next = normalizeScenesByDuration(videoProps.scenes.filter((_, i) => i !== index))
    const nextIndex = Math.max(0, Math.min(index, next.length - 1))
    applySceneChanges(next, nextIndex)
    setIsPlaying(false)
  }, [videoProps, selectedSceneIndex, applySceneChanges])

  const handleDuplicateScene = useCallback((index: number) => {
    if (!videoProps) return
    const source = videoProps.scenes[index]
    if (!source) return
    const duplicate = cloneScene(source)
    const next = [
      ...videoProps.scenes.slice(0, index + 1),
      duplicate,
      ...videoProps.scenes.slice(index + 1),
    ]
    applySceneChanges(normalizeScenesByDuration(next), index + 1)
    toast.success(`Đã nhân bản cảnh ${index + 1}`)
  }, [videoProps, cloneScene, applySceneChanges])

  const handleInsertScene = useCallback((index: number, where: 'before' | 'after') => {
    if (!videoProps) return
    const target = videoProps.scenes[index]
    if (!target) return
    const insertAt = where === 'before' ? index : index + 1
    const inserted = createInsertedScene(target)
    const next = [
      ...videoProps.scenes.slice(0, insertAt),
      inserted,
      ...videoProps.scenes.slice(insertAt),
    ]
    applySceneChanges(normalizeScenesByDuration(next), insertAt)
    toast.success(where === 'before' ? 'Đã thêm cảnh phía trước' : 'Đã thêm cảnh phía sau')
  }, [videoProps, createInsertedScene, applySceneChanges])

  const updateSceneTiming = useCallback((index: number, nextStart: number, nextEnd: number, adjustNeighbors = false) => {
    if (!videoProps) return
    const nextScenes = videoProps.scenes.map((scene) => ({ ...scene }))
    const scene = nextScenes[index]
    if (!scene) return
    const prev = nextScenes[index - 1]
    const following = nextScenes[index + 1]

    const minStart = prev
      ? (adjustNeighbors ? prev.start_ms + MIN_SCENE_MS : prev.end_ms)
      : 0
    const maxEnd = following
      ? (adjustNeighbors ? following.end_ms - MIN_SCENE_MS : following.start_ms)
      : Math.max(totalDurationMs, nextEnd)

    let start = clampNumber(nextStart, minStart, nextEnd - MIN_SCENE_MS)
    let end = clampNumber(nextEnd, start + MIN_SCENE_MS, maxEnd)
    start = Math.round(start)
    end = Math.round(end)

    scene.start_ms = start
    scene.end_ms = end

    if (adjustNeighbors && prev) prev.end_ms = start
    if (adjustNeighbors && following) following.start_ms = end

    onPropsUpdate({ ...videoProps, scenes: nextScenes })
    setCurrentMs((ms) => clampNumber(ms, scene.start_ms, scene.end_ms))
  }, [videoProps, totalDurationMs, onPropsUpdate])

  const handleSceneDragEnd = useCallback((event: DragEndEvent) => {
    if (!videoProps) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = Number(String(active.id).replace('scene-', ''))
    const newIndex = Number(String(over.id).replace('scene-', ''))
    if (Number.isNaN(oldIndex) || Number.isNaN(newIndex)) return

    const moved = arrayMove(videoProps.scenes, oldIndex, newIndex)
    const normalized = normalizeScenesByDuration(moved)

    let nextSelected = selectedSceneIndex
    if (selectedSceneIndex === oldIndex) {
      nextSelected = newIndex
    } else if (oldIndex < selectedSceneIndex && selectedSceneIndex <= newIndex) {
      nextSelected = selectedSceneIndex - 1
    } else if (newIndex <= selectedSceneIndex && selectedSceneIndex < oldIndex) {
      nextSelected = selectedSceneIndex + 1
    }

    applySceneChanges(normalized, nextSelected, 'keep')
  }, [videoProps, selectedSceneIndex, applySceneChanges])

  const seekToMs = useCallback((nextMs: number, autoSelect = true) => {
    const safe = clampNumber(nextMs, 0, Math.max(totalDurationMs, 0))
    currentMsRef.current = safe
    setCurrentMs(safe)
    if (autoSelect && scenes.length) {
      const nextIndex = getSceneIndexAtMs(scenes, safe)
      if (nextIndex !== selectedSceneIndex) onSelectScene(nextIndex)
    }
  }, [scenes, totalDurationMs, selectedSceneIndex, onSelectScene])

  const getTimelineMsFromClientX = useCallback((clientX: number) => {
    const el = timelineRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    const x = clampNumber(clientX - rect.left, 0, rect.width)
    return (x / Math.max(1, rect.width)) * Math.max(1, totalDurationMs)
  }, [totalDurationMs])

  const handleTimelineSeekMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const ms = getTimelineMsFromClientX(event.clientX)
    seekToMs(ms, true)
    setTimelineDrag({ mode: 'seek', sceneIndex: selectedSceneIndex })
  }, [getTimelineMsFromClientX, seekToMs, selectedSceneIndex])

  const handleTrimHandleMouseDown = useCallback((event: React.MouseEvent<HTMLButtonElement>, edge: 'start' | 'end', sceneIndex: number) => {
    event.preventDefault()
    event.stopPropagation()
    setTimelineDrag({ mode: edge === 'start' ? 'trim-start' : 'trim-end', sceneIndex })
  }, [])

  // Track dirty state
  useEffect(() => {
    if (!videoProps || !lastSavedProps) {
      setIsDirty(false)
      return
    }
    const isEqual = deepEqual(videoProps, lastSavedProps)
    setIsDirty(!isEqual)
  }, [videoProps, lastSavedProps])

  // Initialize history on first load
  useEffect(() => {
    if (!videoProps || historyStack.length > 0) return
    setHistoryStack([videoProps])
    setHistoryIndex(0)
    setLastSavedProps(videoProps)
  }, [videoProps?.scenes?.length])

  // Schedule autosave when dirty
  useEffect(() => {
    if (isDirty) {
      scheduleAutosave()
    }
  }, [isDirty, scheduleAutosave])

  // Cleanup autosave timeout on unmount
  useEffect(() => {
    return () => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current)
      }
    }
  }, [])

  // beforeunload warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault()
        e.returnValue = 'Bạn có thay đổi chưa lưu. Bạn chắc chắn muốn rời trang?'
        return e.returnValue
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  useEffect(() => {
    if (!timelineDrag) return
    const onMove = (event: MouseEvent) => {
      const nextMs = getTimelineMsFromClientX(event.clientX)
      if (timelineDrag.mode === 'seek') {
        seekToMs(nextMs, true)
        return
      }

      const scene = scenes[timelineDrag.sceneIndex]
      if (!scene) return
      if (timelineDrag.mode === 'trim-start') {
        updateSceneTiming(timelineDrag.sceneIndex, nextMs, scene.end_ms, true)
      } else {
        updateSceneTiming(timelineDrag.sceneIndex, scene.start_ms, nextMs, true)
      }
    }
    const onUp = () => setTimelineDrag(null)

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [timelineDrag, scenes, getTimelineMsFromClientX, seekToMs, updateSceneTiming])

  const handleSceneContextMenu = useCallback((event: React.MouseEvent, sceneIndex: number) => {
    event.preventDefault()
    setContextMenu({ x: event.clientX, y: event.clientY, sceneIndex })
  }, [])

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
    }
  }, [contextMenu])

  const handleCtaUpload = async (file: File) => {
    if (!videoProps) return
    const form = new FormData()
    form.append('file', file)
    try {
      toast.info('Đang tải...')
      const result = await api.post(`/jobs/${jobId}/cta/upload`, form)
      const settings = { ...((videoProps as any).settings || {}) }
      const cta = { ...(settings.cta || {}) }
      cta.media_url = result.media_url
      cta.media_type = result.media_type
      settings.cta = cta
      onPropsUpdate({ ...videoProps, settings } as any)
      toast.success('Đã tải lên!')
    } catch (err: any) {
      showErrorToast(err, {
        source: 'review_cta_upload',
        jobId,
        fallback: 'Tải lên thất bại',
        prefix: 'Tải lên thất bại',
      })
    }
  }

  const applyStoryBeatsFallback = useCallback(async (
    sceneIndex: number,
    messages?: { loading?: string; success?: string; error?: string },
  ) => {
    if (!videoProps) return

    toast.info(messages?.loading || 'Đang tạo cảnh emoji động từ narration...')

    try {
      const result = await api.post(`/jobs/${jobId}/scenes/${sceneIndex}/apply-story-beats`, {})
      const newProps = { ...videoProps }
      const latestScenes = [...newProps.scenes]
      const targetScene = latestScenes[sceneIndex]
      if (!targetScene) return

      latestScenes[sceneIndex] = {
        ...targetScene,
        scene_type: 'story_beats',
        story_beats: result.story_beats,
        media_url: null,
        media_type: null,
        poster_url: null,
        layout: 'vertical_stack',
      }

      onPropsUpdate({ ...newProps, scenes: latestScenes })
      toast.success(messages?.success || `Đã tạo ${result.beat_count} đoạn emoji!`)
    } catch (err: any) {
      showErrorToast(err, {
        source: 'review_story_beats',
        jobId,
        fallback: messages?.error || 'Không tạo được cảnh emoji động.',
        prefix: messages?.error || 'Không tạo được cảnh emoji động.',
      })
    }
  }, [videoProps, jobId, onPropsUpdate])

  // Compute media dependency before early return (hooks must be unconditional).
  // StockBackground center_focus does not load external media in render path.
  const currentSceneForMedia = videoProps?.scenes?.[selectedSceneIndex]
  const currentPreviewUrl = currentSceneForMedia ? getPreviewUrl(currentSceneForMedia) : null
  const currentSceneType = currentSceneForMedia?.scene_type || ''
  const currentStockLayout = getStockBackgroundLayout(currentSceneForMedia)
  const currentSceneLoadsMedia = !!currentPreviewUrl && (
    currentSceneType === 'media_showcase' ||
    (currentSceneType === 'stock_background' && currentStockLayout === 'media_overlay')
  )
  const mediaStateKey = `${selectedSceneIndex}:${currentSceneType}:${currentStockLayout}:${currentSceneLoadsMedia ? currentPreviewUrl : 'static'}`

  // Reset media state when scene changes
  useEffect(() => {
    setMediaLoading(currentSceneLoadsMedia)
    setMediaError(false)
  }, [currentSceneLoadsMedia, mediaStateKey])

  useEffect(() => {
    currentMsRef.current = currentMs
  }, [currentMs])

  useEffect(() => {
    if (!selectedScene) return
    setCurrentMs((prev) => {
      if (prev < selectedScene.start_ms || prev > selectedScene.end_ms) return selectedScene.start_ms
      return prev
    })
  }, [selectedSceneIndex, selectedScene?.start_ms, selectedScene?.end_ms])

  useEffect(() => {
    if (!isPlaying || !selectedScene) return
    playStartPerfRef.current = performance.now()
    playStartMsRef.current = clampNumber(currentMsRef.current, selectedScene.start_ms, selectedScene.end_ms)

    const tick = (now: number) => {
      if (!selectedScene) return
      const elapsed = now - playStartPerfRef.current
      const next = playStartMsRef.current + elapsed
      const clamped = Math.min(next, selectedScene.end_ms)

      // Limit React updates to ~30fps for smoother playback in heavy review UI.
      if (
        clamped - currentMsRef.current >= 33 ||
        clamped <= selectedScene.start_ms ||
        clamped === selectedScene.end_ms
      ) {
        currentMsRef.current = clamped
        setCurrentMs(clamped)
      }

      // Keep audio aligned, but don't seek on every frame.
      const audio = audioRef.current
      if (audio && audioSrc && audioReady && now - lastAudioSyncAtRef.current > 250) {
        const desiredSec = clampNumber(clamped, 0, totalDurationMs) / 1000
        if (Math.abs(audio.currentTime - desiredSec) > 0.12) {
          audio.currentTime = desiredSec
        }
        lastAudioSyncAtRef.current = now
      }

      if (next >= selectedScene.end_ms) {
        currentMsRef.current = selectedScene.end_ms
        setCurrentMs(selectedScene.end_ms)
        setIsPlaying(false)
        return
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [isPlaying, selectedSceneIndex, selectedScene?.start_ms, selectedScene?.end_ms, audioSrc, audioReady, totalDurationMs])

  useEffect(() => {
    let cancelled = false
    setAudioReady(false)
    const fromProps = resolveAudioPreviewUrl(videoProps?.audio_url, jobId)
    if (fromProps) {
      setAudioSrc(fromProps)
      return
    }

    api.get(`/jobs/${jobId}`).then((job: any) => {
      if (cancelled) return
      const resolved = resolveAudioPreviewUrl(job?.props?.audio_url || null, jobId)
      setAudioSrc(resolved)
    }).catch(() => {
      if (!cancelled) setAudioSrc(null)
    })

    return () => { cancelled = true }
  }, [videoProps?.audio_url, jobId])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !audioSrc || !audioReady) return

    const desiredSec = clampNumber(currentMsRef.current, 0, totalDurationMs) / 1000

    if (!isPlaying) {
      audio.pause()
      if (Math.abs(audio.currentTime - desiredSec) > 0.02) {
        audio.currentTime = desiredSec
      }
      return
    }

    if (Math.abs(audio.currentTime - desiredSec) > 0.12) {
      audio.currentTime = desiredSec
    }
    audio.play().catch(() => {
      setIsPlaying(false)
    })
  }, [isPlaying, audioSrc, audioReady, totalDurationMs])

  useEffect(() => {
    if (isPlaying) return
    const audio = audioRef.current
    if (!audio || !audioSrc || !audioReady) return
    const desiredSec = clampNumber(currentMs, 0, totalDurationMs) / 1000
    if (Math.abs(audio.currentTime - desiredSec) > 0.01) {
      audio.currentTime = desiredSec
    }
  }, [currentMs, isPlaying, audioSrc, audioReady, totalDurationMs])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isTypingTarget = !!target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      )

      // Undo: Cmd/Ctrl+Z
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault()
        handleUndo()
        return
      }

      // Redo: Cmd/Ctrl+Shift+Z
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && event.shiftKey) {
        event.preventDefault()
        handleRedo()
        return
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        saveDraft()
        return
      }

      if (isTypingTarget) return

      if (event.code === 'Space') {
        event.preventDefault()
        setIsPlaying((prev) => !prev)
        return
      }

      if (event.key === 'ArrowLeft') {
        if (!scenes.length) return
        event.preventDefault()
        const nextIndex = Math.max(0, selectedSceneIndex - 1)
        onSelectScene(nextIndex)
        if (scenes[nextIndex]) setCurrentMs(scenes[nextIndex].start_ms)
        return
      }

      if (event.key === 'ArrowRight') {
        if (!scenes.length) return
        event.preventDefault()
        const nextIndex = Math.min(scenes.length - 1, selectedSceneIndex + 1)
        onSelectScene(nextIndex)
        if (scenes[nextIndex]) setCurrentMs(scenes[nextIndex].start_ms)
        return
      }

      if (event.key === 'Delete') {
        event.preventDefault()
        handleDeleteScene(selectedSceneIndex)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [saveDraft, scenes, selectedSceneIndex, onSelectScene, handleDeleteScene, handleUndo, handleRedo])

  if (!videoProps) return null

  const handleRender = async () => {
    setIsPlaying(false)
    if (missingMediaSceneIndexes.length > 0) {
      const indices = missingMediaSceneIndexes.map((sceneIndex) => sceneIndex + 1).join(', ')
      toast.warning(`Cảnh ${indices} chưa có phương tiện — sẽ dùng nền gradient tự động.`)
    }

    setRendering(true)
    try {
      await api.patch(`/jobs/${jobId}/props`, {
        scenes: buildScenesForPatch(videoProps.scenes),
        settings: (videoProps as any).settings || {},
        color_palette: (videoProps as any).color_palette || undefined,
      })
      // Step 2: Then trigger render
      await api.post(`/jobs/${jobId}/render`, {})
      toast.success('Bắt đầu kết xuất video!')
      onRenderStart()
    } catch (err: any) {
      console.error('[handleRender] failed:', err)
      showErrorToast(err, {
        source: 'review_render',
        jobId,
        fallback: 'Kết xuất thất bại',
        prefix: 'Kết xuất thất bại',
        duration: 6000,
      })
      setRendering(false)
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 border-t animate-in slide-in-from-bottom-2 duration-500 relative" style={{ background: 'var(--surface-1)', borderColor: 'var(--border-subtle)' }}>
      <div className="pointer-events-none absolute -top-16 left-1/2 h-56 w-[30rem] -translate-x-1/2 rounded-full blur-3xl opacity-30" style={{ background: 'var(--gradient-glow)' }} />
      {/* Main Studio Area */}
      <div
        className="grid flex-1 min-h-0 overflow-hidden"
        style={{
          gridTemplateColumns: isThreeColumnLayout
            ? `${leftWidth}px minmax(0, 1fr) ${rightWidth}px`
            : isTabletLayout
              ? '60px minmax(0, 1fr) 280px'
              : 'minmax(0, 1fr)',
        }}
      >

        {!isThreeColumnLayout && leftPanelOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[1px]"
            onClick={() => setLeftPanelOpen(false)}
          />
        )}

        {isTabletLayout && (
          <div className="border-r h-full flex flex-col items-center py-3 gap-2" style={{ background: 'color-mix(in srgb, var(--surface-2) 70%, transparent)', borderColor: 'var(--border-subtle)' }}>
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-10 w-10 focus-visible:ring-2 focus-visible:ring-primary/40"
              onClick={() => setLeftPanelOpen(true)}
              title="Mở danh sách cảnh"
              aria-label="Mở danh sách cảnh"
            >
              <ListVideo className="w-4 h-4 text-primary" />
            </Button>
            <Badge variant="outline" className="text-xs font-mono h-6">
              {scenes.length}
            </Badge>
            {missingMediaSceneIndexes.length > 0 && (
              <Badge variant="destructive" className="text-xs font-mono h-5">
                {missingMediaSceneIndexes.length} media
              </Badge>
            )}
            {longNarrationSceneIndexes.length > 0 && (
              <Badge className="text-xs font-mono h-5 bg-amber-500 text-black hover:bg-amber-500">
                {longNarrationSceneIndexes.length} lời thoại dài
              </Badge>
            )}
          </div>
        )}

        {/* LEFT PANE: Scene Selection */}
        <div
          className={cn(
            'border-r flex flex-col min-h-0 overflow-hidden',
            isThreeColumnLayout
              ? 'relative'
              : 'fixed left-0 top-0 bottom-0 z-50 w-[min(92vw,340px)] shadow-2xl transition-transform duration-200 ease-out',
            !isThreeColumnLayout && !leftPanelOpen && '-translate-x-full',
            !isThreeColumnLayout && leftPanelOpen && 'translate-x-0'
          )}
          style={{ background: 'color-mix(in srgb, var(--surface-0) 92%, transparent)', borderColor: 'var(--border-subtle)' }}
        >
          <div className="p-4 border-b flex items-center justify-between font-semibold shrink-0" style={{ borderColor: 'var(--border-subtle)', background: 'color-mix(in srgb, var(--surface-0) 85%, transparent)' }}>
            <div className="flex items-center gap-2">
              <ListVideo className="w-4 h-4 text-primary" />
              <span className="text-sm">Cảnh quay ({scenes.length})</span>
              {missingMediaSceneIndexes.length > 0 && (
                <Badge variant="destructive" className="text-xs h-5">
                  {missingMediaSceneIndexes.length} thiếu phương tiện
                </Badge>
              )}
              {longNarrationSceneIndexes.length > 0 && (
                <Badge className="text-xs h-5 bg-amber-500 text-black hover:bg-amber-500">
                  {longNarrationSceneIndexes.length} lời thoại dài
                </Badge>
              )}
            </div>
            {isThreeColumnLayout ? (
              isSaving ? (
                <Badge variant="secondary" className="text-xs uppercase font-mono gap-1 animate-pulse">
                  <LoaderCircle className="w-3 h-3 animate-spin" />
                  Đang lưu...
                </Badge>
              ) : isDirty ? (
                <Badge variant="destructive" className="text-xs uppercase font-mono">
                  Có thay đổi
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs uppercase font-mono">
                  Đã lưu
                </Badge>
              )
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setLeftPanelOpen(false)}
              >
                Đóng
              </Button>
            )}
          </div>
          <ScrollArea className="flex-1 min-h-0">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSceneDragEnd}>
              <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                <div className="p-2 space-y-1">
                  {scenes.map((scene, index) => (
                    <SortableSceneCard
                      key={`scene-card-${index}`}
                      id={`scene-${index}`}
                      scene={scene}
                      index={index}
                      isActive={selectedSceneIndex === index}
                      hasMissingMedia={missingMediaSceneSet.has(index)}
                      hasLongNarrationWarning={longNarrationSceneSet.has(index)}
                      onSelect={() => {
                        onSelectScene(index)
                        setCurrentMs(scene.start_ms)
                        if (!isThreeColumnLayout) setLeftPanelOpen(false)
                      }}
                      onContextMenu={(e) => handleSceneContextMenu(e, index)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </ScrollArea>
          {isThreeColumnLayout && (
            <div
              className="absolute right-0 top-0 bottom-0 w-3 cursor-col-resize z-20 flex items-stretch justify-center group"
              onMouseDown={(e) => {
                e.preventDefault()
                leftResizingRef.current = true
                resizeStartXRef.current = e.clientX
                resizeStartWidthRef.current = leftWidth
                document.body.style.cursor = 'col-resize'
                document.body.style.userSelect = 'none'
              }}
            >
              <div className="w-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 rounded-full my-6" style={{ background: 'var(--primary)' }} />
            </div>
          )}
        </div>

        {/* MIDDLE PANE: Video Preview + Player */}
        <div className="flex flex-col p-3 sm:p-4 lg:p-4 relative overflow-y-auto overflow-x-hidden min-h-0" style={{ background: 'color-mix(in srgb, var(--surface-1) 75%, transparent)' }}>
          <div className="flex flex-col items-center w-full">
            {isMobileLayout && (
              <div className="w-full max-w-[420px] flex items-center justify-between gap-2 pb-3 shrink-0">
                <Button variant="outline" size="sm" className="gap-2" onClick={() => setLeftPanelOpen(true)} aria-label="Mở danh sách cảnh">
                  <ListVideo className="w-4 h-4" />
                  Cảnh
                </Button>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => setRightPanelOpen(true)} aria-label="Mở thiết lập cảnh và video">
                  <Settings2 className="w-4 h-4" />
                  Thiết lập
                </Button>
              </div>
            )}

            <div className={cn(
              'relative isolate aspect-[9/16] border shadow-2xl rounded-2xl overflow-hidden bg-black group-hover:ring-1 ring-white/10 transition-all shrink-0',
              isMobileLayout ? 'w-full max-w-[420px]' : 'w-full max-w-[300px]'
            )}>
              {/* Custom background layer behind all scene content */}
              {(videoProps as any).settings?.custom_background_url && (
                <div className="absolute inset-0 -z-10">
                  {(videoProps as any).settings?.custom_background_type === 'video' ? (
                    <video
                      src={((videoProps as any).settings.custom_background_url || '').startsWith('/api/')
                        ? (videoProps as any).settings.custom_background_url
                        : `/api/demo/${(videoProps as any).settings.custom_background_url}`}
                      className="w-full h-full object-cover"
                      autoPlay muted loop playsInline
                    />
                  ) : (
                    <img
                      src={((videoProps as any).settings.custom_background_url || '').startsWith('/api/')
                        ? (videoProps as any).settings.custom_background_url
                        : `/api/demo/${(videoProps as any).settings.custom_background_url}`}
                      className="w-full h-full object-cover"
                      alt=""
                    />
                  )}
                  <div className="absolute inset-0 bg-black/20" />
                </div>
              )}
              {(() => {
                const previewUrl = getPreviewUrl(selectedScene)
                const sceneType = selectedScene?.scene_type || ''
                const stockLayout = getStockBackgroundLayout(selectedScene)
                const sceneNeedsMediaLoad = !!previewUrl && (
                  sceneType === 'media_showcase' ||
                  (sceneType === 'stock_background' && stockLayout === 'media_overlay')
                )
                const primary = palette.primary || '#6366f1'
                const secondary = palette.secondary
                const onLoad = () => setMediaLoading(false)
                const onError = () => { setMediaLoading(false); setMediaError(true) }
                const settings = (videoProps as any).settings
                const sceneDuration = Math.max(1, (selectedScene?.end_ms || 0) - (selectedScene?.start_ms || 0))
                const sceneProgress = clampNumber(((currentMs || 0) - (selectedScene?.start_ms || 0)) / sceneDuration, 0, 1)

                // media_showcase has unique cinema/fit/fullscreen layouts — kept inline.
                if (sceneType === 'media_showcase' && previewUrl) {
                  const layout = selectedScene?.media_layout || 'cinema'
                  return (
                    <>
                      {mediaLoading && !mediaError && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-30">
                          <LoaderCircle className="w-6 h-6 animate-spin text-primary" />
                        </div>
                      )}
                      {mediaError && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/60 backdrop-blur-sm z-50 gap-3">
                          <AlertTriangle className="w-8 h-8 text-destructive/80" />
                          <span className="text-sm font-medium text-muted-foreground">Phương tiện không tải được</span>
                          <div className="flex gap-2 mt-2">
                            <Button size="sm" variant="outline" className="bg-background/50 h-8 hover:bg-background/80" onClick={(e) => { e.stopPropagation(); handleRetryMedia(selectedSceneIndex); }}>
                              <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Thử lại
                            </Button>
                            <Button size="sm" className="h-8 shadow-lg hover:scale-105 transition-transform" onClick={(e) => { e.stopPropagation(); void handleQuickReSearch(selectedSceneIndex); }}>
                              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Tìm Media khác
                            </Button>
                          </div>
                        </div>
                      )}
                      {layout === 'cinema' ? (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-4"
                          style={{ background: (videoProps as any).settings?.custom_background_url ? 'transparent' : (palette.background || '#0a0a0a') }}>
                          <p className="text-sm font-bold text-center px-6 line-clamp-2"
                            style={{ color: palette.text || '#fff' }}>
                            {selectedScene?.visual_description || selectedScene?.narration}
                          </p>
                          <div className="w-[85%] aspect-video rounded-xl overflow-hidden shadow-2xl border border-white/10 relative">
                            {selectedScene!.media_type === 'video' ? (
                              <video key={previewUrl} src={previewUrl} autoPlay muted loop playsInline
                                className="w-full h-full object-cover"
                                onLoadedData={onLoad} onError={onError} />
                            ) : (
                              <img key={previewUrl} src={previewUrl} alt=""
                                className="w-full h-full object-cover"
                                onLoad={onLoad} onError={onError} />
                            )}
                          </div>
                        </div>
                      ) : layout === 'fit' ? (
                        <div className="w-full h-full flex items-center justify-center"
                          style={{ background: (videoProps as any).settings?.custom_background_url ? 'transparent' : (palette.background || '#0a0a0a') }}>
                          {selectedScene!.media_type === 'video' ? (
                            <video key={previewUrl} src={previewUrl} autoPlay muted loop playsInline
                              className="w-full" style={{ objectFit: 'contain' }}
                              onLoadedData={onLoad} onError={onError} />
                          ) : (
                            <img key={previewUrl} src={previewUrl} alt=""
                              className="w-full" style={{ objectFit: 'contain' }}
                              onLoad={onLoad} onError={onError} />
                          )}
                        </div>
                      ) : (
                        // fullscreen
                        selectedScene!.media_type === 'video' ? (
                          <video key={previewUrl} src={previewUrl} autoPlay muted loop playsInline
                            className="w-full h-full object-cover"
                            onLoadedData={onLoad} onError={onError} />
                        ) : (
                          <img key={previewUrl} src={previewUrl} alt=""
                            className="w-full h-full object-cover"
                            onLoad={onLoad} onError={onError} />
                        )
                      )}
                      <WatermarkPreview settings={settings} primary={primary} />
                      <ProgressBarPreview primary={primary} secondary={secondary} progress={sceneProgress} />
                    </>
                  )
                }

                // All other scene types: render-accurate preview matching Remotion output.
                return (
                  <>
                    {sceneNeedsMediaLoad && mediaLoading && !mediaError && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-30">
                        <LoaderCircle className="w-6 h-6 animate-spin text-primary" />
                      </div>
                    )}
                    <ScenePreview
                      scene={selectedScene}
                      palette={palette}
                      settings={settings}
                      mediaUrl={previewUrl}
                      mediaLoading={mediaLoading}
                      mediaError={mediaError}
                      progress={sceneProgress}
                      playing={isPlaying}
                      onMediaLoad={onLoad}
                      onMediaError={onError}
                      onRetry={() => handleRetryMedia(selectedSceneIndex)}
                      onReSearch={() => { void handleQuickReSearch(selectedSceneIndex); }}
                    />
                  </>
                )
              })()}

              <div
                className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/40 cursor-pointer"
                onClick={() => {
                  if (!selectedScene) return
                  if (!isPlaying && currentMs >= selectedScene.end_ms) {
                    setCurrentMs(selectedScene.start_ms)
                  }
                  setIsPlaying((prev) => !prev)
                }}
              >
                <div className="bg-white/10 backdrop-blur-xl p-5 rounded-full border border-white/20 shadow-2xl transform scale-90 hover:scale-100 transition-transform">
                  {isPlaying
                    ? <Pause size={40} className="text-white" />
                    : <Play size={40} className="text-white fill-white ml-1.5" />}
                </div>
              </div>
            </div>

            <ScenePlayer
              isPlaying={isPlaying}
              currentMs={currentMs}
              sceneStartMs={selectedSceneStartMs}
              sceneEndMs={selectedSceneEndMs}
              onToggle={() => {
                if (!selectedScene) return
                if (!isPlaying && currentMs >= selectedScene.end_ms) {
                  setCurrentMs(selectedScene.start_ms)
                }
                setIsPlaying((prev) => !prev)
              }}
              onSeek={(ms) => {
                setIsPlaying(false)
                seekToMs(ms, true)
              }}
            />

            <TimelineRuler
              scenes={scenes}
              selectedSceneIndex={selectedSceneIndex}
              totalDurationMs={Math.max(1, totalDurationMs)}
              currentMs={currentMs}
              timelineRef={timelineRef}
              onSeekPointerDown={handleTimelineSeekMouseDown}
              onSceneClick={(index) => {
                onSelectScene(index)
                if (scenes[index]) setCurrentMs(scenes[index].start_ms)
                setIsPlaying(false)
              }}
              onTrimHandleMouseDown={handleTrimHandleMouseDown}
              onSceneContextMenu={(event, index) => handleSceneContextMenu(event, index)}
            />

            <div className="mt-1 flex flex-wrap items-center justify-center gap-1">
              <span className="text-[10px] font-mono text-muted-foreground">
                ⏱ {(selectedScene?.start_ms / 1000).toFixed(1)}s → {(selectedScene?.end_ms / 1000).toFixed(1)}s
              </span>
              <span className="text-[10px] text-muted-foreground">•</span>
              <span className="text-[10px] text-muted-foreground capitalize">
                🎬 {selectedScene?.media_type || 'Phương tiện'}
              </span>
              {audioSrc && (
                <>
                  <span className="text-[10px] text-muted-foreground">•</span>
                  <span className="text-[10px] text-muted-foreground">
                    🔊 {audioReady ? 'Sẵn sàng' : 'Đang tải'}
                  </span>
                </>
              )}
              <span className="text-[10px] text-muted-foreground">•</span>
              <span className="inline-flex items-center gap-0.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-4 w-4 p-0 text-muted-foreground hover:text-foreground"
                  disabled={historyIndex <= 0}
                  onClick={handleUndo}
                  title="Hoàn tác (Cmd/Ctrl+Z)"
                  aria-label="Hoàn tác"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                </Button>
                <span className="text-[10px] text-muted-foreground">{historyIndex + 1}/{historyStack.length}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-4 w-4 p-0 text-muted-foreground hover:text-foreground"
                  disabled={historyIndex >= historyStack.length - 1}
                  onClick={handleRedo}
                  title="Làm lại (Cmd/Ctrl+Shift+Z)"
                  aria-label="Làm lại"
                >
                  <RotateCw className="w-2.5 h-2.5" />
                </Button>
              </span>
            </div>

            <audio
              ref={audioRef}
              src={audioSrc || undefined}
              preload="auto"
              className="hidden"
              onCanPlay={() => setAudioReady(true)}
              onError={() => setAudioReady(false)}
            />

            <div className="w-full mt-1 max-w-2xl mx-auto">
              <RenderReadinessStrip
                requiredMediaCount={requiredMediaSceneIndexes.length}
                readyMediaCount={readyMediaCount}
                missingMediaSceneIndexes={missingMediaSceneIndexes}
                missingNarrationSceneIndexes={missingNarrationSceneIndexes}
                warningSceneItems={warningSceneItems}
                onSeekScene={jumpToScene}
              />
            </div>
          </div>
        </div>

        {isMobileLayout && rightPanelOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[1px]"
            onClick={() => setRightPanelOpen(false)}
          />
        )}

        {/* RIGHT PANE: Property Editor */}
        <div
          className={cn(
            'border-l flex flex-col min-h-0 backdrop-blur-sm h-full overflow-hidden',
            isMobileLayout
              ? 'fixed inset-x-0 bottom-0 z-50 h-[78vh] max-h-[760px] border-l-0 border-t rounded-t-2xl shadow-2xl transition-transform duration-200 ease-out'
              : 'relative',
            isMobileLayout && !rightPanelOpen && 'translate-y-full',
            isMobileLayout && rightPanelOpen && 'translate-y-0'
          )}
          style={{ background: 'color-mix(in srgb, var(--surface-0) 92%, transparent)', borderColor: 'var(--border-subtle)' }}
        >
          {isThreeColumnLayout && (
            <div
              className="absolute left-0 top-0 bottom-0 w-3 cursor-col-resize z-20 flex items-stretch justify-center group"
              onMouseDown={(e) => {
                e.preventDefault()
                rightResizingRef.current = true
                resizeStartXRef.current = e.clientX
                resizeStartWidthRef.current = rightWidth
                document.body.style.cursor = 'col-resize'
                document.body.style.userSelect = 'none'
              }}
            >
              <div className="w-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 rounded-full my-6" style={{ background: 'var(--primary)' }} />
            </div>
          )}
          <div className="p-4 border-b flex items-center gap-2 font-semibold shrink-0" style={{ borderColor: 'var(--border-subtle)', background: 'color-mix(in srgb, var(--surface-0) 90%, transparent)' }}>
            <Settings2 className="w-4 h-4 text-primary" />
            <span className="text-sm">Thiết lập</span>
            <Badge variant="outline" className="ml-auto text-xs uppercase font-mono">
              {rightPanelTab === 'scene' ? `Cảnh ${selectedSceneIndex + 1}` : 'Toàn bộ cảnh'}
            </Badge>
            {isMobileLayout && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setRightPanelOpen(false)}
              >
                Đóng
              </Button>
            )}
          </div>

          <Tabs
            value={rightPanelTab}
            onValueChange={(val) => setRightPanelTab((val as 'scene' | 'video'))}
            className="flex-1 flex flex-col min-h-0 overflow-hidden"
          >
            <div className="px-4 pt-4 shrink-0">
              <TabsList className="grid w-full grid-cols-2 bg-muted/30">
                <TabsTrigger value="scene">Cảnh</TabsTrigger>
                <TabsTrigger value="video">Toàn video</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="scene" className="flex-1 flex flex-col min-h-0 mt-0">
              <ScrollArea className="flex-1 min-h-0">
                <div className="p-4 space-y-6">
                  <div className="space-y-3">
                    <Label htmlFor="narration" className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Lời thoại</Label>
                    <Textarea
                      id="narration"
                      value={selectedScene?.narration || ''}
                      onChange={(e) => {
                        const newProps = { ...videoProps }
                        const updatedScenes = [...newProps.scenes]
                        updatedScenes[selectedSceneIndex] = { ...selectedScene, narration: e.target.value }
                        onPropsUpdate({ ...newProps, scenes: updatedScenes })
                      }}
                      className="min-h-[140px] resize-none leading-relaxed text-sm bg-muted/20 border-white/5 focus-visible:ring-primary/20"
                      placeholder="Nhập lời thoại..."
                    />
                  </div>

                  {/* Visual description — editable for non-media scenes */}
                  {!NEEDS_MEDIA.has(selectedScene?.scene_type || '') && (
                    <div className="space-y-3">
                      <Label htmlFor="visual-desc" className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Mô tả hình ảnh</Label>
                      <Textarea
                        id="visual-desc"
                        value={(selectedScene as any)?.visual_description || ''}
                        onChange={(e) => {
                          const newProps = { ...videoProps }
                          const updatedScenes = [...newProps.scenes]
                          updatedScenes[selectedSceneIndex] = { ...selectedScene, visual_description: e.target.value } as any
                          onPropsUpdate({ ...newProps, scenes: updatedScenes })
                        }}
                        className="min-h-[80px] resize-none leading-relaxed text-sm bg-muted/20 border-white/5 focus-visible:ring-primary/20"
                        placeholder="Mô tả nội dung hiển thị trên cảnh..."
                      />
                      <p className="text-xs text-muted-foreground">Text hiển thị trên cảnh trong video. Sửa trực tiếp tại đây.</p>
                    </div>
                  )}

                  <div className="space-y-3">
                    <Label className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Thời lượng cảnh (ms)</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Bắt đầu (ms)</span>
                        <Input
                          type="number"
                          min={0}
                          value={selectedScene?.start_ms ?? 0}
                          onChange={(e) => {
                            const nextStart = Number(e.target.value || 0)
                            const nextEnd = selectedScene?.end_ms ?? (nextStart + MIN_SCENE_MS)
                            updateSceneTiming(selectedSceneIndex, nextStart, nextEnd, true)
                          }}
                          className="h-8 bg-muted/20 border-white/5"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Kết thúc (ms)</span>
                        <Input
                          type="number"
                          min={MIN_SCENE_MS}
                          value={selectedScene?.end_ms ?? MIN_SCENE_MS}
                          onChange={(e) => {
                            const nextEnd = Number(e.target.value || MIN_SCENE_MS)
                            const nextStart = selectedScene?.start_ms ?? 0
                            updateSceneTiming(selectedSceneIndex, nextStart, nextEnd, true)
                          }}
                          className="h-8 bg-muted/20 border-white/5"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">Có thể kéo 2 cạnh của cảnh trên dòng thời gian để chỉnh trực quan.</p>
                  </div>

                  <Separator className="bg-white/5" />

                  <div className="space-y-3">
                    <Label className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Loại cảnh</Label>
                    {storyBeatsSuggestion && (
                      <div className="p-3 rounded-xl border border-amber-500/25 bg-amber-500/10">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs text-amber-300 font-semibold flex items-center gap-2">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              Media có thể không khớp — chuyển sang Cảnh emoji động?
                            </p>
                            {storyBeatsSuggestion.signals && storyBeatsSuggestion.signals.length > 0 && (
                              <p className="mt-1 text-[11px] text-amber-100/80">
                                Tín hiệu: {storyBeatsSuggestion.signals.map(translateAuditSignal).join(', ')}
                              </p>
                            )}
                          </div>
                          <Button
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => {
                              void applyStoryBeatsFallback(selectedSceneIndex, {
                                loading: 'Đang chuyển sang Cảnh emoji động...',
                                success: 'Đã chuyển sang Cảnh emoji động.',
                              })
                            }}
                          >
                            Chuyển
                          </Button>
                        </div>
                      </div>
                    )}
                    <Select
                      value={selectedScene?.scene_type || 'stock_background'}
                      onValueChange={(val) => {
                        if (!val) return
                        const newProps = { ...videoProps }
                        const updatedScenes = [...newProps.scenes]
                        const oldType = selectedScene?.scene_type || ''
                        const newNeedsMedia = NEEDS_MEDIA.has(val)
                        const oldNeedsMedia = NEEDS_MEDIA.has(oldType)

                        const nextScene: any = {
                          ...selectedScene,
                          scene_type: val,
                          ...(!newNeedsMedia && oldNeedsMedia ? { media_url: null, media_type: null, poster_url: null } : {}),
                        }

                        // Set correct default layout for the new scene type
                        if (val === 'stock_background') {
                          nextScene.layout = 'media_overlay'
                        } else if (val === 'title_card') {
                          nextScene.layout = nextScene.layout || 'news_intro'
                        } else {
                          // Reset layout for types that don't use it (or use a different key)
                          nextScene.layout = null
                        }

                        if (val === 'media_showcase' && !nextScene.media_layout) {
                          nextScene.media_layout = 'cinema'
                        }

                        // Apply pre-computed alt_data for instant type-switching
                        const altEntry = nextScene._alt_data?.[val];
                        if (altEntry && typeof altEntry === 'object' && Object.keys(altEntry).length > 0) {
                          Object.assign(nextScene, altEntry);
                          toast.success('Đã áp dụng nội dung cho loại cảnh mới!');
                        }

                        updatedScenes[selectedSceneIndex] = nextScene
                        onPropsUpdate({ ...newProps, scenes: updatedScenes })

                        if (newNeedsMedia && !selectedScene?.media_url) {
                          const searchQuery = selectedScene?.image_query || selectedScene?.video_query || (selectedScene as any)?.semantic_image_query || ''
                          if (searchQuery) {
                            toast.info('Đang tìm phương tiện phù hợp...')
                            api.post(`/jobs/${jobId}/scenes/${selectedSceneIndex}/re-search`, {
                              image_query: searchQuery,
                              video_query: searchQuery,
                            }).then(result => {
                              const updatedProps = { ...newProps }
                              const latestScenes = [...updatedProps.scenes]
                              latestScenes[selectedSceneIndex] = {
                                ...latestScenes[selectedSceneIndex],
                                scene_type: val,
                                media_url: result.media_url,
                                media_type: result.media_type,
                                poster_url: result.poster_url ?? null,
                              }
                              onPropsUpdate({ ...updatedProps, scenes: latestScenes })
                              toast.success('Đã tìm thấy phương tiện!')
                            }).catch(() => {
                              toast.error('Không tìm được phương tiện. Hãy thử đổi từ khóa hoặc tải file lên.')
                            })
                          } else {
                            toast.info('Cảnh này cần phương tiện. Hãy nhập từ khóa hoặc tải lên từ máy.')
                          }
                        }

                        // Cảnh emoji động: backend tách lời thoại thành các đoạn emoji
                        if (val === 'story_beats') {
                          void applyStoryBeatsFallback(selectedSceneIndex)
                        }
                      }}
                    >
                      <SelectTrigger className="bg-muted/20 border-white/5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(SCENE_TYPE_LABELS).map(([key, label]) => (
                          <SelectItem key={key} value={key}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator className="bg-white/5" />

                  {NEEDS_MEDIA.has(selectedScene?.scene_type || '') ? (
                    <>
                      <div className="space-y-4">
                        <Label className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Từ khóa tìm kiếm (phương tiện)</Label>
                        <SceneMediaSearch
                          key={selectedSceneIndex}
                          scene={selectedScene}
                          index={selectedSceneIndex}
                          jobId={jobId}
                          videoProps={videoProps}
                          onPropsUpdate={onPropsUpdate}
                        />
                      </div>

                      {!getPreviewUrl(selectedScene) && (
                        selectedScene?.scene_type === 'title_card' ? (
                          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg animate-in fade-in duration-200">
                            <p className="text-xs text-blue-400 flex items-center gap-2">
                              <ImageIcon className="w-3.5 h-3.5" />
                              Tùy chọn: Thêm ảnh/video nền để tăng sức hấp dẫn. Bỏ qua sẽ dùng gradient tự động.
                            </p>
                          </div>
                        ) : (
                          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg animate-in fade-in duration-200">
                            <p className="text-xs text-amber-400 flex items-center gap-2 mb-2">
                              <ImageIcon className="w-3.5 h-3.5" />
                              Cảnh này cần phương tiện nhưng chưa có
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Bấm vào "Từ khóa hiện tại" để tìm trên Pexels, hoặc kéo thả file vào đây.
                            </p>
                          </div>
                        )
                      )}
                    </>
                  ) : (
                    <div className="space-y-3">
                      <Label className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Phương tiện</Label>
                      <div className="p-4 bg-muted/30 rounded-xl border border-white/5 flex items-center gap-3">
                        <Palette className="w-4 h-4 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">Cảnh <span className="font-semibold capitalize">{SCENE_TYPE_LABELS[selectedScene?.scene_type || ''] || selectedScene?.scene_type}</span> dùng nền gradient tự động.</p>
                      </div>
                    </div>
                  )}

                  <Separator className="bg-white/5" />


                  {/* Comparison editor — [CryptoVN Custom] */}
                  {selectedScene?.scene_type === 'comparison' && (
                    <div className="space-y-3">
                      <Label className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Nội dung so sánh</Label>
                      {selectedScene?.comparison_sides ? (
                        <div className="grid grid-cols-2 gap-2">
                          {selectedScene.comparison_sides.map((side, i) => (
                            <div key={i} className="p-3 bg-muted/30 rounded-xl border border-white/5 space-y-2">
                              <Input
                                value={side.label}
                                maxLength={20}
                                onChange={(e) => {
                                  const newProps = { ...videoProps }
                                  const scenes = [...newProps.scenes]
                                  const sides = [...(selectedScene.comparison_sides || [])]
                                  sides[i] = { ...sides[i], label: e.target.value }
                                  scenes[selectedSceneIndex] = { ...selectedScene, comparison_sides: sides }
                                  onPropsUpdate({ ...newProps, scenes })
                                }}
                                className="h-7 text-xs font-bold text-primary bg-muted/20 border-white/5"
                              />
                              <div className="space-y-1">
                                {side.points.map((p, j) => (
                                  <div key={j} className="flex items-center gap-1">
                                    <span className="text-[10px] text-muted-foreground shrink-0">•</span>
                                    <Input
                                      value={p}
                                      maxLength={30}
                                      onChange={(e) => {
                                        const newProps = { ...videoProps }
                                        const scenes = [...newProps.scenes]
                                        const sides = [...(selectedScene.comparison_sides || [])]
                                        const points = [...sides[i].points]
                                        points[j] = e.target.value
                                        sides[i] = { ...sides[i], points }
                                        scenes[selectedSceneIndex] = { ...selectedScene, comparison_sides: sides }
                                        onPropsUpdate({ ...newProps, scenes })
                                      }}
                                      className="h-6 text-[11px] bg-muted/20 border-white/5 flex-1"
                                    />
                                    {side.points.length > 1 && (
                                      <button
                                        className="text-destructive/60 hover:text-destructive text-xs px-1"
                                        onClick={() => {
                                          const newProps = { ...videoProps }
                                          const scenes = [...newProps.scenes]
                                          const sides = [...(selectedScene.comparison_sides || [])]
                                          const points = sides[i].points.filter((_, k) => k !== j)
                                          sides[i] = { ...sides[i], points }
                                          scenes[selectedSceneIndex] = { ...selectedScene, comparison_sides: sides }
                                          onPropsUpdate({ ...newProps, scenes })
                                        }}
                                      >✕</button>
                                    )}
                                  </div>
                                ))}
                                {side.points.length < 5 && (
                                  <button
                                    className="text-[10px] text-primary/60 hover:text-primary"
                                    onClick={() => {
                                      const newProps = { ...videoProps }
                                      const scenes = [...newProps.scenes]
                                      const sides = [...(selectedScene.comparison_sides || [])]
                                      const points = [...sides[i].points, '']
                                      sides[i] = { ...sides[i], points }
                                      scenes[selectedSceneIndex] = { ...selectedScene, comparison_sides: sides }
                                      onPropsUpdate({ ...newProps, scenes })
                                    }}
                                  >+ Thêm điểm</button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <Button
                          variant="outline" size="sm" className="w-full text-xs"
                          onClick={() => {
                            const newProps = { ...videoProps }
                            const scenes = [...newProps.scenes]
                            scenes[selectedSceneIndex] = {
                              ...selectedScene,
                              comparison_sides: [
                                { label: 'Bên A', points: ['Điểm 1'] },
                                { label: 'Bên B', points: ['Điểm 1'] }
                              ]
                            }
                            onPropsUpdate({ ...newProps, scenes })
                          }}
                        >
                          + Thêm bảng so sánh
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Timeline editor — [CryptoVN Custom] */}
                  {selectedScene?.scene_type === 'timeline' && (
                    <div className="space-y-3">
                      <Label className="text-xs uppercase tracking-widest text-[var(--text-primary)] font-bold">Dòng thời gian</Label>
                      {selectedScene?.timeline_events ? (
                        <div className="space-y-1.5">
                          {selectedScene.timeline_events.map((ev, i) => (
                            <div key={i} className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg border border-white/5">
                              <Input
                                value={ev.label}
                                maxLength={10}
                                onChange={(e) => {
                                  const newProps = { ...videoProps }
                                  const scenes = [...newProps.scenes]
                                  const events = [...(selectedScene.timeline_events || [])]
                                  events[i] = { ...events[i], label: e.target.value }
                                  scenes[selectedSceneIndex] = { ...selectedScene, timeline_events: events }
                                  onPropsUpdate({ ...newProps, scenes })
                                }}
                                className="h-6 w-16 text-[9px] font-mono bg-muted/20 border-white/5 shrink-0"
                              />
                              <Input
                                value={ev.title}
                                maxLength={20}
                                onChange={(e) => {
                                  const newProps = { ...videoProps }
                                  const scenes = [...newProps.scenes]
                                  const events = [...(selectedScene.timeline_events || [])]
                                  events[i] = { ...events[i], title: e.target.value }
                                  scenes[selectedSceneIndex] = { ...selectedScene, timeline_events: events }
                                  onPropsUpdate({ ...newProps, scenes })
                                }}
                                className="h-6 flex-1 text-xs bg-muted/20 border-white/5"
                              />
                              <button
                                className="text-destructive/60 hover:text-destructive text-xs px-1 shrink-0"
                                onClick={() => {
                                  const newProps = { ...videoProps }
                                  const scenes = [...newProps.scenes]
                                  const events = (selectedScene.timeline_events || []).filter((_, k) => k !== i)
                                  scenes[selectedSceneIndex] = { ...selectedScene, timeline_events: events }
                                  onPropsUpdate({ ...newProps, scenes })
                                }}
                              >✕</button>
                            </div>
                          ))}
                          {(selectedScene.timeline_events?.length ?? 0) < 5 && (
                            <button
                              className="text-[10px] text-primary/60 hover:text-primary w-full text-center py-1"
                              onClick={() => {
                                const newProps = { ...videoProps }
                                const scenes = [...newProps.scenes]
                                const events = [...(selectedScene.timeline_events || []), { label: 'Mới', title: 'Sự kiện', description: '' }]
                                scenes[selectedSceneIndex] = { ...selectedScene, timeline_events: events }
                                onPropsUpdate({ ...newProps, scenes })
                              }}
                            >+ Thêm sự kiện</button>
                          )}
                        </div>
                      ) : (
                        <Button
                          variant="outline" size="sm" className="w-full text-xs"
                          onClick={() => {
                            const newProps = { ...videoProps }
                            const scenes = [...newProps.scenes]
                            scenes[selectedSceneIndex] = {
                              ...selectedScene,
                              timeline_events: [
                                { label: '2023', title: 'Sự kiện 1', description: '' }
                              ]
                            }
                            onPropsUpdate({ ...newProps, scenes })
                          }}
                        >
                          + Thêm sự kiện
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Stats editor */}
                  {selectedScene?.scene_type === 'stats_highlight' && (
                    <div className="space-y-3">
                      <Label className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Số liệu nổi bật</Label>
                      {selectedScene?.stats ? (
                        <div className="grid grid-cols-2 gap-2">
                          {(selectedScene.stats || []).map((stat: any, i: number) => (
                            <div key={i} className="p-2 bg-muted/30 rounded-xl border border-white/5 space-y-2">
                              <Input
                                value={stat.value}
                                onChange={(e) => {
                                  const scenes = [...videoProps.scenes]
                                  const stats = [...(selectedScene.stats || [])]
                                  stats[i] = { ...stats[i], value: e.target.value }
                                  scenes[selectedSceneIndex] = { ...selectedScene, stats }
                                  onPropsUpdate({ ...videoProps, scenes })
                                }}
                                className="h-7 text-xs font-bold text-primary bg-muted/20"
                                placeholder="VD: 85%"
                              />
                              <Input
                                value={stat.label}
                                onChange={(e) => {
                                  const scenes = [...videoProps.scenes]
                                  const stats = [...(selectedScene.stats || [])]
                                  stats[i] = { ...stats[i], label: e.target.value }
                                  scenes[selectedSceneIndex] = { ...selectedScene, stats }
                                  onPropsUpdate({ ...videoProps, scenes })
                                }}
                                className="h-6 text-[11px] bg-muted/20"
                                placeholder="Mô tả..."
                              />
                              <button
                                className="text-destructive/60 hover:text-destructive text-[10px] px-1 w-full text-right"
                                onClick={() => {
                                  const scenes = [...videoProps.scenes]
                                  const stats = (selectedScene.stats || []).filter((_: any, k: number) => k !== i)
                                  scenes[selectedSceneIndex] = { ...selectedScene, stats }
                                  onPropsUpdate({ ...videoProps, scenes })
                                }}
                              >Xóa</button>
                            </div>
                          ))}
                          {(selectedScene.stats?.length ?? 0) < 4 && (
                            <button
                              className="text-[10px] text-primary/60 hover:text-primary w-full text-center py-1 col-span-2"
                              onClick={() => {
                                const scenes = [...videoProps.scenes]
                                const stats = [...(selectedScene.stats || [])]
                                stats.push({ value: '100', label: 'Số liệu mới', color: '#6366f1' })
                                scenes[selectedSceneIndex] = { ...selectedScene, stats }
                                onPropsUpdate({ ...videoProps, scenes })
                              }}
                            >+ Thêm số liệu</button>
                          )}
                        </div>
                      ) : (
                        <Button
                          variant="outline" size="sm" className="w-full text-xs"
                          onClick={() => {
                            const newProps = { ...videoProps }
                            const scenes = [...newProps.scenes]
                            scenes[selectedSceneIndex] = {
                              ...selectedScene,
                              stats: [{ value: '100%', label: 'Ví dụ', color: '#6366f1' }]
                            }
                            onPropsUpdate({ ...newProps, scenes })
                          }}
                        >
                          + Thêm số liệu
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Story beats editor */}
                  {selectedScene?.scene_type === 'story_beats' && (
                    <div className="space-y-3">
                      <Label className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Cảnh emoji động</Label>
                      {selectedScene?.story_beats ? (
                        <div className="space-y-2">
                          {(selectedScene.story_beats || []).map((beat: any, i: number) => (
                            <div key={i} className="flex items-center gap-2">
                              <Input
                                value={beat.emoji}
                                onChange={(e) => {
                                  const scenes = [...videoProps.scenes]
                                  const beats = [...(selectedScene.story_beats || [])]
                                  beats[i] = { ...beats[i], emoji: e.target.value }
                                  scenes[selectedSceneIndex] = { ...selectedScene, story_beats: beats }
                                  onPropsUpdate({ ...videoProps, scenes })
                                }}
                                className="h-8 w-12 text-center text-lg bg-muted/20"
                              />
                              <Input
                                value={beat.text}
                                onChange={(e) => {
                                  const scenes = [...videoProps.scenes]
                                  const beats = [...(selectedScene.story_beats || [])]
                                  beats[i] = { ...beats[i], text: e.target.value }
                                  scenes[selectedSceneIndex] = { ...selectedScene, story_beats: beats }
                                  onPropsUpdate({ ...videoProps, scenes })
                                }}
                                className="h-8 flex-1 text-xs bg-muted/20"
                              />
                              <button
                                className="text-destructive/60 hover:text-destructive px-1 shrink-0"
                                onClick={() => {
                                  const scenes = [...videoProps.scenes]
                                  const beats = (selectedScene.story_beats || []).filter((_: any, k: number) => k !== i)
                                  scenes[selectedSceneIndex] = { ...selectedScene, story_beats: beats }
                                  onPropsUpdate({ ...videoProps, scenes })
                                }}
                              >✕</button>
                            </div>
                          ))}
                          <Button
                            variant="outline" size="sm" className="w-full text-xs"
                            onClick={() => {
                              const scenes = [...videoProps.scenes]
                              const beats = [...(selectedScene.story_beats || [])]
                              beats.push({ emoji: '✨', text: 'Nội dung mới', start_ms: 0, end_ms: 1000 })
                              scenes[selectedSceneIndex] = { ...selectedScene, story_beats: beats }
                              onPropsUpdate({ ...videoProps, scenes })
                            }}
                          >
                            + Thêm nhịp
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline" size="sm" className="w-full text-xs"
                          onClick={() => {
                            const newProps = { ...videoProps }
                            const scenes = [...newProps.scenes]
                            scenes[selectedSceneIndex] = {
                              ...selectedScene,
                              story_beats: [{ emoji: '✨', text: 'Ví dụ', start_ms: 0, end_ms: 1000 }]
                            }
                            onPropsUpdate({ ...newProps, scenes })
                          }}
                        >
                          + Thêm emoji
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Emoji grid editor */}
                  {selectedScene?.scene_type === 'emoji_grid' && (
                    <div className="space-y-3">
                      <Label className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Lưới Emoji</Label>
                      {selectedScene?.card_items ? (
                        <div className="space-y-2">
                          {(selectedScene.card_items || []).map((item: any, i: number) => (
                            <div key={i} className="flex items-center gap-2">
                              <Input
                                value={item.icon || item.emoji}
                                onChange={(e) => {
                                  const scenes = [...videoProps.scenes]
                                  const items = [...(selectedScene.card_items || [])]
                                  items[i] = { ...items[i], icon: e.target.value }
                                  scenes[selectedSceneIndex] = { ...selectedScene, card_items: items }
                                  onPropsUpdate({ ...videoProps, scenes })
                                }}
                                className="h-8 w-12 text-center text-lg bg-muted/20"
                              />
                              <Input
                                value={item.title}
                                onChange={(e) => {
                                  const scenes = [...videoProps.scenes]
                                  const items = [...(selectedScene.card_items || [])]
                                  items[i] = { ...items[i], title: e.target.value }
                                  scenes[selectedSceneIndex] = { ...selectedScene, card_items: items }
                                  onPropsUpdate({ ...videoProps, scenes })
                                }}
                                className="h-8 flex-1 text-xs bg-muted/20"
                              />
                              <button
                                className="text-destructive/60 hover:text-destructive px-1 shrink-0"
                                onClick={() => {
                                  const scenes = [...videoProps.scenes]
                                  const items = (selectedScene.card_items || []).filter((_: any, k: number) => k !== i)
                                  scenes[selectedSceneIndex] = { ...selectedScene, card_items: items }
                                  onPropsUpdate({ ...videoProps, scenes })
                                }}
                              >✕</button>
                            </div>
                          ))}
                          <Button
                            variant="outline" size="sm" className="w-full text-xs"
                            onClick={() => {
                              const scenes = [...videoProps.scenes]
                              const items = [...(selectedScene.card_items || [])]
                              items.push({ icon: '✨', title: 'Mục mới', subtitle: '' })
                              scenes[selectedSceneIndex] = { ...selectedScene, card_items: items }
                              onPropsUpdate({ ...videoProps, scenes })
                            }}
                          >
                            + Thêm mục
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline" size="sm" className="w-full text-xs"
                          onClick={() => {
                            const newProps = { ...videoProps }
                            const scenes = [...newProps.scenes]
                            scenes[selectedSceneIndex] = {
                              ...selectedScene,
                              card_items: [{ icon: '✨', title: 'Ví dụ', subtitle: '' }]
                            }
                            onPropsUpdate({ ...newProps, scenes })
                          }}
                        >
                          + Thêm Emoji
                        </Button>
                      )}
                    </div>
                  )}

                  {/* EmojiGrid / InfoCard editor — [CryptoVN Custom] */}
                  {(selectedScene?.scene_type === 'emoji_grid' || selectedScene?.scene_type === 'info_card') && selectedScene?.card_items && (
                    <div className="space-y-3">
                      <Label className="text-xs uppercase tracking-widest text-muted-foreground font-bold">
                        {selectedScene.scene_type === 'emoji_grid' ? 'Lưới biểu tượng' : 'Thẻ thông tin'}
                      </Label>
                      <div className="space-y-2">
                        {selectedScene.card_items.map((item, i) => (
                          <div key={i} className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg border border-white/5">
                            <Input
                              value={item.icon}
                              onChange={(e) => {
                                const newProps = { ...videoProps }
                                const scenes = [...newProps.scenes]
                                const items = [...(selectedScene.card_items || [])]
                                items[i] = { ...items[i], icon: e.target.value }
                                scenes[selectedSceneIndex] = { ...selectedScene, card_items: items }
                                onPropsUpdate({ ...newProps, scenes })
                              }}
                              className="h-7 w-10 text-center text-lg bg-muted/20 border-white/5 shrink-0"
                              placeholder="🔥"
                            />
                            <div className="flex-1 space-y-1">
                              <Input
                                value={item.title}
                                onChange={(e) => {
                                  const newProps = { ...videoProps }
                                  const scenes = [...newProps.scenes]
                                  const items = [...(selectedScene.card_items || [])]
                                  items[i] = { ...items[i], title: e.target.value }
                                  scenes[selectedSceneIndex] = { ...selectedScene, card_items: items }
                                  onPropsUpdate({ ...newProps, scenes })
                                }}
                                className="h-6 text-xs bg-muted/20 border-white/5"
                                placeholder="Tiêu đề"
                              />
                              <Input
                                value={item.subtitle}
                                onChange={(e) => {
                                  const newProps = { ...videoProps }
                                  const scenes = [...newProps.scenes]
                                  const items = [...(selectedScene.card_items || [])]
                                  items[i] = { ...items[i], subtitle: e.target.value }
                                  scenes[selectedSceneIndex] = { ...selectedScene, card_items: items }
                                  onPropsUpdate({ ...newProps, scenes })
                                }}
                                className="h-6 text-[11px] bg-muted/20 border-white/5"
                                placeholder="Phụ đề"
                              />
                            </div>
                            <button
                              className="text-destructive/60 hover:text-destructive px-1 shrink-0"
                              onClick={() => {
                                const newProps = { ...videoProps }
                                const scenes = [...newProps.scenes]
                                const items = (selectedScene.card_items || []).filter((_: any, k: number) => k !== i)
                                scenes[selectedSceneIndex] = { ...selectedScene, card_items: items }
                                onPropsUpdate({ ...newProps, scenes })
                              }}
                            >✕</button>
                          </div>
                        ))}
                      </div>
                      {(selectedScene.card_items?.length ?? 0) < 6 && (
                        <Button
                          variant="outline" size="sm" className="w-full text-xs"
                          onClick={() => {
                            const newProps = { ...videoProps }
                            const scenes = [...newProps.scenes]
                            const items = [...(selectedScene.card_items || [])]
                            items.push({ icon: '✨', title: 'Mục mới', subtitle: '' })
                            scenes[selectedSceneIndex] = { ...selectedScene, card_items: items }
                            onPropsUpdate({ ...newProps, scenes })
                          }}
                        >
                          + Thêm thẻ
                        </Button>
                      )}
                    </div>
                  )}

                  {/* StatsHighlight editor — [CryptoVN Custom] */}
                  {selectedScene?.scene_type === 'stats_highlight' && selectedScene?.stats && (
                    <div className="space-y-3">
                      <Label className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Số liệu nổi bật</Label>
                      <div className="space-y-2">
                        {selectedScene.stats.map((stat, i) => (
                          <div key={i} className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg border border-white/5">
                            <input
                              type="color"
                              value={stat.color || '#6366f1'}
                              onChange={(e) => {
                                const newProps = { ...videoProps }
                                const scenes = [...newProps.scenes]
                                const stats = [...(selectedScene.stats || [])]
                                stats[i] = { ...stats[i], color: e.target.value }
                                scenes[selectedSceneIndex] = { ...selectedScene, stats }
                                onPropsUpdate({ ...newProps, scenes })
                              }}
                              className="w-7 h-7 rounded cursor-pointer shrink-0 border-0"
                            />
                            <Input
                              value={stat.value}
                              onChange={(e) => {
                                const newProps = { ...videoProps }
                                const scenes = [...newProps.scenes]
                                const stats = [...(selectedScene.stats || [])]
                                stats[i] = { ...stats[i], value: e.target.value }
                                scenes[selectedSceneIndex] = { ...selectedScene, stats }
                                onPropsUpdate({ ...newProps, scenes })
                              }}
                              className="h-7 w-20 text-sm font-bold bg-muted/20 border-white/5 shrink-0"
                              placeholder="85%"
                            />
                            <Input
                              value={stat.label}
                              onChange={(e) => {
                                const newProps = { ...videoProps }
                                const scenes = [...newProps.scenes]
                                const stats = [...(selectedScene.stats || [])]
                                stats[i] = { ...stats[i], label: e.target.value }
                                scenes[selectedSceneIndex] = { ...selectedScene, stats }
                                onPropsUpdate({ ...newProps, scenes })
                              }}
                              className="h-7 text-xs bg-muted/20 border-white/5 flex-1"
                              placeholder="Nhãn"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedScene?.scene_type === 'diagram' && selectedScene?.diagram_spec && (
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Cấu hình sơ đồ</Label>
                      <pre className="p-3 rounded-xl border border-white/10 bg-muted/30 text-xs text-muted-foreground overflow-x-auto">
                        {JSON.stringify(selectedScene.diagram_spec, null, 2)}
                      </pre>
                    </div>
                  )}

                  {selectedScene?.scene_type === 'story_beats' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Cảnh emoji động</Label>
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
                          onClick={() => {
                            void applyStoryBeatsFallback(selectedSceneIndex, {
                              loading: 'Đang tạo lại các đoạn emoji...',
                              success: 'Đã tạo lại các đoạn emoji.',
                              error: 'Tạo lại thất bại.',
                            })
                          }}
                        >
                          Tạo lại
                        </button>
                      </div>
                      {selectedScene.story_beats && selectedScene.story_beats.length > 0 ? (
                        <div className="space-y-1.5">
                          {selectedScene.story_beats.map((beat, i) => (
                            <div key={i} className="flex items-start gap-3 p-2 bg-muted/30 rounded-lg border border-white/5">
                              <span className="text-2xl shrink-0">{beat.emoji}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-foreground/90 truncate">{beat.text}</p>
                                <p className="text-xs text-muted-foreground">
                                  {Math.round(beat.start_ms / 1000 * 10) / 10}s → {Math.round(beat.end_ms / 1000 * 10) / 10}s
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">Chưa có đoạn emoji nào. Bấm "Tạo lại" để sinh từ lời thoại.</p>
                      )}
                    </div>
                  )}


                  <Separator className="bg-white/5" />

                  {/* ── Unified Layout Mode Selector ── */}
                  {(() => {
                    const LAYOUT_OPTIONS: Record<string, { value: string; emoji: string; label: string; desc: string }[]> = {
                      timeline: [
                        { value: "left_aligned", emoji: "📋", label: "Steps", desc: "Numbered steps, line bên trái" },
                        { value: "center_focus", emoji: "⏳", label: "Classic", desc: "Line giữa, events 2 bên" },
                      ],
                      comparison: [
                        { value: "split_screen", emoji: "⚔️", label: "Split", desc: "Chia đôi trái/phải" },
                        { value: "stacked", emoji: "📊", label: "Stacked", desc: "Xếp dọc trên/dưới" },
                      ],
                      info_card: [
                        { value: "vertical_stack", emoji: "📝", label: "Stack", desc: "Cards xếp dọc" },
                        { value: "grid_2x2", emoji: "🔲", label: "Grid", desc: "Lưới 2×2 (4 items)" },
                        { value: "full_width_cards", emoji: "📰", label: "Full-width", desc: "Cards ngang, icon + text" },
                      ],
                      emoji_grid: [
                        { value: "vertical_stack", emoji: "📝", label: "Stack", desc: "Cards xếp dọc" },
                        { value: "grid_2x2", emoji: "🔲", label: "Grid", desc: "Lưới 2×2 (4 items)" },
                        { value: "full_width_cards", emoji: "📰", label: "Full-width", desc: "Cards ngang, icon + text" },
                      ],
                      stats_highlight: [
                        { value: "vertical_stack", emoji: "📊", label: "Cards", desc: "Stat cards xếp dọc" },
                        { value: "hero_number", emoji: "🔢", label: "Hero", desc: "1 số lớn nổi bật" },
                      ],
                      media_showcase: [
                        { value: "fit", emoji: "🖼️", label: "Vừa chiều rộng", desc: "Giữ tỷ lệ" },
                        { value: "cinema", emoji: "🎬", label: "Cinema (ngang)", desc: "16:9 ngang" },
                        { value: "fullscreen", emoji: "📱", label: "Toàn màn hình", desc: "Phủ kín" },
                      ],
                      title_card: [
                        { value: "standard", emoji: "✨", label: "Tiêu chuẩn", desc: "Cơ bản" },
                        { value: "news_intro", emoji: "📰", label: "News Intro", desc: "Bản tin" },
                        { value: "educational", emoji: "🎓", label: "Educational", desc: "Kiến thức" },
                        { value: "tutorial", emoji: "🛠️", label: "Tutorial", desc: "Hướng dẫn" },
                        { value: "commercial", emoji: "🛍️", label: "Commercial", desc: "Thương mại" },
                      ],
                    }
                    const sceneType = selectedScene?.scene_type || ''
                    const options = LAYOUT_OPTIONS[sceneType]
                    if (!options || options.length < 2) return null

                    const validLayouts = options.map(o => o.value)
                    let currentLayout = options[0].value

                    if (sceneType === 'media_showcase' && (selectedScene as any)?.media_layout) {
                      currentLayout = (selectedScene as any).media_layout
                    } else if ((selectedScene as any)?.layout && validLayouts.includes((selectedScene as any).layout)) {
                      currentLayout = (selectedScene as any).layout
                    }

                    return (
                      <div className="space-y-2 mt-4">
                        <Label htmlFor="layout-mode" className="text-xs uppercase tracking-widest text-muted-foreground font-bold">
                          Chế độ hiển thị (Layout Mode)
                        </Label>
                        <Select
                          value={currentLayout}
                          onValueChange={(val) => {
                            const newProps = { ...videoProps }
                            const scenes = [...newProps.scenes]
                            scenes[selectedSceneIndex] = {
                              ...selectedScene,
                              layout: val as any,
                              ...(sceneType === 'media_showcase' ? { media_layout: val as any } : {}),
                            }
                            onPropsUpdate({ ...newProps, scenes })
                          }}
                        >
                          <SelectTrigger id="layout-mode" className="bg-muted/20 border-white/5">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {options.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                <div className="flex items-center gap-2">
                                  <span className="text-base">{opt.emoji}</span>
                                  <div>
                                    <div className="font-medium">{opt.label}</div>
                                    <div className="text-[10px] text-muted-foreground">{opt.desc}</div>
                                  </div>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )
                  })()}

                  <div className="space-y-4">
                    <Label htmlFor="transition" className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Hiệu ứng chuyển cảnh</Label>
                    <Select
                      value={selectedScene?.transition || 'fade'}
                      onValueChange={(val) => {
                        const newProps = { ...videoProps }
                        const updatedScenes = [...newProps.scenes]
                        updatedScenes[selectedSceneIndex] = { ...selectedScene, transition: val }
                        onPropsUpdate({ ...newProps, scenes: updatedScenes })
                      }}
                    >
                      <SelectTrigger id="transition" className="bg-muted/20 border-white/5">
                        <SelectValue placeholder="Chọn hiệu ứng..." />
                      </SelectTrigger>
                      <SelectContent>
                        {TRANSITION_OPTIONS.map(opt => (
                          <SelectItem key={opt} value={opt} className="capitalize">{TRANSITION_LABELS[opt] || opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    <Label className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Emoji bật lên</Label>

                    {(selectedScene as any)?.emoji && (
                      <div className="flex items-center gap-2 p-2 bg-primary/10 rounded-lg border border-primary/20">
                        <span className="text-2xl">{(selectedScene as any).emoji}</span>
                        <span className="text-xs text-muted-foreground flex-1">Đang chọn</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-xs text-destructive hover:text-destructive"
                          onClick={() => {
                            const newProps = { ...videoProps }
                            const updatedScenes = [...newProps.scenes]
                            updatedScenes[selectedSceneIndex] = { ...selectedScene, emoji: null } as any
                            onPropsUpdate({ ...newProps, scenes: updatedScenes })
                          }}
                        >
                          Xóa
                        </Button>
                      </div>
                    )}

                    <div className="grid grid-cols-6 sm:grid-cols-8 gap-1">
                      {['🚀', '💡', '🔥', '⚡', '💰', '📈', '🎯', '✨', '🤖', '🧠', '💻', '📊', '🏆', '⭐', '🎉', '💎', '⚠️', '🔒', '❤️', '🌍', '📚', '🎬', '💬', '👑'].map(em => (
                        <button
                          key={em}
                          type="button"
                          aria-label={`Chọn emoji ${em}`}
                          title={`Chọn emoji ${em}`}
                          className={`text-xl p-1.5 rounded-lg hover:bg-muted/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${(selectedScene as any)?.emoji === em ? 'bg-primary/20 ring-1 ring-primary' : ''}`}
                          onClick={() => {
                            const newProps = { ...videoProps }
                            const updatedScenes = [...newProps.scenes]
                            updatedScenes[selectedSceneIndex] = { ...selectedScene, emoji: em } as any
                            onPropsUpdate({ ...newProps, scenes: updatedScenes })
                          }}
                        >
                          {em}
                        </button>
                      ))}
                    </div>

                    <Input
                      placeholder="Hoặc gõ emoji tùy chọn..."
                      value={(selectedScene as any)?.emoji || ''}
                      onChange={(e) => {
                        const newProps = { ...videoProps }
                        const updatedScenes = [...newProps.scenes]
                        updatedScenes[selectedSceneIndex] = { ...selectedScene, emoji: e.target.value || null } as any
                        onPropsUpdate({ ...newProps, scenes: updatedScenes })
                      }}
                      className="h-8 text-sm bg-muted/20 border-white/5"
                    />

                    <p className="text-xs text-muted-foreground">Emoji sẽ xuất hiện dạng bật lên trong video. AI tự chọn khi tạo, bạn có thể thay đổi.</p>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="video" className="flex-1 min-h-0 mt-0">
              <ScrollArea className="h-full min-h-0">
                <div className="p-4 space-y-6">
                  {palette && (
                    <div className="space-y-4">
                      <Label className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Bảng màu hệ thống</Label>
                      <p className="text-xs text-muted-foreground">Nhấn vào ô màu để thay đổi cho toàn bộ video</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {Object.entries(palette).map(([key, color]) => (
                          <div key={key} className="relative group">
                            <label
                              className="block w-full h-10 rounded-lg border border-white/10 shadow-sm cursor-pointer hover:scale-105 hover:border-white/30 transition-all"
                              style={{ backgroundColor: color }}
                              title={`${key}: ${color} — nhấn để đổi`}
                            >
                              <input
                                type="color"
                                value={color}
                                className="sr-only"
                                aria-label={`Chọn màu ${key}`}
                                onChange={(e) => {
                                  const newPalette = { ...palette, [key]: e.target.value }
                                  onPropsUpdate({ ...videoProps, color_palette: newPalette } as any)
                                }}
                              />
                            </label>
                            <span className="block text-xs text-center text-muted-foreground mt-1 capitalize">{{ primary: 'Màu chủ đạo', secondary: 'Màu phụ', background: 'Nền', text: 'Chữ' }[key] || key}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <Separator className="bg-white/5" />

                  {/* Background Presets Grid */}
                  <div className="space-y-3 p-4 bg-muted/20 rounded-xl border border-white/5">
                    <span className="text-xs font-semibold">Mẫu Gradient (Preset)</span>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: 'deep_ocean', name: 'Đại dương', color1: '#0d1f3c', color2: '#06080f' },
                        { id: 'midnight_ember', name: 'Than hồng', color1: '#1a0a0a', color2: '#080810' },
                        { id: 'aurora_borealis', name: 'Cực quang', color1: '#0a2a1a', color2: '#060d18' },
                        { id: 'cosmic_purple', name: 'Tím vũ trụ', color1: '#1a0d2a', color2: '#08060f' },
                        { id: 'golden_dusk', name: 'Hoàng hôn', color1: '#1a1508', color2: '#0a0a08' },
                        { id: 'cyber_teal', name: 'Xanh Cyber', color1: '#081a1a', color2: '#050a0f' },
                        { id: 'rose_noir', name: 'Hồng đen', color1: '#1a0a14', color2: '#08060a' },
                        { id: 'forest_depth', name: 'Rừng sâu', color1: '#0a1a0d', color2: '#040a06' },
                        { id: 'steel_blue', name: 'Xanh thép', color1: '#0d1520', color2: '#05080d' },
                        { id: 'warm_slate', name: 'Đá phiến', color1: '#141210', color2: '#080806' },
                        { id: 'electric_indigo', name: 'Xanh chàm', color1: '#100a20', color2: '#06050d' },
                        { id: 'obsidian', name: 'Hắc diện', color1: '#121212', color2: '#050505' },
                      ].map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-all ${(settings.background_preset || 'steel_blue') === preset.id
                              ? 'border-primary bg-primary/10'
                              : 'border-white/10 hover:border-white/30 hover:bg-white/5'
                            }`}
                          onClick={() => {
                            const nextSettings = { ...settings, background_preset: preset.id }
                            onPropsUpdate({ ...videoProps, settings: nextSettings } as any)
                          }}
                        >
                          <div
                            className="w-4 h-4 rounded-full border border-white/20 shrink-0"
                            style={{ background: `linear-gradient(135deg, ${preset.color1}, ${preset.color2})` }}
                          />
                          <span className="text-[10px] sm:text-xs truncate">{preset.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <Separator className="bg-white/5" />

                  {/* Custom Background Upload/Replace/Delete */}
                  <div className="space-y-3 p-4 bg-muted/20 rounded-xl border border-white/5">
                    <span className="text-xs font-semibold">Hình nền tùy chỉnh</span>
                    {settings?.custom_background_url ? (
                      <div className="space-y-2">
                        <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-white/10">
                          {settings.custom_background_type === 'video' ? (
                            <video
                              src={(settings.custom_background_url || '').startsWith('/api/')
                                ? settings.custom_background_url
                                : `/api/demo/${settings.custom_background_url}`}
                              className="w-full h-full object-cover"
                              autoPlay muted loop playsInline
                            />
                          ) : (
                            <img
                              src={(settings.custom_background_url || '').startsWith('/api/')
                                ? settings.custom_background_url
                                : `/api/demo/${settings.custom_background_url}`}
                              className="w-full h-full object-cover"
                              alt="Custom background"
                            />
                          )}
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                            className="hidden"
                            id="bg-replace"
                            onChange={async (e) => {
                              const file = e.target.files?.[0]
                              if (!file) return
                              const form = new FormData()
                              form.append('file', file)
                              try {
                                toast.info('Đang thay hình nền...')
                                const result = await api.post(`/jobs/${jobId}/background/upload`, form)
                                const nextSettings = { ...settings, custom_background_url: result.preview_url || result.bg_url, custom_background_type: result.bg_type }
                                onPropsUpdate({ ...videoProps, settings: nextSettings } as any)
                                toast.success('Đã thay hình nền!')
                              } catch (err: any) {
                                showErrorToast(err, {
                                  source: 'review_background_replace',
                                  jobId,
                                  fallback: 'Thay hình nền thất bại',
                                  prefix: 'Thay hình nền thất bại',
                                })
                              }
                              e.target.value = ''
                            }}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 h-7 text-xs"
                            onClick={() => document.getElementById('bg-replace')?.click()}
                          >
                            Thay
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-destructive hover:text-destructive"
                            onClick={() => {
                              const nextSettings = { ...settings, custom_background_url: null, custom_background_type: null }
                              onPropsUpdate({ ...videoProps, settings: nextSettings } as any)
                              toast.success('Đã xóa hình nền tùy chỉnh')
                            }}
                          >
                            Xóa
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                          className="hidden"
                          id="bg-upload"
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            const form = new FormData()
                            form.append('file', file)
                            try {
                              toast.info('Đang tải hình nền...')
                              const result = await api.post(`/jobs/${jobId}/background/upload`, form)
                              const nextSettings = { ...settings, custom_background_url: result.preview_url || result.bg_url, custom_background_type: result.bg_type }
                              onPropsUpdate({ ...videoProps, settings: nextSettings } as any)
                              toast.success('Đã tải hình nền lên!')
                            } catch (err: any) {
                              showErrorToast(err, {
                                source: 'review_background_upload',
                                jobId,
                                fallback: 'Tải hình nền thất bại',
                                prefix: 'Tải hình nền thất bại',
                              })
                            }
                            e.target.value = ''
                          }}
                        />
                        <label
                          htmlFor="bg-upload"
                          className="flex flex-col items-center justify-center gap-2 p-4 border border-dashed border-white/10 rounded-lg cursor-pointer hover:border-primary/30 transition-colors"
                        >
                          <Upload className="w-4 h-4 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Tải lên hình nền (JPG, PNG, WebP, MP4, WebM)</span>
                        </label>
                      </>
                    )}
                    <p className="text-xs text-muted-foreground">Hình nền sẽ hiển thị phía sau tất cả cảnh thay vì nền gradient mặc định.</p>
                  </div>

                  <Separator className="bg-white/5" />

                  <div className="space-y-3 p-4 bg-muted/20 rounded-xl border border-white/5">
                    <span className="text-xs font-semibold">Nhạc nền</span>
                    {/* Infer current BGM state: pipeline stores only bgm_url, not bgm_mode */}
                    {(() => {
                      const inferredMode = settings.bgm_mode || (settings.bgm_url ? 'custom' : 'none')
                      const hasBgm = !!settings.bgm_url
                      return (
                        <>
                          {hasBgm && !settings.bgm_mode && (
                            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-primary/10 border border-primary/20">
                              <span className="text-xs text-primary">✓ Đã chọn nhạc nền từ bước Setup</span>
                            </div>
                          )}
                          <Select
                            value={inferredMode}
                            onValueChange={(val) => {
                              const nextSettings = { ...settings, bgm_mode: val }
                              if (val === 'none') {
                                nextSettings.bgm_url = null
                                nextSettings.bgm_library_id = null
                              }
                              onPropsUpdate({ ...videoProps, settings: nextSettings } as any)
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs bg-muted/20 border-white/5">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Tắt nhạc nền</SelectItem>
                              <SelectItem value="custom">Nhạc tùy chỉnh (URL)</SelectItem>
                              <SelectItem value="library">Thư viện nhạc nền</SelectItem>
                            </SelectContent>
                          </Select>

                          {inferredMode === 'custom' && (
                            <div className="space-y-2">
                              <Input
                                placeholder="Nhập URL (http/https) hoặc tải lên file..."
                                value={settings.bgm_url || ''}
                                onChange={(e) => {
                                  const nextSettings = { ...settings, bgm_url: e.target.value || null }
                                  onPropsUpdate({ ...videoProps, settings: nextSettings } as any)
                                }}
                                className="h-8 text-xs bg-muted/20 border-white/5"
                              />
                              <label className="flex items-center justify-center gap-2 px-3 py-1.5 border border-dashed border-white/10 rounded-md cursor-pointer hover:border-primary/30 transition-colors">
                                <Upload className="w-4 h-4 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">Tải lên từ máy tính (.mp3, .wav, .m4a)</span>
                                <input
                                  type="file"
                                  className="hidden"
                                  accept=".mp3,.wav,.m4a"
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0]
                                    if (!file) return
                                    try {
                                      const form = new FormData()
                                      form.append('file', file)
                                      toast.loading('Đang tải lên nhạc nền...', { id: 'bgm-upload' })
                                      const result = await api.post('/bgm/upload', form)
                                      const nextSettings = { ...settings, bgm_url: result.data.rel_path || result.data.url }
                                      onPropsUpdate({ ...videoProps, settings: nextSettings } as any)
                                      toast.success('Tải lên thành công!', { id: 'bgm-upload' })
                                    } catch (err: any) {
                                      showErrorToast(err, {
                                        source: 'review_bgm_upload',
                                        jobId,
                                        fallback: 'Lỗi tải lên',
                                        prefix: 'Lỗi tải lên',
                                        id: 'bgm-upload',
                                      })
                                    }
                                  }}
                                />
                              </label>
                            </div>
                          )}

                          {inferredMode === 'library' && (
                            <Input
                              placeholder="Mã bài trong thư viện (bgm_library_id)..."
                              value={settings.bgm_library_id || ''}
                              onChange={(e) => {
                                const nextSettings = { ...settings, bgm_library_id: e.target.value || null }
                                onPropsUpdate({ ...videoProps, settings: nextSettings } as any)
                              }}
                              className="h-8 text-xs bg-muted/20 border-white/5"
                            />
                          )}

                          <div className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground shrink-0">Âm lượng</span>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              step="5"
                              value={Math.round((settings.bgm_volume ?? 0.2) * 100)}
                              onChange={(e) => {
                                const nextSettings = { ...settings, bgm_volume: parseInt(e.target.value) / 100 }
                                onPropsUpdate({ ...videoProps, settings: nextSettings } as any)
                              }}
                              className="flex-1 h-1.5 accent-primary"
                              disabled={inferredMode === 'none'}
                            />
                            <span className="text-xs text-muted-foreground w-8 text-right">
                              {Math.round((settings.bgm_volume ?? 0.2) * 100)}%
                            </span>
                          </div>
                        </>
                      )
                    })()}
                  </div>

                  <div className="space-y-3 p-4 bg-muted/20 rounded-xl border border-white/5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">Kêu gọi hành động (cảnh cuối)</span>
                      {settings?.cta?.enabled ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-xs text-destructive hover:text-destructive"
                          onClick={() => {
                            const nextSettings = { ...settings }
                            nextSettings.cta = { enabled: false, media_url: null, media_type: 'video', duration_ms: 3000 }
                            onPropsUpdate({ ...videoProps, settings: nextSettings } as any)
                          }}
                        >
                          Xóa CTA
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-xs"
                          onClick={() => {
                            const nextSettings = { ...settings }
                            nextSettings.cta = { enabled: true, media_url: null, media_type: 'video', duration_ms: 3000 }
                            onPropsUpdate({ ...videoProps, settings: nextSettings } as any)
                          }}
                        >
                          Bật CTA
                        </Button>
                      )}
                    </div>

                    {settings?.cta?.enabled && (
                      <>
                        {settings?.cta?.media_url ? (
                          <div className="flex items-center gap-2 p-2 bg-green-500/10 rounded-lg border border-green-500/20">
                            <span className="text-green-400 text-xs font-bold">✓ Đã thêm</span>
                            <span className="text-xs text-muted-foreground truncate flex-1">
                              {settings.cta.media_url.split('/').pop()}
                            </span>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">Chưa có phương tiện — kéo thả hoặc chọn file</p>
                        )}

                        <div>
                          <input
                            type="file"
                            accept="video/mp4,video/webm,image/jpeg,image/png,image/webp"
                            className="hidden"
                            id="cta-upload-global"
                            onChange={async (e) => {
                              const file = e.target.files?.[0]
                              if (file) handleCtaUpload(file)
                            }}
                          />
                          <label
                            htmlFor="cta-upload-global"
                            onDragOver={(e) => { e.preventDefault(); setCtaDragOver(true) }}
                            onDragLeave={() => setCtaDragOver(false)}
                            onDrop={(e) => {
                              e.preventDefault()
                              setCtaDragOver(false)
                              const file = e.dataTransfer.files?.[0]
                              if (file) handleCtaUpload(file)
                            }}
                            className={`flex flex-col items-center justify-center gap-1 p-3 border border-dashed rounded-lg cursor-pointer transition-colors ${ctaDragOver ? 'border-primary bg-primary/10 scale-[1.02]' : 'border-white/10 hover:border-primary/30 hover:bg-muted/20'
                              }`}
                          >
                            <Upload className="w-4 h-4 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{settings?.cta?.media_url ? 'Thay đổi file' : 'Kéo thả hoặc chọn file'}</span>
                            <span className="text-xs text-muted-foreground/50">Video (MP4, WebM) • Ảnh (JPG, PNG, WebP)</span>
                          </label>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="space-y-3 p-4 bg-muted/20 rounded-xl border border-white/5">
                    <span className="text-xs font-semibold">Dấu bản quyền</span>

                    <Select
                      value={settings.watermark_mode || 'text'}
                      onValueChange={(val) => {
                        const nextSettings = { ...settings, watermark_mode: val }
                        onPropsUpdate({ ...videoProps, settings: nextSettings } as any)
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs bg-muted/20 border-white/5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Chỉ chữ</SelectItem>
                        <SelectItem value="logo">Chỉ logo</SelectItem>
                        <SelectItem value="both">Logo + Chữ</SelectItem>
                      </SelectContent>
                    </Select>

                    {['text', 'both'].includes(settings.watermark_mode || 'text') && (
                      <Input
                        placeholder="Nội dung dấu bản quyền (vd: @autoclip)"
                        value={settings.watermark_text || ''}
                        onChange={(e) => {
                          const nextSettings = { ...settings, watermark_text: e.target.value || null }
                          onPropsUpdate({ ...videoProps, settings: nextSettings } as any)
                        }}
                        className="h-8 text-xs bg-muted/20 border-white/5"
                      />
                    )}

                    {['logo', 'both'].includes(settings.watermark_mode || 'text') && (
                      <div className="space-y-2">
                        {settings.watermark_logo_url ? (
                          <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
                            <img
                              src={(settings.watermark_logo_url || '').startsWith('/api/')
                                ? settings.watermark_logo_url
                                : `/api/files/${settings.watermark_logo_url}`}
                              alt="Logo"
                              className="w-8 h-8 object-contain"
                            />
                            <span className="text-xs text-muted-foreground flex-1 truncate">
                              {settings.watermark_logo_url.split('/').pop()}
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-5 text-xs text-destructive"
                              onClick={() => {
                                const nextSettings = { ...settings, watermark_logo_url: null }
                                onPropsUpdate({ ...videoProps, settings: nextSettings } as any)
                              }}
                            >
                              Xóa
                            </Button>
                          </div>
                        ) : (
                          <>
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp,image/svg+xml"
                              className="hidden"
                              id="logo-upload"
                              onChange={async (e) => {
                                const file = e.target.files?.[0]
                                if (!file) return
                                const form = new FormData()
                                form.append('file', file)
                                try {
                                  toast.info('Đang tải logo...')
                                  const result = await api.post(`/jobs/${jobId}/logo/upload`, form)
                                  const nextSettings = { ...settings, watermark_logo_url: result.preview_url || result.logo_url }
                                  onPropsUpdate({ ...videoProps, settings: nextSettings } as any)
                                  toast.success('Đã tải logo lên!')
                                } catch (err: any) {
                                  showErrorToast(err, {
                                    source: 'review_logo_upload',
                                    jobId,
                                    fallback: 'Tải logo lên thất bại',
                                    prefix: 'Tải logo lên thất bại',
                                  })
                                }
                              }}
                            />
                            <label
                              htmlFor="logo-upload"
                              className="flex items-center justify-center gap-2 p-3 border border-dashed border-white/10 rounded-lg cursor-pointer hover:border-primary/30 transition-colors"
                            >
                              <Upload className="w-4 h-4 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">Tải logo lên (PNG, JPG, WebP)</span>
                            </label>
                          </>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Select
                        value={settings.watermark_position || 'bottom-right'}
                        onValueChange={(val) => {
                          const nextSettings = { ...settings, watermark_position: val }
                          onPropsUpdate({ ...videoProps, settings: nextSettings } as any)
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs bg-muted/20 border-white/5 flex-1" aria-label="Vị trí dấu bản quyền">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="top-left">Trên trái</SelectItem>
                          <SelectItem value="top-right">Trên phải</SelectItem>
                          <SelectItem value="bottom-left">Dưới trái</SelectItem>
                          <SelectItem value="bottom-right">Dưới phải</SelectItem>
                          <SelectItem value="center">Chính giữa</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground shrink-0">Độ mờ</span>
                      <input
                        type="range"
                        min="10"
                        max="100"
                        step="5"
                        value={Math.round((settings.watermark_opacity ?? 0.5) * 100)}
                        onChange={(e) => {
                          const nextSettings = { ...settings, watermark_opacity: parseInt(e.target.value) / 100 }
                          onPropsUpdate({ ...videoProps, settings: nextSettings } as any)
                        }}
                        className="flex-1 h-1.5 accent-primary"
                      />
                      <span className="text-xs text-muted-foreground w-8 text-right">
                        {Math.round((settings.watermark_opacity ?? 0.5) * 100)}%
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3 p-4 bg-muted/20 rounded-xl border border-white/5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">Hiệu ứng âm thanh</span>
                      <Button
                        size="sm"
                        variant={settings?.sfx?.enabled !== false ? 'default' : 'outline'}
                        className="h-6 text-xs px-2"
                        onClick={() => {
                          const nextSfx = { ...(settings.sfx || { enabled: true, volume: 0.25 }) }
                          nextSfx.enabled = !nextSfx.enabled
                          const nextSettings = { ...settings, sfx: nextSfx }
                          onPropsUpdate({ ...videoProps, settings: nextSettings } as any)
                        }}
                      >
                        {settings?.sfx?.enabled !== false ? 'BẬT' : 'TẮT'}
                      </Button>
                    </div>
                    {settings?.sfx?.enabled !== false && (
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground shrink-0">Âm lượng</span>
                        <input
                          type="range"
                          min="5"
                          max="100"
                          step="5"
                          value={Math.round((settings?.sfx?.volume ?? 0.25) * 100)}
                          onChange={(e) => {
                            const nextSfx = { ...(settings.sfx || { enabled: true, volume: 0.25 }) }
                            nextSfx.volume = parseInt(e.target.value) / 100
                            const nextSettings = { ...settings, sfx: nextSfx }
                            onPropsUpdate({ ...videoProps, settings: nextSettings } as any)
                          }}
                          className="flex-1 h-1.5 accent-primary"
                        />
                        <span className="text-xs text-muted-foreground w-8 text-right">
                          {Math.round((settings?.sfx?.volume ?? 0.25) * 100)}%
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 p-4 bg-muted/20 rounded-xl border border-white/5">
                    <span className="text-xs font-semibold">Kiểu phụ đề</span>
                    <Select
                      value={settings?.subtitle?.preset || 'default'}
                      onValueChange={(val) => {
                        const subtitle = { ...(settings.subtitle || {}) }
                        subtitle.preset = val
                        const nextSettings = { ...settings, subtitle }
                        onPropsUpdate({ ...videoProps, settings: nextSettings } as any)
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs bg-muted/20 border-white/5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Mặc định</SelectItem>
                        <SelectItem value="bold_pop">Bold Pop (nổi bật)</SelectItem>
                        <SelectItem value="karaoke">Karaoke (mờ → sáng)</SelectItem>
                        <SelectItem value="minimal">Tối giản (nhỏ gọn)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* BOTTOM ACTION BAR */}
      <div className="min-h-16 px-3 sm:px-8 py-2 border-t flex flex-wrap items-center justify-between gap-3 backdrop-blur-xl shadow-2xl relative z-10" style={{ borderColor: 'var(--border-subtle)', background: 'color-mix(in srgb, var(--surface-0) 90%, transparent)' }}>
        <Button variant="ghost" onClick={() => setBackConfirmOpen(true)} className="gap-2 text-muted-foreground hover:text-foreground hover:bg-white/5">
          <ArrowLeft size={16} /> Quay lại Cài đặt
        </Button>

        <div className="flex flex-wrap items-center justify-end gap-3 sm:gap-6">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-bold">{scenes.length} cảnh tổng cộng</div>
            <div className="text-xs text-muted-foreground uppercase tracking-widest font-mono">
              Thời lượng: {(totalDurationMs / 1000).toFixed(1)}s
            </div>
          </div>
          <Button variant="outline" className="h-10 text-xs hidden sm:inline-flex" onClick={() => saveDraft()}>
            Lưu nháp (Cmd/Ctrl+S)
          </Button>
          <Separator orientation="vertical" className="h-10 bg-white/5 hidden sm:block" />
          <div className="relative group" tabIndex={renderDisabledReason ? 0 : -1}>
            <Button
              size="lg"
              className="h-12 gap-2 px-5 sm:px-10 font-bold bg-primary hover:bg-primary/90 shadow-[0_0_20px_rgba(var(--primary),0.3)] transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:hover:scale-100"
              onClick={handleRender}
              disabled={rendering || !!renderDisabledReason}
            >
              {rendering ? (
                <RefreshCw size={18} className="animate-spin" />
              ) : (
                <Clapperboard size={18} />
              )}
              {rendering ? 'Đang chuẩn bị...' : 'Kết xuất video'}
            </Button>
            {renderDisabledReason && !rendering && (
              <div className="pointer-events-none absolute bottom-full right-0 mb-2 w-[280px] rounded-lg border border-destructive/30 bg-background/95 px-3 py-2 text-xs text-destructive shadow-xl opacity-0 translate-y-1 transition-all group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0">
                {renderDisabledReason}
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={backConfirmOpen} onOpenChange={setBackConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận quay lại Cài đặt?</DialogTitle>
            <DialogDescription>
              Bạn sẽ rời màn hình kiểm tra hiện tại để quay về bước Cài đặt. Các chỉnh sửa trong phiên này vẫn có thể lưu dưới dạng bản nháp.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBackConfirmOpen(false)}>
              Ở lại
            </Button>
            <Button
              onClick={() => {
                setBackConfirmOpen(false)
                onBackToSetup()
              }}
            >
              Xác nhận quay lại Cài đặt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {contextMenu && (
        <div
          className="fixed z-[120] min-w-[200px] rounded-lg border border-white/10 bg-background/95 backdrop-blur-md shadow-2xl p-1"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            type="button"
            className="w-full px-3 py-2 text-xs rounded-md hover:bg-muted/40 text-left flex items-center gap-2"
            onClick={() => {
              handleDuplicateScene(contextMenu.sceneIndex)
              setContextMenu(null)
            }}
          >
            <Copy className="w-3.5 h-3.5" /> Nhân bản
          </button>
          <button
            type="button"
            className="w-full px-3 py-2 text-xs rounded-md hover:bg-muted/40 text-left flex items-center gap-2"
            onClick={() => {
              handleInsertScene(contextMenu.sceneIndex, 'before')
              setContextMenu(null)
            }}
          >
            <Plus className="w-3.5 h-3.5" /> Thêm phía trước
          </button>
          <button
            type="button"
            className="w-full px-3 py-2 text-xs rounded-md hover:bg-muted/40 text-left flex items-center gap-2"
            onClick={() => {
              handleInsertScene(contextMenu.sceneIndex, 'after')
              setContextMenu(null)
            }}
          >
            <Plus className="w-3.5 h-3.5" /> Thêm phía sau
          </button>
          <Separator className="my-1 bg-white/10" />
          <button
            type="button"
            className="w-full px-3 py-2 text-xs rounded-md hover:bg-destructive/15 text-left flex items-center gap-2 text-destructive"
            onClick={() => {
              handleDeleteScene(contextMenu.sceneIndex)
              setContextMenu(null)
            }}
          >
            <Trash2 className="w-3.5 h-3.5" /> Xóa
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Media search component for a scene.
 */
function SceneMediaSearch({ scene, index, jobId, videoProps, onPropsUpdate }: {
  scene: Scene, index: number, jobId: string, videoProps: VideoProps, onPropsUpdate: (p: VideoProps) => void
}) {
  const [editing, setEditing] = useState(false)
  const [query, setQuery] = useState(scene?.image_query || scene?.video_query || '')
  const [searching, setSearching] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    try {
      const result = await api.post(`/jobs/${jobId}/scenes/${index}/re-search`, {
        image_query: query,
        video_query: query,
      })
      const mediaWidth = toPositiveNumber(result?.width)
      const mediaHeight = toPositiveNumber(result?.height)
      toast.success(`Đã tìm thấy phương tiện mới cho cảnh ${index + 1}`)

      const newProps = { ...videoProps }
      const scenes = [...newProps.scenes]
      scenes[index] = {
        ...scenes[index],
        media_url: result.media_url,
        media_type: result.media_type,
        poster_url: result.poster_url ?? (result.media_type === 'image' ? result.media_url : null),
        image_query: query,
        _media_width: mediaWidth,
        _media_height: mediaHeight,
        ...(scenes[index].scene_type === 'stock_background' ? { layout: 'media_overlay' } : {})
      }
      onPropsUpdate({ ...newProps, scenes })
      setEditing(false)
    } catch (err: any) {
      showErrorToast(err, {
        source: 'review_scene_media_search',
        jobId,
        fallback: 'Tìm kiếm thất bại',
        prefix: 'Tìm kiếm thất bại',
      })
    } finally {
      setSearching(false)
    }
  }

  const handleFileUpload = async (file: File) => {
    const isVideo = file.type.startsWith('video/')
    const maxSize = isVideo ? 50 * 1024 * 1024 : 5 * 1024 * 1024
    if (file.size > maxSize) {
      toast.error(`File quá lớn (${(file.size / 1024 / 1024).toFixed(1)}MB). Giới hạn: ${isVideo ? '50' : '5'}MB`)
      return
    }

    setUploading(true)
    const dimensionsPromise = readFileMediaDimensions(file)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const result = await api.upload(
        `/jobs/${jobId}/scenes/${index}/upload-media`,
        formData
      )

      toast.success(`Đã tải lên phương tiện cho cảnh ${index + 1}`)
      const dimensions = await dimensionsPromise
      const cacheBuster = Date.now()
      const previewUrl = `${result.preview_url}${String(result.preview_url).includes('?') ? '&' : '?'}t=${cacheBuster}`
      const posterUrl = result.poster_url
        ? `${result.poster_url}${String(result.poster_url).includes('?') ? '&' : '?'}t=${cacheBuster}`
        : null

      const newProps = { ...videoProps }
      const scenes = [...newProps.scenes]
      scenes[index] = {
        ...scenes[index],
        media_url: previewUrl,
        media_type: result.media_type,
        poster_url: posterUrl,
        _media_width: dimensions?.width ?? null,
        _media_height: dimensions?.height ?? null,
      }
      onPropsUpdate({ ...newProps, scenes })
    } catch (err: any) {
      showErrorToast(err, {
        source: 'review_scene_media_upload',
        jobId,
        fallback: 'Tải lên thất bại',
        prefix: 'Tải lên thất bại',
      })
    } finally {
      setUploading(false)
    }
  }

  // Hidden file input (shared by drag-drop zone and upload button)
  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0]
        if (file) handleFileUpload(file)
        e.target.value = '' // Reset for re-upload same file
      }}
    />
  )

  if (editing) {
    return (
      <div className="space-y-3 p-4 bg-muted/30 rounded-xl border border-primary/10 animate-in fade-in zoom-in-95 duration-200">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nhập từ khóa (tiếng Anh)..."
          className="text-sm bg-background border-white/5 focus-visible:ring-primary/20"
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          autoFocus
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSearch} disabled={searching} className="flex-1 font-bold">
            {searching ? <RefreshCw className="w-3 h-3 animate-spin mr-2" /> : <RefreshCw className="w-3 h-3 mr-2" />}
            Cập nhật
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(false)} className="px-4">Hủy</Button>
        </div>

        {/* Drag-drop upload zone */}
        {fileInput}
        <div
          className={cn(
            "mt-3 border-2 border-dashed rounded-xl p-4 text-center transition-all cursor-pointer",
            dragOver
              ? "border-primary bg-primary/10 scale-[1.02]"
              : "border-white/10 hover:border-primary/30 hover:bg-muted/30"
          )}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const file = e.dataTransfer.files?.[0]
            if (file) handleFileUpload(file)
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <div className="flex items-center justify-center gap-2 py-2">
              <LoaderCircle className="w-4 h-4 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">Đang tải lên...</span>
            </div>
          ) : (
            <div className="space-y-1">
              <Upload className="w-5 h-5 mx-auto text-muted-foreground/60" />
              <p className="text-xs text-muted-foreground">
                Kéo thả hoặc <span className="text-primary font-medium">chọn file</span>
              </p>
              <p className="text-xs text-muted-foreground/50">
                Ảnh: JPG, PNG, WebP (≤5MB) • Video: MP4, WebM (≤50MB)
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {fileInput}
      <button
        type="button"
        aria-label="Chỉnh sửa từ khóa phương tiện"
        className="w-full text-left p-4 bg-muted/40 rounded-xl border border-white/5 group relative hover:bg-muted/60 transition-all cursor-pointer shadow-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        onClick={() => setEditing(true)}
      >
        <div className="text-xs uppercase font-bold tracking-widest text-muted-foreground flex items-center justify-between mb-2">
          <span>Từ khóa hiện tại</span>
          <div className="bg-primary/10 text-primary p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
            <Edit3 size={10} />
          </div>
        </div>
        <p className="text-sm font-medium truncate italic text-foreground/80">"{query || 'Chưa có từ khóa'}"</p>
      </button>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          className="flex-1 gap-1.5 text-xs bg-primary/15 hover:bg-primary/25 text-primary shadow-sm"
          disabled={searching}
          onClick={(e) => {
            e.stopPropagation()
            void handleSearch()
          }}
        >
          <RefreshCw className={cn("w-3.5 h-3.5", searching && "animate-spin")} />
          Đổi Media
        </Button>

        <Button
          size="sm"
          variant={showUpload ? "default" : "outline"}
          className="flex-1 gap-1.5 text-xs bg-background/50 hover:bg-background/80"
          onClick={(e) => {
            e.stopPropagation()
            setShowUpload(!showUpload)
          }}
          disabled={uploading}
        >
          <Upload className="w-3.5 h-3.5" />
          {showUpload ? 'Ẩn tải lên' : 'Tải lên'}
        </Button>
      </div>

      {/* Drag-drop zone — shown when upload button is toggled */}
      {showUpload && (
        <div
          className={cn(
            "border-2 border-dashed rounded-xl p-4 text-center transition-all cursor-pointer animate-in fade-in slide-in-from-top-2 duration-200",
            dragOver
              ? "border-primary bg-primary/10 scale-[1.02]"
              : "border-white/10 hover:border-primary/30 hover:bg-muted/30"
          )}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const file = e.dataTransfer.files?.[0]
            if (file) handleFileUpload(file)
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <div className="flex items-center justify-center gap-2 py-2">
              <LoaderCircle className="w-4 h-4 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">Đang tải lên...</span>
            </div>
          ) : (
            <div className="space-y-1">
              <Upload className="w-5 h-5 mx-auto text-muted-foreground/60" />
              <p className="text-xs text-muted-foreground">
                Kéo thả hoặc <span className="text-primary font-medium">chọn file</span>
              </p>
              <p className="text-xs text-muted-foreground/50">
                Ảnh: JPG, PNG, WebP (≤5MB) • Video: MP4, WebM (≤50MB)
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ')
}
