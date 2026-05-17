import { memo, useEffect, useRef, useState } from 'react'
import {
  Image as ImageIcon, Palette, ListVideo, Upload
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { api } from '@/api/client'
import { showErrorToast } from '@/components/SystemErrorReport'
import type { Scene, VideoProps } from './types'
import { NEEDS_MEDIA, SCENE_TYPE_LABELS, cn } from './constants'

function getPreviewUrl(scene: Scene): string | null {
  const url = scene.media_url
  if (!url) return null
  if (url.startsWith('http') || url.startsWith('/api/')) return url
  return scene._preview_url || null
}

function getScenePosterUrl(scene: Scene): string | null {
  if (scene.media_type !== 'video') return null
  return scene.poster_url || null
}

interface SceneThumbnailProps {
  scene: Scene
  isActive: boolean
}

const SceneThumbnail = memo(function SceneThumbnail({ scene, isActive }: SceneThumbnailProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [shouldLoadMedia, setShouldLoadMedia] = useState(false)

  const previewUrl = getPreviewUrl(scene)
  const posterUrl = getScenePosterUrl(scene)
  const needsMedia = NEEDS_MEDIA.has(scene.scene_type || '') && !(scene.scene_type === 'title_card' && (scene.layout || 'standard') === 'standard')

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
        rootMargin: '240px 0px',
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
          poster={posterUrl || undefined}
          muted
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
      className="relative shrink-0 w-20 h-12 rounded-lg bg-black/40 overflow-hidden shadow-inner border border-white/5"
    >
      {renderMedia()}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1">
        <div className="text-[9px] text-white font-mono text-right mr-1">
          {((scene.end_ms - scene.start_ms) / 1000).toFixed(1)}s
        </div>
      </div>
      {isActive && <div className="absolute inset-0 border-2 border-primary rounded-lg" />}
    </div>
  )
}, (prevProps, nextProps) => (
  prevProps.isActive === nextProps.isActive &&
  prevProps.scene.scene_type === nextProps.scene.scene_type &&
  prevProps.scene.media_url === nextProps.scene.media_url &&
  prevProps.scene._preview_url === nextProps.scene._preview_url &&
  prevProps.scene.media_type === nextProps.scene.media_type &&
  prevProps.scene.poster_url === nextProps.scene.poster_url &&
  prevProps.scene.start_ms === nextProps.scene.start_ms &&
  prevProps.scene.end_ms === nextProps.scene.end_ms
))

interface SceneListSidebarProps {
  scenes: Scene[]
  selectedSceneIndex: number
  onSelectScene: (index: number) => void
  videoProps: VideoProps
  jobId: string
  onPropsUpdate: (props: VideoProps) => void
}

export function SceneListSidebar({
  scenes,
  selectedSceneIndex,
  onSelectScene,
  videoProps,
  jobId,
  onPropsUpdate,
}: SceneListSidebarProps) {
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
      showErrorToast(err, {
        source: 'review_cta_upload',
        jobId,
        fallback: 'Upload thất bại',
        prefix: 'Upload thất bại',
      })
    }
  }

  return (
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
                <SceneThumbnail scene={scene} isActive={isActive} />
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
  )
}
