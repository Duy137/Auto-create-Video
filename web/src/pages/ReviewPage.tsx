import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { api } from "@/api/client"
import { showErrorToast } from "@/components/SystemErrorReport"
import { Play, Pause, RefreshCw, Image as ImageIcon, Type, GripVertical, Sparkles, ChevronLeft, ArrowUp, ArrowDown } from "lucide-react"

/* ============================================================
   Review — Timeline scene + media + subtitle, sửa trước render
   Pain point cũ: thiếu cảm giác kiểm soát, khó sửa từng scene
   ============================================================ */

type ApiScene = {
  scene_index?: number
  scene_type?: string
  narration?: string
  start_ms?: number
  end_ms?: number
  image_query?: string | null
  video_query?: string | null
  media_url?: string | null
  media_type?: string | null
  poster_url?: string | null
  [key: string]: unknown
}

type ApiJob = {
  id: string
  status: string
  props?: {
    title?: string
    scenes?: ApiScene[]
  } | null
}

function sceneDurationSec(scene: ApiScene): number {
  const start = Number(scene.start_ms ?? 0)
  const end = Number(scene.end_ms ?? start + 3000)
  return Math.max(0.5, (end - start) / 1000)
}

function retimeScenes(scenes: ApiScene[], targetIndex: number, durationSec: number): ApiScene[] {
  const durations = scenes.map(sceneDurationSec)
  durations[targetIndex] = Math.max(0.5, durationSec)

  let currentMs = 0
  return scenes.map((scene, idx) => {
    const dMs = Math.round(durations[idx] * 1000)
    const startMs = currentMs
    const endMs = startMs + dMs
    currentMs = endMs
    return {
      ...scene,
      start_ms: startMs,
      end_ms: endMs,
    }
  })
}

function normalizeSceneOrder(scenes: ApiScene[]): ApiScene[] {
  const durations = scenes.map(sceneDurationSec)
  let currentMs = 0

  return scenes.map((scene, idx) => {
    const dMs = Math.round(durations[idx] * 1000)
    const startMs = currentMs
    const endMs = startMs + dMs
    currentMs = endMs
    return {
      ...scene,
      scene_index: idx,
      start_ms: startMs,
      end_ms: endMs,
    }
  })
}

export default function ReviewPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()

  const [job, setJob] = useState<ApiJob | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [queryDraft, setQueryDraft] = useState("")
  const [subtitleDraft, setSubtitleDraft] = useState("")
  const [scenes, setScenes] = useState<ApiScene[]>([])

  const scenesRef = useRef<ApiScene[]>([])
  const activeIndexRef = useRef(0)
  const subtitleDraftRef = useRef("")
  const subtitleSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const durationSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadJob = useCallback(async () => {
    if (!jobId) {
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      const data = await api.get<ApiJob>(`/jobs/${jobId}`)
      const fetchedScenes = data.props?.scenes ?? []
      setJob(data)
      setScenes(fetchedScenes)
      setActiveIndex(0)
    } catch (e: any) {
      showErrorToast(e, {
        source: "review_load",
        jobId,
        fallback: "Không tải được dữ liệu job",
        prefix: "Không tải được dữ liệu job",
      })
    } finally {
      setLoading(false)
    }
  }, [jobId])

  useEffect(() => {
    loadJob()
  }, [loadJob])

  useEffect(() => {
    scenesRef.current = scenes
  }, [scenes])

  useEffect(() => {
    activeIndexRef.current = activeIndex
  }, [activeIndex])

  useEffect(() => {
    subtitleDraftRef.current = subtitleDraft
  }, [subtitleDraft])

  const activeScene = scenes[activeIndex]

  useEffect(() => {
    if (!activeScene) return
    setQueryDraft(String(activeScene.video_query || activeScene.image_query || ""))
    setSubtitleDraft(String(activeScene.narration || ""))
    setPlaying(false)
  }, [activeScene])

  const totalDuration = useMemo(() => {
    return scenes.reduce((acc, scene) => acc + sceneDurationSec(scene), 0)
  }, [scenes])

  const persistScenes = useCallback(async (nextScenes: ApiScene[], successMessage?: string) => {
    if (!jobId || !job) return
    setSaving(true)
    try {
      const updated = await api.patch<ApiJob>(`/jobs/${jobId}/props`, { scenes: nextScenes })
      setJob(updated)
      setScenes(updated.props?.scenes ?? nextScenes)
      if (successMessage) toast.success(successMessage)
    } catch (e: any) {
      showErrorToast(e, {
        source: "review_save",
        jobId,
        fallback: "Không lưu được thay đổi",
        prefix: "Không lưu được thay đổi",
      })
    } finally {
      setSaving(false)
    }
  }, [jobId, job])

  const flushSubtitleSave = useCallback(async () => {
    const currentScenes = scenesRef.current
    const idx = activeIndexRef.current
    const target = currentScenes[idx]
    if (!target) return

    const nextNarration = subtitleDraftRef.current
    if (String(target.narration || "") === nextNarration) return

    const nextScenes = currentScenes.map((scene, sceneIdx) => {
      if (sceneIdx !== idx) return scene
      return { ...scene, narration: nextNarration }
    })

    setScenes(nextScenes)
    await persistScenes(nextScenes)
  }, [persistScenes])

  useEffect(() => {
    if (job?.status !== "review") return
    if (!activeScene) return

    if (subtitleSaveTimerRef.current) {
      clearTimeout(subtitleSaveTimerRef.current)
    }

    subtitleSaveTimerRef.current = setTimeout(() => {
      void flushSubtitleSave()
    }, 650)

    return () => {
      if (subtitleSaveTimerRef.current) {
        clearTimeout(subtitleSaveTimerRef.current)
      }
    }
  }, [subtitleDraft, activeIndex, job?.status, activeScene, flushSubtitleSave])

  const applySubtitleNow = () => {
    if (subtitleSaveTimerRef.current) {
      clearTimeout(subtitleSaveTimerRef.current)
    }
    void flushSubtitleSave()
  }

  const queueDurationSave = useCallback((nextScenes: ApiScene[]) => {
    if (durationSaveTimerRef.current) {
      clearTimeout(durationSaveTimerRef.current)
    }
    durationSaveTimerRef.current = setTimeout(() => {
      void persistScenes(nextScenes)
    }, 500)
  }, [persistScenes])

  const applyDuration = (durationSec: number) => {
    const currentScenes = scenesRef.current
    const idx = activeIndexRef.current
    const nextScenes = retimeScenes(currentScenes, idx, durationSec)
    setScenes(nextScenes)
    queueDurationSave(nextScenes)
  }

  const moveActiveScene = async (delta: -1 | 1) => {
    const currentScenes = scenesRef.current
    const from = activeIndexRef.current
    const to = from + delta
    if (to < 0 || to >= currentScenes.length) return

    if (subtitleSaveTimerRef.current) clearTimeout(subtitleSaveTimerRef.current)
    if (durationSaveTimerRef.current) clearTimeout(durationSaveTimerRef.current)

    const reordered = [...currentScenes]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)
    const normalized = normalizeSceneOrder(reordered)

    setScenes(normalized)
    setActiveIndex(to)
    await persistScenes(normalized, "Đã sắp xếp lại scene")
  }

  const reSearchMedia = async () => {
    if (!jobId || !activeScene) return
    const query = queryDraft.trim()
    if (!query) {
      toast.error("Nhập truy vấn media trước")
      return
    }
    const sceneType = String(activeScene.scene_type || "")
    const body = sceneType === "stock_background" ? { video_query: query } : { image_query: query }

    setSaving(true)
    try {
      const result = await api.post<{
        media_url?: string
        media_type?: string
        poster_url?: string
      }>(`/jobs/${jobId}/scenes/${activeIndex}/re-search`, body)

      const nextScenes = scenes.map((scene, idx) => {
        if (idx !== activeIndex) return scene
        return {
          ...scene,
          media_url: result.media_url ?? scene.media_url,
          media_type: result.media_type ?? scene.media_type,
          poster_url: result.poster_url ?? scene.poster_url,
          image_query: body.image_query ?? scene.image_query,
          video_query: body.video_query ?? scene.video_query,
        }
      })

      setScenes(nextScenes)
      await persistScenes(nextScenes, "Đã cập nhật media")
    } catch (e: any) {
      showErrorToast(e, {
        source: "review_media_search",
        jobId,
        fallback: "Re-search thất bại",
        prefix: "Re-search thất bại",
      })
    } finally {
      setSaving(false)
    }
  }

  const triggerRender = async () => {
    if (!jobId) return
    try {
      await api.post(`/jobs/${jobId}/render`, {})
      toast.success("Đã bắt đầu render")
      navigate(`/result/${jobId}`)
    } catch (e: any) {
      showErrorToast(e, {
        source: "review_render",
        jobId,
        fallback: "Không thể bắt đầu render",
        prefix: "Không thể bắt đầu render",
      })
    }
  }

  if (!jobId) {
    return <div className="surface-card p-6">Thiếu job id.</div>
  }

  if (loading) {
    return <div className="surface-card p-6">Đang tải dữ liệu...</div>
  }

  if (!job || scenes.length === 0) {
    return <div className="surface-card p-6">Không tìm thấy scene để review.</div>
  }

  return (
    <div className="space-y-6">
      <Header
        title={String(job.props?.title || "Review")}
        sceneCount={scenes.length}
        totalDuration={totalDuration}
        status={job.status}
        saving={saving}
        onBack={() => navigate("/dashboard")}
        onRender={triggerRender}
      />

      {job.status !== "review" && (
        <div className="surface-card p-4 text-sm" style={{ color: "var(--status-warning)" }}>
          Job đang ở trạng thái {job.status}. Chỉ có thể chỉnh sửa khi trạng thái là review.
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-4">
          <PreviewPlayer
            scene={activeScene}
            playing={playing}
            setPlaying={setPlaying}
          />
          <Timeline
            scenes={scenes}
            activeIndex={activeIndex}
            setActiveIndex={setActiveIndex}
            total={totalDuration}
          />
        </div>

        <SceneInspector
          scene={activeScene}
          activeIndex={activeIndex}
          sceneCount={scenes.length}
          queryDraft={queryDraft}
          subtitleDraft={subtitleDraft}
          saving={saving}
          editable={job.status === "review"}
          onQueryChange={setQueryDraft}
          onSubtitleChange={setSubtitleDraft}
          onSubtitleBlur={applySubtitleNow}
          onReSearch={reSearchMedia}
          onDurationChange={applyDuration}
          onMoveUp={() => moveActiveScene(-1)}
          onMoveDown={() => moveActiveScene(1)}
        />
      </div>
    </div>
  )
}

function Header({
  title,
  sceneCount,
  totalDuration,
  status,
  saving,
  onBack,
  onRender,
}: {
  title: string
  sceneCount: number
  totalDuration: number
  status: string
  saving: boolean
  onBack: () => void
  onRender: () => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-[var(--radius-md)] hover:bg-[var(--surface-2)]" aria-label="Quay lại">
          <ChevronLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl md:text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
            {title}
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
            {sceneCount} scene • {totalDuration.toFixed(1)}s • {status}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button disabled className="text-sm font-medium px-4 py-2 rounded-[var(--radius-md)] border disabled:opacity-60"
          style={{ borderColor: "var(--border-default)", background: "var(--surface-0)" }}>
          {saving ? "Đang lưu..." : "Auto-save"}
        </button>
        <button onClick={onRender} disabled={status !== "review"} className="btn-brand disabled:opacity-60">
          <Sparkles size={16} /> Render video
        </button>
      </div>
    </div>
  )
}

function PreviewPlayer({
  scene,
  playing,
  setPlaying,
}: {
  scene: ApiScene
  playing: boolean
  setPlaying: (p: boolean) => void
}) {
  const narration = String(scene.narration || "")
  const mediaUrl = typeof scene.media_url === "string" ? scene.media_url : ""
  const posterUrl = typeof scene.poster_url === "string" ? scene.poster_url : mediaUrl
  const isVideo = (scene.media_type || "").toLowerCase() === "video" || mediaUrl.endsWith(".mp4")

  return (
    <div className="surface-card p-4">
      <div className="grid sm:grid-cols-[280px_1fr] gap-4">
        <div className="aspect-[9/16] rounded-[var(--radius-md)] relative overflow-hidden" style={{ background: "#111" }}>
          {mediaUrl ? (
            isVideo ? (
              <video
                src={mediaUrl}
                poster={posterUrl}
                className="h-full w-full object-cover"
                controls={false}
                muted
                autoPlay={playing}
                loop
              />
            ) : (
              <img src={mediaUrl} alt="scene media" className="h-full w-full object-cover" />
            )
          ) : (
            <div className="h-full w-full" style={{ background: "linear-gradient(135deg,#1a0d3d,#7a3dff)" }} />
          )}

          <div className="absolute inset-x-3 bottom-3 px-3 py-2 rounded-[var(--radius-sm)]"
            style={{ background: "rgba(0,0,0,0.65)", color: "#fff" }}>
            <p className="text-sm font-semibold leading-tight">{narration || "Chưa có subtitle"}</p>
          </div>
          <button
            onClick={() => setPlaying(!playing)}
            className="absolute inset-0 m-auto h-14 w-14 rounded-full grid place-items-center text-white"
            style={{ background: "rgba(255,255,255,0.18)", backdropFilter: "blur(8px)" }}>
            {playing ? <Pause size={20} /> : <Play size={20} fill="currentColor" />}
          </button>
        </div>

        <div className="flex flex-col">
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
            <span className="pill pill-brand">Scene {Number(scene.scene_index ?? 0) + 1}</span>
            <span>{sceneDurationSec(scene).toFixed(1)}s</span>
          </div>
          <h3 className="text-base font-semibold mt-2 leading-snug">{narration || "Chưa có nội dung"}</h3>

          <div className="grid grid-cols-3 gap-2 mt-4">
            <ActionBtn icon={ImageIcon} label="Đổi media" />
            <ActionBtn icon={Type}      label="Sửa subtitle" />
            <ActionBtn icon={RefreshCw} label="Sinh lại" />
          </div>

          <div className="mt-auto text-xs flex items-center gap-2" style={{ color: "var(--text-tertiary)" }}>
            <ImageIcon size={12} />
            <span>Truy vấn: {String(scene.video_query || scene.image_query || "—")}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function ActionBtn({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <button className="flex flex-col items-center gap-1 py-3 rounded-[var(--radius-md)] text-xs font-medium border transition hover:bg-[var(--surface-2)]"
      style={{ borderColor: "var(--border-subtle)", background: "var(--surface-0)" }}>
      <Icon size={16} />
      {label}
    </button>
  )
}

/* ---------------- Timeline ---------------- */
function Timeline({
  scenes,
  activeIndex,
  setActiveIndex,
  total,
}: {
  scenes: ApiScene[]
  activeIndex: number
  setActiveIndex: (idx: number) => void
  total: number
}) {
  return (
    <div className="surface-card p-3">
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
          Timeline
        </span>
        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Reorder sẽ bổ sung sau</span>
      </div>

      {/* Ruler */}
      <div className="h-4 relative mb-1 mx-1">
        {[0, 0.25, 0.5, 0.75, 1].map(p => (
          <span key={p} className="absolute top-0 text-[10px]" style={{ left: `${p * 100}%`, color: "var(--text-tertiary)" }}>
            {Math.round(p * total)}s
          </span>
        ))}
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {scenes.map((scene, idx) => {
          const selected = idx === activeIndex
          const widthFlex = `${sceneDurationSec(scene)}`
          const media = String(scene.poster_url || scene.media_url || "")
          return (
            <button key={`${scene.scene_index ?? idx}-${idx}`} onClick={() => setActiveIndex(idx)}
              className="shrink-0 rounded-[var(--radius-md)] overflow-hidden border transition relative group"
              style={{
                flex: `${widthFlex} 1 0`,
                minWidth: 90,
                borderColor: selected ? "var(--brand-500)" : "var(--border-default)",
                boxShadow: selected ? "var(--shadow-glow)" : undefined,
              }}>
              {media ? (
                <img src={media} alt={`scene-${idx}`} className="aspect-[16/10] w-full object-cover" />
              ) : (
                <div className="aspect-[16/10]" style={{ background: "linear-gradient(135deg,#1a0d3d,#7a3dff)" }} />
              )}
              <div className="px-2 py-1.5 bg-[var(--surface-0)] flex items-center gap-1.5">
                <GripVertical size={10} style={{ color: "var(--text-tertiary)" }} className="cursor-grab" />
                <span className="text-[10px] font-bold" style={{ color: "var(--brand-600)" }}>#{Number(scene.scene_index ?? idx) + 1}</span>
                <span className="text-[10px] ml-auto" style={{ color: "var(--text-tertiary)" }}>{sceneDurationSec(scene).toFixed(1)}s</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SceneInspector({
  scene,
  activeIndex,
  sceneCount,
  queryDraft,
  subtitleDraft,
  saving,
  editable,
  onQueryChange,
  onSubtitleChange,
  onSubtitleBlur,
  onReSearch,
  onDurationChange,
  onMoveUp,
  onMoveDown,
}: {
  scene: ApiScene
  activeIndex: number
  sceneCount: number
  queryDraft: string
  subtitleDraft: string
  saving: boolean
  editable: boolean
  onQueryChange: (value: string) => void
  onSubtitleChange: (value: string) => void
  onSubtitleBlur: () => void
  onReSearch: () => void
  onDurationChange: (durationSec: number) => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const duration = sceneDurationSec(scene)

  return (
    <aside className="surface-card p-5 space-y-5 self-start sticky top-20">
      <div>
        <span className="pill pill-brand">Scene {Number(scene.scene_index ?? 0) + 1}</span>
        <h3 className="text-sm font-semibold mt-2">Sửa scene này</h3>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border px-2 py-1 text-xs font-medium disabled:opacity-50"
            style={{ borderColor: "var(--border-default)" }}
            onClick={onMoveUp}
            disabled={!editable || activeIndex <= 0}
          >
            <ArrowUp size={12} /> Lên
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border px-2 py-1 text-xs font-medium disabled:opacity-50"
            style={{ borderColor: "var(--border-default)" }}
            onClick={onMoveDown}
            disabled={!editable || activeIndex >= sceneCount - 1}
          >
            <ArrowDown size={12} /> Xuống
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-tertiary)" }}>Subtitle</label>
        <textarea
          value={subtitleDraft}
          rows={3}
          className="field resize-none text-sm"
          disabled={!editable}
          onChange={(e) => onSubtitleChange(e.target.value)}
          onBlur={onSubtitleBlur}
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-tertiary)" }}>Truy vấn media</label>
        <div className="flex gap-2">
          <input
            value={queryDraft}
            className="field flex-1 text-sm"
            disabled={!editable}
            onChange={(e) => onQueryChange(e.target.value)}
          />
          <button
            className="px-3 rounded-[var(--radius-md)] text-white disabled:opacity-60"
            style={{ background: "var(--gradient-brand)" }}
            aria-label="Tìm lại"
            disabled={!editable || saving}
            onClick={onReSearch}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-tertiary)" }}>Thời lượng</label>
        <input
          type="range"
          min={1}
          max={12}
          step={0.1}
          value={duration}
          className="w-full accent-[var(--brand-500)]"
          disabled={!editable}
          onChange={(e) => onDurationChange(Number(e.target.value))}
        />
        <div className="flex justify-between text-xs" style={{ color: "var(--text-tertiary)" }}>
          <span>1s</span><span className="font-semibold" style={{ color: "var(--text-primary)" }}>{duration.toFixed(1)}s</span><span>12s</span>
        </div>
      </div>

      <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
        Candidate thumbnails và xoá scene sẽ bổ sung sau khi backend hỗ trợ đầy đủ.
      </div>
    </aside>
  )
}
