import { useState, useEffect, useRef } from 'react'
import { api } from '@/api/client'
import { toast } from "sonner"
import {
  ArrowLeft, Clapperboard, Edit3, RefreshCw,
  Image as ImageIcon, Film, Clock, Play, LoaderCircle,
  Settings2, ListVideo, Palette, Upload
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const TRANSITION_OPTIONS = ['fade', 'slide', 'wipe', 'zoom', 'flip', 'clock-wipe', 'iris', 'none']

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
const NEEDS_MEDIA = new Set(['stock_background', 'media_showcase', 'news_intro'])

const SCENE_TYPE_LABELS: Record<string, string> = {
  title_card: 'Thẻ tiêu đề',
  stock_background: 'Video nền',
  info_card: 'Thẻ thông tin',
  stats_highlight: 'Số liệu',
  diagram: 'Sơ đồ',
  emoji_grid: 'Lưới biểu tượng',
  comparison: 'So sánh',
  media_showcase: 'Trình chiếu media',
  timeline: 'Dòng thời gian',
  news_intro: 'Tin tức mở đầu',
  story_beats: 'Story Beats',  // [CryptoVN Custom]
}

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
  transition?: string | null
  image_query?: string | null
  video_query?: string | null
  card_items?: Array<{ icon: string; title: string; subtitle: string }> | null
  stats?: Array<{ label: string; value: string; color: string }> | null
  diagram_spec?: Record<string, any> | null
  comparison_sides?: ComparisonSide[] | null
  timeline_events?: TimelineEvent[] | null
  media_layout?: 'cinema' | 'fullscreen' | 'fit' | null
}

interface VideoProps {
  scenes: Scene[]
  color_palette?: Record<string, string>
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
  return (scene as any)._preview_url || null
}

/** Visual mockup preview for non-stock scene types */
function ScenePreviewMockup({ scene, palette, hasCustomBg = false }: { scene: Scene; palette: Record<string, string>; hasCustomBg?: boolean }) {
  const bg = hasCustomBg ? 'transparent' : (palette?.background || '#0f0f0f')
  const primary = palette?.primary || '#6366f1'
  const text = palette?.text || '#ffffff'

  switch (scene.scene_type) {
    case 'title_card':
      return (
        <div className="w-full h-full flex flex-col items-center justify-center p-8 gap-4"
             style={{ background: hasCustomBg ? 'transparent' : `linear-gradient(135deg, ${bg}, ${primary}20)` }}>
          <div className="text-2xl font-black text-center leading-tight" style={{ color: text }}>
            {scene.narration?.slice(0, 60)}
          </div>
          <div className="w-16 h-1 rounded-full" style={{ backgroundColor: primary }} />
        </div>
      )
    
    case 'info_card':
      return (
        <div className="w-full h-full flex items-center justify-center p-8"
             style={{ background: bg }}>
          <div className="max-w-[280px] p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur space-y-3">
            <div className="w-8 h-8 rounded-lg" style={{ backgroundColor: `${primary}30` }} />
            <p className="text-sm leading-relaxed" style={{ color: text }}>
              {scene.narration?.slice(0, 100)}
            </p>
          </div>
        </div>
      )
    
    case 'stats_highlight':
      return (
        <div className="w-full h-full flex flex-col items-center justify-center p-8 gap-3"
             style={{ background: bg }}>
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
          <p className="text-xs text-center opacity-60 max-w-[200px]" style={{ color: text }}>
            {scene.narration?.slice(0, 60)}
          </p>
        </div>
      )
    
    case 'comparison':
      return (
        <div className="w-full h-full flex relative" style={{ background: bg }}>
          {(scene.comparison_sides || []).slice(0, 2).map((side, i) => (
            <div key={i} className="flex-1 flex flex-col items-center justify-center p-4 gap-2"
                 style={{ borderRight: i === 0 ? '1px solid rgba(255,255,255,0.1)' : 'none' }}>
              <span className="text-sm font-bold" style={{ color: i === 0 ? '#22C55E' : '#EF4444' }}>
                {side.label}
              </span>
              <ul className="text-[10px] opacity-70 space-y-1 text-center" style={{ color: text }}>
                {side.points?.slice(0, 3).map((p, j) => <li key={j}>• {p}</li>)}
              </ul>
            </div>
          ))}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white/10 backdrop-blur px-3 py-1 rounded-full text-xs font-bold" style={{ color: text }}>
            VS
          </div>
        </div>
      )

    case 'timeline':
      return (
        <div className="w-full h-full flex flex-col items-center justify-center p-6 gap-3"
             style={{ background: bg }}>
          <div className="w-full max-w-[280px] space-y-2">
            {(scene.timeline_events || []).slice(0, 4).map((ev, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: primary }} />
                <span className="text-[10px] font-mono opacity-50 shrink-0" style={{ color: text }}>{ev.label}</span>
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
          <div className="text-xs font-bold uppercase tracking-wider opacity-40" style={{ color: text }}>Sơ đồ</div>
          <div className="space-y-2 w-full max-w-[240px]">
            {['Bước 1', 'Bước 2', 'Bước 3'].map((step, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                     style={{ backgroundColor: `${primary}30`, color: primary }}>
                  {i + 1}
                </div>
                <div className="flex-1 h-px" style={{ backgroundColor: `${primary}30` }} />
                <span className="text-xs" style={{ color: text }}>{step}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-center opacity-50 mt-2 max-w-[200px]" style={{ color: text }}>
            {scene.narration?.slice(0, 50)}
          </p>
        </div>
      )

    case 'emoji_grid':
      return (
        <div className="w-full h-full flex flex-col items-center justify-center p-6 gap-3"
             style={{ background: bg }}>
          {scene.card_items?.length ? (
            <div className="grid grid-cols-2 gap-2 max-w-[260px]">
              {scene.card_items.slice(0, 4).map((item, i) => (
                <div key={i} className="p-3 rounded-xl bg-white/5 text-center space-y-1">
                  <div className="text-2xl">{item.icon}</div>
                  <div className="text-[10px] font-medium" style={{ color: text }}>{item.title}</div>
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

    case 'media_showcase': {
      const mediaLayout = scene.media_layout || 'cinema'
      if (mediaLayout === 'fullscreen') {
        return (
          <div className="w-full h-full flex items-center justify-center" style={{ background: bg }}>
            <div className="text-center space-y-2">
              <Film className="w-10 h-10 mx-auto text-primary/40" />
              <p className="text-xs" style={{ color: text }}>Toàn màn hình</p>
            </div>
          </div>
        )
      }
      return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-6" style={{ background: bg }}>
          <p className="text-sm font-bold text-center" style={{ color: text }}>
            {scene.visual_description?.slice(0, 40) || scene.narration?.slice(0, 40)}
          </p>
          <div className="w-[240px] h-[135px] rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
            <Play className="w-8 h-8 text-primary/30" />
          </div>
        </div>
      )
    }

    case 'news_intro':
      return (
        <div className="w-full h-full flex flex-col relative" style={{ background: hasCustomBg ? 'transparent' : '#0a1200' }}>
          {/* Top half: actual media or placeholder */}
          <div className="flex-1 overflow-hidden">
            {scene.media_url ? (
              scene.media_type === 'video' ? (
                <video src={scene.media_url} className="w-full h-full object-cover object-center" muted />
              ) : (
                <img src={scene.media_url} alt="" className="w-full h-full object-cover object-center" />
              )
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-zinc-800/60 to-transparent">
                <ImageIcon className="w-8 h-8 text-white/20" />
              </div>
            )}
          </div>
          {/* Bottom half: brand overlay mockup */}
          <div className="absolute bottom-0 left-0 right-0 h-[55%] bg-gradient-to-b from-transparent via-[#0a1200]/80 to-[#0a1200]/95 flex flex-col justify-center px-4 gap-2">
            <div className="w-10 h-[2px] rounded-full" style={{ backgroundColor: '#C6FD01' }} />
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-[#C6FD01]/20 flex items-center justify-center">
                <span className="text-[8px] font-black" style={{ color: '#C6FD01' }}>CV</span>
              </div>
              <span className="text-sm font-extrabold" style={{ color: '#C6FD01' }}>CryptoVN 101</span>
            </div>
            <p className="text-[11px] font-bold leading-tight line-clamp-3 uppercase" style={{ color: '#fff' }}>
              {scene.narration?.slice(0, 80)}
            </p>
          </div>
        </div>
      )

    default:
      return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-4"
             style={{ background: `linear-gradient(135deg, ${primary}20, ${bg}, ${primary}10)` }}>
          <Palette className="w-10 h-10 text-primary/40" />
          <Badge variant="secondary" className="text-xs">
            {SCENE_TYPE_LABELS[scene.scene_type || ''] || scene.scene_type}
          </Badge>
        </div>
      )
  }
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

  const handleCtaUpload = async (file: File) => {
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
      toast.success('Đã upload!')
    } catch (err: any) {
      toast.error('Upload thất bại: ' + err.message)
    }
  }

  // Compute media_url for dependency before early return (hooks must be unconditional)
  const currentMediaUrl = videoProps?.scenes?.[selectedSceneIndex]?.media_url ?? null

  // Reset media state when scene changes
  useEffect(() => {
    setMediaLoading(true)
    setMediaError(false)
  }, [selectedSceneIndex, currentMediaUrl])

  if (!videoProps) return null

  const scenes = videoProps.scenes || []
  const palette = videoProps.color_palette || {}
  const selectedScene = scenes[selectedSceneIndex] || scenes[0]

  const handleRender = async () => {
    // Bug 4: Validate — all stock scenes must have media before render
    const missingMedia = videoProps.scenes.filter(
      (s) => NEEDS_MEDIA.has(s.scene_type || '') && !s.media_url
    )
    if (missingMedia.length > 0) {
      const indices = missingMedia.map((s) => {
        const idx = videoProps.scenes.indexOf(s)
        return idx + 1
      }).join(', ')
      toast.error(`Cảnh ${indices} cần media nhưng chưa có. Hãy tìm trên Pexels hoặc upload file trước khi render.`)
      return
    }

    setRendering(true)
    try {
      // Step 1: Save edited props — strip media_url to preserve backend local paths (Bug 3b)
      const scenesForPatch = videoProps.scenes.map(s => {
        const { media_url, media_type, _preview_url, ...editableFields } = s as any
        return editableFields
      })
      await api.patch(`/jobs/${jobId}/props`, {
        scenes: scenesForPatch,
        settings: (videoProps as any).settings || {},
      })
      // Step 2: Then trigger render
      await api.post(`/jobs/${jobId}/render`, {})
      toast.success('Bắt đầu Render Video!')
      onRenderStart()
    } catch (err: any) {
      toast.error('Render thất bại: ' + err.message)
      setRendering(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-background border-t animate-in slide-in-from-bottom-2 duration-500">
      {/* Main Studio Area */}
      <div className="grid overflow-hidden" style={{ gridTemplateColumns: '280px 1fr 320px', height: 'calc(100vh - 60px)' }}>
        
        {/* LEFT PANE: Scene Selection */}
        <div className="border-r flex flex-col bg-muted/20 h-full overflow-hidden">
          <div className="p-4 border-b flex items-center justify-between font-semibold shrink-0">
            <div className="flex items-center gap-2">
                <ListVideo className="w-4 h-4 text-primary" />
                <span className="text-sm">Cảnh quay ({scenes.length})</span>
            </div>
            <Badge variant="outline" className="text-[10px] uppercase font-mono">Nháp</Badge>
          </div>
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-2 space-y-1">
              {scenes.map((scene, index) => {
                const isActive = selectedSceneIndex === index
                return (
                  <button
                    key={index}
                    onClick={() => onSelectScene(index)}
                    className={cn(
                        "w-full flex items-start gap-3 p-3 rounded-xl text-left transition-all group",
                        isActive 
                            ? "bg-card shadow-sm border border-primary/20 ring-1 ring-primary/10" 
                            : "hover:bg-accent/50 border border-transparent"
                    )}
                  >
                    <div className="relative shrink-0 w-20 h-12 rounded-lg bg-black/40 overflow-hidden shadow-inner border border-white/5">
                      {scene.media_url ? (
                        scene.media_type === 'video' ? (
                          <video src={scene.media_url} className="w-full h-full object-cover" />
                        ) : (
                          <img src={scene.media_url} alt="" className="w-full h-full object-cover" />
                        )
                      ) : NEEDS_MEDIA.has(scene.scene_type || '') ? (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                          <ImageIcon size={16} />
                        </div>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 via-background to-secondary/20">
                          <Palette size={14} className="text-primary/40" />
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1">
                         <div className="text-[9px] text-white font-mono text-right mr-1">
                            {((scene.end_ms - scene.start_ms) / 1000).toFixed(1)}s
                         </div>
                      </div>
                      {isActive && <div className="absolute inset-0 border-2 border-primary rounded-lg" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className={cn("text-[10px] font-bold uppercase tracking-wider", isActive ? "text-primary" : "text-muted-foreground")}>
                            Cảnh {index + 1}
                        </span>
                        <Badge variant="outline" className="text-[8px] px-1 py-0 h-4 font-mono">
                          {SCENE_TYPE_LABELS[scene.scene_type || ''] || scene.scene_type || '?'}
                        </Badge>
                      </div>
                      <p className={cn("text-xs line-clamp-2 leading-relaxed italic opacity-80", isActive ? "text-foreground" : "text-muted-foreground")}>
                        "{scene.narration}"
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Add CTA scene */}
            <div className="p-3 border-t border-white/5">
              {(videoProps as any).settings?.cta?.enabled ? (
                <div className="p-3 bg-primary/10 rounded-xl border border-primary/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-primary">🎬 Cảnh cuối</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 text-[10px] text-destructive hover:text-destructive"
                      onClick={() => {
                        const settings = { ...((videoProps as any).settings || {}) }
                        settings.cta = { enabled: false, media_url: null, media_type: 'video', duration_ms: 3000 }
                        onPropsUpdate({ ...videoProps, settings } as any)
                      }}
                    >
                      Xóa
                    </Button>
                  </div>
                  {(videoProps as any).settings?.cta?.media_url ? (
                    <>
                      <div className="flex items-center gap-2 p-2 bg-green-500/10 rounded-lg border border-green-500/20">
                        <span className="text-green-400 text-xs font-bold">✓ Đã thêm</span>
                        <span className="text-[10px] text-muted-foreground truncate flex-1">
                          {(videoProps as any).settings.cta.media_url.split('/').pop()}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">Kéo thả file mới để thay đổi:</p>
                    </>
                  ) : (
                    <p className="text-[10px] text-muted-foreground">Chưa có media — kéo thả hoặc chọn file</p>
                  )}
                  {/* CTA upload with drag-and-drop */}
                  <div>
                    <input
                      type="file"
                      accept="video/mp4,video/webm,image/jpeg,image/png,image/webp"
                      className="hidden"
                      id="cta-upload"
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (file) handleCtaUpload(file)
                      }}
                    />
                    <label
                      htmlFor="cta-upload"
                      onDragOver={(e) => { e.preventDefault(); setCtaDragOver(true) }}
                      onDragLeave={() => setCtaDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault()
                        setCtaDragOver(false)
                        const file = e.dataTransfer.files?.[0]
                        if (file) handleCtaUpload(file)
                      }}
                      className={`flex flex-col items-center justify-center gap-1 p-3 border border-dashed rounded-lg cursor-pointer transition-colors ${
                        ctaDragOver ? 'border-primary bg-primary/10 scale-[1.02]' : 'border-white/10 hover:border-primary/30 hover:bg-muted/20'
                      }`}
                    >
                      <Upload className="w-4 h-4 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">{(videoProps as any).settings?.cta?.media_url ? 'Thay đổi file' : 'Kéo thả hoặc chọn file'}</span>
                      <span className="text-[9px] text-muted-foreground/50">Video (MP4, WebM) • Ảnh (JPG, PNG, WebP)</span>
                    </label>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full gap-2 text-xs border-dashed border-white/10 hover:border-primary/30"
                  onClick={() => {
                    const settings = { ...((videoProps as any).settings || {}) }
                    settings.cta = { enabled: true, media_url: null, media_type: 'video', duration_ms: 3000 }
                    onPropsUpdate({ ...videoProps, settings } as any)
                  }}
                >
                  <span className="text-lg">+</span>
                  Thêm cảnh cuối
                </Button>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* MIDDLE PANE: Video Preview — fixed, no scroll */}
        <div className="flex flex-col bg-muted/5 items-center justify-center p-8 relative overflow-hidden">
          <div className="relative isolate aspect-[9/16] h-full max-h-[680px] border shadow-2xl rounded-2xl overflow-hidden bg-black group-hover:ring-1 ring-white/10 transition-all">
            {/* [CryptoVN Custom] Custom background layer behind all scene content */}
            {(videoProps as any).settings?.custom_background_url && (
              <div className="absolute inset-0 -z-10">
                {(videoProps as any).settings?.custom_background_type === 'video' ? (
                  <video
                    src={`/api/demo/${(videoProps as any).settings.custom_background_url}`}
                    className="w-full h-full object-cover"
                    autoPlay muted loop playsInline
                  />
                ) : (
                  <img
                    src={`/api/demo/${(videoProps as any).settings.custom_background_url}`}
                    className="w-full h-full object-cover"
                    alt=""
                  />
                )}
                <div className="absolute inset-0 bg-black/20" />
              </div>
            )}
            {getPreviewUrl(selectedScene) ? (
              <>
                {/* Media loading overlay */}
                {mediaLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
                    <LoaderCircle className="w-6 h-6 animate-spin text-primary" />
                  </div>
                )}
                {/* Media error fallback */}
                {mediaError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/40 z-10 gap-2">
                    <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
                    <span className="text-xs text-muted-foreground">Media không tải được</span>
                  </div>
                )}

                {/* Bug 2: Layout-aware media rendering */}
                {selectedScene?.scene_type === 'media_showcase' && (selectedScene?.media_layout || 'cinema') === 'cinema' ? (
                  // Cinema layout: 16:9 container in center with title above
                  <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-4" 
                       style={{ background: (videoProps as any).settings?.custom_background_url ? 'transparent' : (palette.background || '#0a0a0a') }}>
                    <p className="text-sm font-bold text-center px-6 line-clamp-2" 
                       style={{ color: palette.text || '#fff' }}>
                      {selectedScene?.visual_description || selectedScene?.narration}
                    </p>
                    <div className="w-[85%] aspect-video rounded-xl overflow-hidden shadow-2xl border border-white/10">
                      {selectedScene.media_type === 'video' ? (
                        <video
                          key={getPreviewUrl(selectedScene)!}
                          src={getPreviewUrl(selectedScene)!}
                          autoPlay muted loop
                          className="w-full h-full object-cover"
                          onLoadedData={() => setMediaLoading(false)}
                          onError={() => { setMediaLoading(false); setMediaError(true) }}
                        />
                      ) : (
                        <img
                          key={getPreviewUrl(selectedScene)!}
                          src={getPreviewUrl(selectedScene)!}
                          alt=""
                          className="w-full h-full object-cover"
                          onLoad={() => setMediaLoading(false)}
                          onError={() => { setMediaLoading(false); setMediaError(true) }}
                        />
                      )}
                    </div>
                  </div>
                ) : selectedScene?.scene_type === 'media_showcase' && selectedScene?.media_layout === 'fit' ? (
                  // Fit layout: media width=100%, natural height, centered vertically
                  <div className="w-full h-full flex items-center justify-center"
                       style={{ background: (videoProps as any).settings?.custom_background_url ? 'transparent' : (palette.background || '#0a0a0a') }}>
                    {selectedScene.media_type === 'video' ? (
                      <video
                        key={getPreviewUrl(selectedScene)!}
                        src={getPreviewUrl(selectedScene)!}
                        autoPlay muted loop
                        className="w-full"
                        style={{ objectFit: 'contain' }}
                        onLoadedData={() => setMediaLoading(false)}
                        onError={() => { setMediaLoading(false); setMediaError(true) }}
                      />
                    ) : (
                      <img
                        key={getPreviewUrl(selectedScene)!}
                        src={getPreviewUrl(selectedScene)!}
                        alt=""
                        className="w-full"
                        style={{ objectFit: 'contain' }}
                        onLoad={() => setMediaLoading(false)}
                        onError={() => { setMediaLoading(false); setMediaError(true) }}
                      />
                    )}
                  </div>
                ) : selectedScene?.scene_type === 'news_intro' ? (
                  // [CryptoVN Custom] NewsIntro: media top 50%, brand overlay bottom 50%
                  <div className="w-full h-full flex flex-col relative" style={{ background: (videoProps as any).settings?.custom_background_url ? 'transparent' : '#0a1200' }}>
                    {/* Top half: media with cover */}
                    <div className="w-full h-1/2 overflow-hidden">
                      {selectedScene.media_type === 'video' ? (
                        <video
                          key={getPreviewUrl(selectedScene)!}
                          src={getPreviewUrl(selectedScene)!}
                          autoPlay muted loop
                          className="w-full h-full object-cover object-center"
                          onLoadedData={() => setMediaLoading(false)}
                          onError={() => { setMediaLoading(false); setMediaError(true) }}
                        />
                      ) : (
                        <img
                          key={getPreviewUrl(selectedScene)!}
                          src={getPreviewUrl(selectedScene)!}
                          alt=""
                          className="w-full h-full object-cover object-center"
                          onLoad={() => setMediaLoading(false)}
                          onError={() => { setMediaLoading(false); setMediaError(true) }}
                        />
                      )}
                    </div>
                    {/* Gradient overlay + brand info */}
                    <div className="absolute bottom-0 left-0 right-0 h-[55%] bg-gradient-to-b from-transparent via-[#0a1200]/80 to-[#0a1200]/95 flex flex-col justify-end px-5 pb-16 gap-2">
                      <div className="w-12 h-[3px] rounded-full" style={{ backgroundColor: '#C6FD01' }} />
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-md bg-[#C6FD01]/20 flex items-center justify-center">
                          <span className="text-[9px] font-black" style={{ color: '#C6FD01' }}>CV</span>
                        </div>
                        <span className="text-base font-extrabold" style={{ color: '#C6FD01' }}>CryptoVN 101</span>
                      </div>
                      <p className="text-sm font-bold leading-tight line-clamp-3 uppercase" style={{ color: '#fff' }}>
                        {selectedScene.narration?.slice(0, 100)}
                      </p>
                    </div>
                  </div>
                ) : (
                  // Fullscreen layout (default for all other types)
                  <>
                    {selectedScene.media_type === 'video' ? (
                      <video 
                        key={getPreviewUrl(selectedScene)!}
                        src={getPreviewUrl(selectedScene)!} 
                        autoPlay muted loop 
                        className="w-full h-full object-cover" 
                        onLoadedData={() => setMediaLoading(false)}
                        onError={() => { setMediaLoading(false); setMediaError(true) }}
                      />
                    ) : (
                      <img
                        src={getPreviewUrl(selectedScene)!}
                        alt=""
                        className="w-full h-full object-cover"
                        onLoad={() => setMediaLoading(false)}
                        onError={() => { setMediaLoading(false); setMediaError(true) }}
                      />
                    )}
                  </>
                )}
                
                {/* Subtitle Overlay Mockup */}
                <div className="absolute bottom-20 left-6 right-6 text-center">
                  <p className="text-white text-xl font-bold drop-shadow-2xl leading-tight uppercase tracking-tight" style={{ 
                    textShadow: '0 2px 4px rgba(0,0,0,0.8), 0 0 20px rgba(0,0,0,0.6)',
                    WebkitTextStroke: '0.8px rgba(0,0,0,0.4)'
                  }}>
                    {selectedScene.narration}
                  </p>
                </div>
              </>
            ) : !NEEDS_MEDIA.has(selectedScene?.scene_type || '') ? (
              <div className="w-full h-full relative">
                <ScenePreviewMockup scene={selectedScene} palette={palette} hasCustomBg={!!(videoProps as any).settings?.custom_background_url} />
                {/* Subtitle overlay */}
                <div className="absolute bottom-20 left-6 right-6 text-center">
                  <p className="text-foreground/80 text-lg font-bold leading-tight">
                    {selectedScene?.narration}
                  </p>
                </div>
              </div>
            ) : (
              // Bug 1B: Clear placeholder instead of infinite spinner
              <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-4 bg-muted/20">
                <ImageIcon className="w-12 h-12 opacity-20" />
                <span className="text-sm font-medium opacity-60">Chưa có media</span>
                <span className="text-xs opacity-40">Tìm trên Pexels hoặc tải lên từ máy tính</span>
              </div>
            )}
            
            {/* Play Button Overlay */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/40 cursor-default">
               <div className="bg-white/10 backdrop-blur-xl p-5 rounded-full border border-white/20 shadow-2xl transform scale-90 hover:scale-100 transition-transform cursor-pointer">
                  <Play size={40} className="text-white fill-white ml-1.5" />
               </div>
            </div>
          </div>
          
          {/* Metadata floating badges */}
          <div className="absolute top-10 left-10 flex flex-col gap-3">
            <div className="bg-background/40 backdrop-blur-md border border-white/5 shadow-xl rounded-full px-4 py-2 flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-mono">{(selectedScene?.start_ms / 1000).toFixed(1)}s → {(selectedScene?.end_ms / 1000).toFixed(1)}s</span>
            </div>
            <div className="bg-background/40 backdrop-blur-md border border-white/5 shadow-xl rounded-full px-4 py-2 flex items-center gap-2">
                <Film className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-medium capitalize">{selectedScene?.media_type || 'Media'}</span>
            </div>
          </div>
        </div>

        {/* RIGHT PANE: Property Editor */}
        <div className="border-l flex flex-col bg-card/10 backdrop-blur-sm h-full overflow-hidden">
          <div className="p-4 border-b flex items-center gap-2 font-semibold bg-muted/10 shrink-0">
            <Settings2 className="w-4 h-4 text-primary" />
            <span className="text-sm">Thuộc tính Cảnh {selectedSceneIndex + 1}</span>
          </div>
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-6 space-y-8">
              <div className="space-y-3">
                <Label htmlFor="narration" className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Lời thoại (Narration)</Label>
                <Textarea 
                  id="narration"
                  value={selectedScene?.narration || ''}
                  onChange={(e) => {
                    const newProps = { ...videoProps }
                    const scenes = [...newProps.scenes]
                    scenes[selectedSceneIndex] = { ...selectedScene, narration: e.target.value }
                    onPropsUpdate({ ...newProps, scenes })
                  }}
                  className="min-h-[140px] resize-none leading-relaxed text-sm bg-muted/20 border-white/5 focus-visible:ring-primary/20"
                  placeholder="Nhập lời thoại..."
                />
              </div>

              <Separator className="bg-white/5" />

              {/* Scene Type Selector */}
              <div className="space-y-3">
                <Label className="text-xs uppercase tracking-widest text-muted-foreground font-bold">
                  Loại cảnh (Scene Type)
                </Label>
                <Select
                  value={selectedScene?.scene_type || 'stock_background'}
                  onValueChange={(val) => {
                    if (!val) return  // Ignore deselect
                    const newProps = { ...videoProps }
                    const scenes = [...newProps.scenes]
                    const oldType = selectedScene?.scene_type || ''
                    const newNeedsMedia = NEEDS_MEDIA.has(val)
                    const oldNeedsMedia = NEEDS_MEDIA.has(oldType)
                    
                    scenes[selectedSceneIndex] = { 
                      ...selectedScene, 
                      scene_type: val,
                      // Clear media when switching stock → non-stock
                      ...(!newNeedsMedia && oldNeedsMedia ? { media_url: null, media_type: null } : {}),
                    }
                    onPropsUpdate({ ...newProps, scenes })
                    
                    // Bug 1A: Auto-search when switching to stock type without media
                    if (newNeedsMedia && !selectedScene?.media_url) {
                      const searchQuery = selectedScene?.image_query || selectedScene?.video_query || (selectedScene as any)?.semantic_image_query || ''
                      if (searchQuery) {
                        toast.info('Đang tìm media phù hợp...')
                        api.post(`/jobs/${jobId}/scenes/${selectedSceneIndex}/re-search`, {
                          image_query: searchQuery,
                          video_query: searchQuery,
                        }).then(result => {
                          const updatedProps = { ...newProps }
                          const updatedScenes = [...updatedProps.scenes]
                          updatedScenes[selectedSceneIndex] = {
                            ...updatedScenes[selectedSceneIndex],
                            scene_type: val,
                            media_url: result.media_url,
                            media_type: result.media_type,
                          }
                          onPropsUpdate({ ...updatedProps, scenes: updatedScenes })
                          toast.success('Đã tìm thấy media!')
                        }).catch(() => {
                          toast.error('Không tìm được media. Hãy thử đổi từ khóa hoặc upload file.')
                        })
                      } else {
                        toast.info('Cảnh này cần media. Hãy nhập từ khóa hoặc tải lên từ máy.')
                      }
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

              {/* Media Search — for scenes that need stock media */}
              {NEEDS_MEDIA.has(selectedScene?.scene_type || '') ? (
              <>
              <div className="space-y-4">
                <Label className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Từ khóa tìm kiếm (Media)</Label>
                <SceneMediaSearch 
                  key={selectedSceneIndex}
                  scene={selectedScene} 
                  index={selectedSceneIndex} 
                  jobId={jobId} 
                  videoProps={videoProps} 
                  onPropsUpdate={onPropsUpdate} 
                />
              </div>
              
              {/* Warning when media needed but missing */}
              {!getPreviewUrl(selectedScene) && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg animate-in fade-in duration-200">
                  <p className="text-xs text-amber-400 flex items-center gap-2 mb-2">
                    <ImageIcon className="w-3.5 h-3.5" />
                    Cảnh này cần media nhưng chưa có
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Bấm vào "Từ khóa hiện tại" để tìm trên Pexels, hoặc kéo thả file vào đây.
                  </p>
                </div>
              )}
              </>
              ) : (
              <div className="space-y-3">
                <Label className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Media</Label>
                <div className="p-4 bg-muted/30 rounded-xl border border-white/5 flex items-center gap-3">
                  <Palette className="w-4 h-4 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Cảnh <span className="font-semibold capitalize">{SCENE_TYPE_LABELS[selectedScene?.scene_type || ''] || selectedScene?.scene_type}</span> dùng nền gradient tự động.</p>
                </div>
              </div>
              )}

              <Separator className="bg-white/5" />

              {/* Comparison editor — [CryptoVN Custom] */}
              {selectedScene?.scene_type === 'comparison' && selectedScene?.comparison_sides && (
                <div className="space-y-3">
                  <Label className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Nội dung so sánh</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {selectedScene.comparison_sides.map((side, i) => (
                      <div key={i} className="p-3 bg-muted/30 rounded-xl border border-white/5 space-y-2">
                        <Input
                          value={side.label}
                          onChange={(e) => {
                            const newProps = { ...videoProps }
                            const scenes = [...newProps.scenes]
                            const sides = [...(selectedScene.comparison_sides || [])]
                            sides[i] = { ...sides[i], label: e.target.value }
                            scenes[selectedSceneIndex] = { ...selectedScene, comparison_sides: sides }
                            onPropsUpdate({ ...newProps, scenes })
                          }}
                          className="h-7 text-xs font-bold bg-muted/20 border-white/5"
                          placeholder="Nhãn..."
                        />
                        <div className="space-y-1">
                          {side.points.map((p, j) => (
                            <div key={j} className="flex items-center gap-1">
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
                </div>
              )}

              {/* Timeline editor — [CryptoVN Custom] */}
              {selectedScene?.scene_type === 'timeline' && selectedScene?.timeline_events && (
                <div className="space-y-3">
                  <Label className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Dòng thời gian</Label>
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
                          className="h-6 text-xs bg-muted/20 border-white/5 flex-1"
                        />
                        {selectedScene.timeline_events!.length > 3 && (
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
                        )}
                      </div>
                    ))}
                    {(selectedScene.timeline_events?.length ?? 0) < 5 && (
                      <button
                        className="text-[10px] text-primary/60 hover:text-primary w-full text-center py-1"
                        onClick={() => {
                          const newProps = { ...videoProps }
                          const scenes = [...newProps.scenes]
                          const events = [...(selectedScene.timeline_events || []), { label: '', title: '', description: '' }]
                          scenes[selectedSceneIndex] = { ...selectedScene, timeline_events: events }
                          onPropsUpdate({ ...newProps, scenes })
                        }}
                      >+ Thêm sự kiện</button>
                    )}
                  </div>
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
                      </div>
                    ))}
                  </div>
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

              <Separator className="bg-white/5" />

              {/* Media Layout selector — only for media_showcase */}
              {selectedScene?.scene_type === 'media_showcase' && (
                <div className="space-y-2">
                  <Label htmlFor="media-layout" className="text-xs uppercase tracking-widest text-muted-foreground font-bold">
                    Kiểu hiển thị Media
                  </Label>
                  <Select
                    value={selectedScene?.media_layout || 'fit'}
                    onValueChange={(val) => {
                      const newProps = { ...videoProps }
                      const scenes = [...newProps.scenes]
                      scenes[selectedSceneIndex] = { ...selectedScene, media_layout: val }
                      onPropsUpdate({ ...newProps, scenes })
                    }}
                  >
                    <SelectTrigger id="media-layout" className="bg-muted/20 border-white/5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cinema">
                        <div className="flex items-center gap-2">
                          <span className="text-base">🎬</span>
                          <div>
                            <div className="font-medium">Cinema (ngang 16:9)</div>
                            <div className="text-[10px] text-muted-foreground">Video nằm giữa, có title phía trên</div>
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="fullscreen">
                        <div className="flex items-center gap-2">
                          <span className="text-base">📱</span>
                          <div>
                            <div className="font-medium">Toàn màn hình (dọc)</div>
                            <div className="text-[10px] text-muted-foreground">Video phủ kín, phù hợp video dọc</div>
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="fit">
                        <div className="flex items-center gap-2">
                          <span className="text-base">🖼️</span>
                          <div>
                            <div className="font-medium">Vừa chiều rộng (Fit)</div>
                            <div className="text-[10px] text-muted-foreground">Giữ nguyên tỷ lệ, không cắt</div>
                          </div>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-4">
                <Label htmlFor="transition" className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Hiệu ứng chuyển cảnh</Label>
                <Select
                  value={selectedScene?.transition || 'fade'}
                  onValueChange={(val) => {
                    const newProps = { ...videoProps }
                    const scenes = [...newProps.scenes]
                    scenes[selectedSceneIndex] = { ...selectedScene, transition: val }
                    onPropsUpdate({ ...newProps, scenes })
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

              {/* Emoji pop-up editor */}
              <div className="space-y-3">
                <Label className="text-xs uppercase tracking-widest text-muted-foreground font-bold">
                  Emoji Pop-up
                </Label>
                
                {/* Current emoji display */}
                {(selectedScene as any)?.emoji && (
                  <div className="flex items-center gap-2 p-2 bg-primary/10 rounded-lg border border-primary/20">
                    <span className="text-2xl">{(selectedScene as any).emoji}</span>
                    <span className="text-xs text-muted-foreground flex-1">Đang chọn</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px] text-destructive hover:text-destructive"
                      onClick={() => {
                        const newProps = { ...videoProps }
                        const scenes = [...newProps.scenes]
                        scenes[selectedSceneIndex] = { ...selectedScene, emoji: null } as any
                        onPropsUpdate({ ...newProps, scenes })
                      }}
                    >
                      Xóa
                    </Button>
                  </div>
                )}
                
                {/* Emoji picker grid */}
                <div className="grid grid-cols-8 gap-1">
                  {['🚀','💡','🔥','⚡','💰','📈','🎯','✨',
                    '🤖','🧠','💻','📊','🏆','⭐','🎉','💎',
                    '⚠️','🔒','❤️','🌍','📚','🎬','💬','👑'].map(em => (
                    <button
                      key={em}
                      className={`text-xl p-1.5 rounded-lg hover:bg-muted/40 transition-colors ${
                        (selectedScene as any)?.emoji === em ? 'bg-primary/20 ring-1 ring-primary' : ''
                      }`}
                      onClick={() => {
                        const newProps = { ...videoProps }
                        const scenes = [...newProps.scenes]
                        scenes[selectedSceneIndex] = { ...selectedScene, emoji: em } as any
                        onPropsUpdate({ ...newProps, scenes })
                      }}
                    >
                      {em}
                    </button>
                  ))}
                </div>
                
                {/* Custom emoji input (fallback) */}
                <Input
                  placeholder="Hoặc gõ emoji tùy chọn..."
                  value={(selectedScene as any)?.emoji || ''}
                  onChange={(e) => {
                    const newProps = { ...videoProps }
                    const scenes = [...newProps.scenes]
                    scenes[selectedSceneIndex] = { ...selectedScene, emoji: e.target.value || null } as any
                    onPropsUpdate({ ...newProps, scenes })
                  }}
                  className="h-8 text-sm bg-muted/20 border-white/5"
                />
                
                <p className="text-[10px] text-muted-foreground">
                  Emoji sẽ xuất hiện pop-up trong video. AI tự chọn khi tạo, bạn có thể thay đổi.
                </p>
              </div>

              {palette && (
                <div className="space-y-4">
                   <Label className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Bảng màu hệ thống</Label>
                   <p className="text-[10px] text-muted-foreground">Click vào ô màu để thay đổi</p>
                   <div className="grid grid-cols-4 gap-2">
                     {Object.entries(palette).map(([key, color]) => (
                        <div key={key} className="relative group">
                          <label 
                            className="block w-full h-10 rounded-lg border border-white/10 shadow-sm cursor-pointer hover:scale-105 hover:border-white/30 transition-all"
                            style={{ backgroundColor: color }}
                            title={`${key}: ${color} — click để đổi`}
                          >
                            <input 
                              type="color"
                              value={color}
                              className="sr-only"
                              onChange={(e) => {
                                const newPalette = { ...palette, [key]: e.target.value }
                                onPropsUpdate({ ...videoProps, color_palette: newPalette } as any)
                              }}
                            />
                          </label>
                          <span className="block text-[9px] text-center text-muted-foreground mt-1 capitalize">{key}</span>
                        </div>
                     ))}
                   </div>
                </div>
              )}

              <Separator className="bg-white/5" />

              {/* ═══ Advanced Settings (Video-level) ═══ */}
              <div className="space-y-6">
                <Label className="text-xs uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-2">
                  <Settings2 className="w-3.5 h-3.5" />
                  Cài đặt nâng cao
                </Label>


                {/* ── Watermark ── */}
                <div className="space-y-3 p-4 bg-muted/20 rounded-xl border border-white/5">
                  <span className="text-xs font-semibold">Watermark</span>
                  
                  {/* Mode selector */}
                  <Select
                    value={(videoProps as any).settings?.watermark_mode || 'text'}
                    onValueChange={(val) => {
                      const settings = { ...((videoProps as any).settings || {}) }
                      settings.watermark_mode = val
                      onPropsUpdate({ ...videoProps, settings } as any)
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

                  {/* Text input (for text/both modes) */}
                  {['text', 'both'].includes((videoProps as any).settings?.watermark_mode || 'text') && (
                    <Input
                      placeholder="Text watermark (vd: @autoclip)"
                      value={(videoProps as any).settings?.watermark_text || ''}
                      onChange={(e) => {
                        const settings = { ...((videoProps as any).settings || {}) }
                        settings.watermark_text = e.target.value || null
                        onPropsUpdate({ ...videoProps, settings } as any)
                      }}
                      className="h-8 text-xs bg-muted/20 border-white/5"
                    />
                  )}

                  {/* Logo upload (for logo/both modes) */}
                  {['logo', 'both'].includes((videoProps as any).settings?.watermark_mode || 'text') && (
                    <div className="space-y-2">
                      {(videoProps as any).settings?.watermark_logo_url ? (
                        <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
                          <img
                            src={`/api/demo/${(videoProps as any).settings.watermark_logo_url}`}
                            alt="Logo"
                            className="w-8 h-8 object-contain"
                          />
                          <span className="text-[10px] text-muted-foreground flex-1 truncate">
                            {(videoProps as any).settings.watermark_logo_url.split('/').pop()}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-5 text-[10px] text-destructive"
                            onClick={() => {
                              const settings = { ...((videoProps as any).settings || {}) }
                              settings.watermark_logo_url = null
                              onPropsUpdate({ ...videoProps, settings } as any)
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
                                const settings = { ...((videoProps as any).settings || {}) }
                                settings.watermark_logo_url = result.logo_url
                                onPropsUpdate({ ...videoProps, settings } as any)
                                toast.success('Đã upload logo!')
                              } catch (err: any) {
                                toast.error('Upload thất bại: ' + err.message)
                              }
                            }}
                          />
                          <label
                            htmlFor="logo-upload"
                            className="flex items-center justify-center gap-2 p-3 border border-dashed border-white/10 rounded-lg cursor-pointer hover:border-primary/30 transition-colors"
                          >
                            <Upload className="w-4 h-4 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">Upload logo (PNG, JPG, WebP)</span>
                          </label>
                        </>
                      )}
                    </div>
                  )}

                  {/* Position + Opacity */}
                  <div className="flex gap-2">
                    <Select
                      value={(videoProps as any).settings?.watermark_position || 'top-right'}
                      onValueChange={(val) => {
                        const settings = { ...((videoProps as any).settings || {}) }
                        settings.watermark_position = val
                        onPropsUpdate({ ...videoProps, settings } as any)
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs bg-muted/20 border-white/5 flex-1">
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
                    <span className="text-[10px] text-muted-foreground shrink-0">Opacity</span>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      step="5"
                      value={Math.round(((videoProps as any).settings?.watermark_opacity ?? 0.5) * 100)}
                      onChange={(e) => {
                        const settings = { ...((videoProps as any).settings || {}) }
                        settings.watermark_opacity = parseInt(e.target.value) / 100
                        onPropsUpdate({ ...videoProps, settings } as any)
                      }}
                      className="flex-1 h-1.5 accent-primary"
                    />
                    <span className="text-[10px] text-muted-foreground w-8 text-right">
                      {Math.round(((videoProps as any).settings?.watermark_opacity ?? 0.5) * 100)}%
                    </span>
                  </div>
                </div>

                {/* ── SFX ── */}
                <div className="space-y-3 p-4 bg-muted/20 rounded-xl border border-white/5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">Hiệu ứng âm thanh (SFX)</span>
                    <Button
                      size="sm"
                      variant={(videoProps as any).settings?.sfx?.enabled !== false ? "default" : "outline"}
                      className="h-6 text-[10px] px-2"
                      onClick={() => {
                        const settings = { ...((videoProps as any).settings || {}) }
                        const sfx = { ...(settings.sfx || { enabled: true, volume: 0.25 }) }
                        sfx.enabled = !sfx.enabled
                        settings.sfx = sfx
                        onPropsUpdate({ ...videoProps, settings } as any)
                      }}
                    >
                      {(videoProps as any).settings?.sfx?.enabled !== false ? 'BẬT' : 'TẮT'}
                    </Button>
                  </div>
                  {(videoProps as any).settings?.sfx?.enabled !== false && (
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-muted-foreground shrink-0">Âm lượng</span>
                      <input
                        type="range"
                        min="5"
                        max="100"
                        step="5"
                        value={Math.round(((videoProps as any).settings?.sfx?.volume ?? 0.25) * 100)}
                        onChange={(e) => {
                          const settings = { ...((videoProps as any).settings || {}) }
                          const sfx = { ...(settings.sfx || { enabled: true, volume: 0.25 }) }
                          sfx.volume = parseInt(e.target.value) / 100
                          settings.sfx = sfx
                          onPropsUpdate({ ...videoProps, settings } as any)
                        }}
                        className="flex-1 h-1.5 accent-primary"
                      />
                      <span className="text-[10px] text-muted-foreground w-8 text-right">
                        {Math.round(((videoProps as any).settings?.sfx?.volume ?? 0.25) * 100)}%
                      </span>
                    </div>
                  )}
                </div>

                {/* ── Subtitle Preset ── */}
                <div className="space-y-3 p-4 bg-muted/20 rounded-xl border border-white/5">
                  <span className="text-xs font-semibold">Kiểu phụ đề</span>
                  <Select
                    value={(videoProps as any).settings?.subtitle?.preset || 'default'}
                    onValueChange={(val) => {
                      const settings = { ...((videoProps as any).settings || {}) }
                      const subtitle = { ...(settings.subtitle || {}) }
                      subtitle.preset = val
                      settings.subtitle = subtitle
                      onPropsUpdate({ ...videoProps, settings } as any)
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs bg-muted/20 border-white/5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Mặc định</SelectItem>
                      <SelectItem value="bold_pop">Bold Pop (nổi bật)</SelectItem>
                      <SelectItem value="karaoke">Karaoke (mờ → sáng)</SelectItem>
                      <SelectItem value="minimal">Minimal (nhỏ gọn)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* 🎨 Custom Background — [CryptoVN Custom] */}
                <div className="space-y-3 p-4 bg-muted/20 rounded-xl border border-white/5">
                  <span className="text-xs font-semibold">🎨 Hình nền tùy chỉnh</span>
                  <p className="text-[10px] text-muted-foreground">
                    Upload ảnh/video thay thế gradient nền. Bỏ trống để dùng preset mặc định.
                  </p>

                  {/* Hidden file input — shared by both "Thay" button and upload label */}
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
                        const settings = { ...((videoProps as any).settings || {}) }
                        settings.custom_background_url = result.bg_url
                        settings.custom_background_type = result.bg_type
                        settings.custom_background_duration_sec = result.bg_duration_sec
                        onPropsUpdate({ ...videoProps, settings } as any)
                        toast.success('Đã upload hình nền!')
                      } catch (err: any) {
                        toast.error('Upload thất bại: ' + err.message)
                      }
                      // Reset input so re-uploading same file triggers onChange
                      e.target.value = ''
                    }}
                  />

                  {(videoProps as any).settings?.custom_background_url ? (
                    <div className="space-y-2">
                      {/* Visual preview */}
                      <div className="relative w-full h-24 rounded-lg overflow-hidden bg-black">
                        {(videoProps as any).settings?.custom_background_type === 'video' ? (
                          <video
                            src={`/api/demo/${(videoProps as any).settings.custom_background_url}`}
                            className="w-full h-full object-cover opacity-80"
                            autoPlay muted loop playsInline
                          />
                        ) : (
                          <img
                            src={`/api/demo/${(videoProps as any).settings.custom_background_url}`}
                            className="w-full h-full object-cover opacity-80"
                            alt="Custom background"
                          />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                        <span className="absolute bottom-1.5 left-2 text-[10px] text-white/80 font-medium">
                          Hình nền hiện tại
                        </span>
                      </div>
                      <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
                        <span className="text-lg">
                          {(videoProps as any).settings?.custom_background_type === 'video' ? '🎬' : '🖼️'}
                        </span>
                        <span className="text-[10px] text-muted-foreground flex-1 truncate">
                          {((videoProps as any).settings.custom_background_url || '').split('/').pop()}
                        </span>
                        <label
                          htmlFor="bg-upload"
                          className="h-5 px-1.5 text-[10px] text-primary cursor-pointer hover:underline flex items-center"
                        >
                          Thay
                        </label>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-5 text-[10px] text-destructive"
                          onClick={() => {
                            const settings = { ...((videoProps as any).settings || {}) }
                            settings.custom_background_url = null
                            settings.custom_background_type = 'image'
                            settings.custom_background_duration_sec = null
                            onPropsUpdate({ ...videoProps, settings } as any)
                          }}
                        >
                          Xóa
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <label
                      htmlFor="bg-upload"
                      className="flex items-center justify-center gap-2 p-3 border border-dashed border-white/10 rounded-lg cursor-pointer hover:border-primary/30 transition-colors"
                    >
                      <Upload className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Upload ảnh hoặc video nền</span>
                    </label>
                  )}
                </div>
              </div>

            </div>
          </ScrollArea>
        </div>
      </div>

      {/* BOTTOM ACTION BAR */}
      <div className="h-20 px-8 border-t flex items-center justify-between bg-card/30 backdrop-blur-xl shadow-2xl relative z-10">
        <Button variant="ghost" onClick={onBackToSetup} className="gap-2 text-muted-foreground hover:text-foreground hover:bg-white/5">
          <ArrowLeft size={16} /> Quay lại Bước 1
        </Button>
        
        <div className="flex items-center gap-6">
           <div className="text-right hidden sm:block">
              <div className="text-sm font-bold">{scenes.length} cảnh tổng cộng</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono">
                Thời lượng: {((scenes[scenes.length - 1]?.end_ms || 0) / 1000).toFixed(1)}s
              </div>
           </div>
           <Separator orientation="vertical" className="h-10 bg-white/5" />
           <Button 
            size="lg" 
            className="h-12 gap-2 px-10 font-bold bg-primary hover:bg-primary/90 shadow-[0_0_20px_rgba(var(--primary),0.3)] transition-all transform hover:scale-[1.02] active:scale-[0.98]"
            onClick={handleRender}
            disabled={rendering}
           >
            {rendering ? (
              <RefreshCw size={18} className="animate-spin" />
            ) : (
              <Clapperboard size={18} />
            )}
            {rendering ? 'Đang chuẩn bị...' : 'Bắt đầu Render kết quả'}
           </Button>
        </div>
      </div>
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
      toast.success(`Đã tìm thấy media mới cho cảnh ${index + 1}`)
      
      const newProps = { ...videoProps }
      const scenes = [...newProps.scenes]
      scenes[index] = {
        ...scenes[index],
        media_url: result.media_url,
        media_type: result.media_type,
        image_query: query,
      }
      onPropsUpdate({ ...newProps, scenes })
      setEditing(false)
    } catch (err: any) {
      toast.error('Tìm kiếm thất bại: ' + err.message)
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
    try {
      const formData = new FormData()
      formData.append('file', file)

      const result = await api.upload(
        `/jobs/${jobId}/scenes/${index}/upload-media`,
        formData
      )

      toast.success(`Đã tải lên media cho cảnh ${index + 1}`)

      const newProps = { ...videoProps }
      const scenes = [...newProps.scenes]
      scenes[index] = {
        ...scenes[index],
        media_url: result.preview_url + '?t=' + Date.now(),  // Cache buster for re-uploads
        media_type: result.media_type,
      }
      onPropsUpdate({ ...newProps, scenes })
    } catch (err: any) {
      toast.error('Tải lên thất bại: ' + err.message)
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
              <p className="text-[10px] text-muted-foreground/50">
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
      <div className="p-4 bg-muted/40 rounded-xl border border-white/5 group relative hover:bg-muted/60 transition-all cursor-pointer shadow-inner" onClick={() => setEditing(true)}>
        <div className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground flex items-center justify-between mb-2">
          <span>Từ khóa hiện tại</span>
          <div className="bg-primary/10 text-primary p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
            <Edit3 size={10} />
          </div>
        </div>
        <p className="text-sm font-medium truncate italic text-foreground/80">"{query || 'Chưa có query'}"</p>
      </div>
      
      {/* Bug 5: Upload button toggles drag-drop zone */}
      <Button 
        size="sm" 
        variant={showUpload ? "default" : "outline"}
        className="w-full gap-2 text-xs"
        onClick={(e) => { 
          e.stopPropagation()
          setShowUpload(!showUpload) 
        }}
        disabled={uploading}
      >
        <Upload className="w-3 h-3" />
        {showUpload ? 'Ẩn khu vực tải lên' : 'Tải ảnh/video lên'}
      </Button>

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
              <p className="text-[10px] text-muted-foreground/50">
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
