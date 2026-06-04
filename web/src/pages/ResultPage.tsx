import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { api, createShareLink, deleteShareLink, SYSTEM_ERROR_MESSAGE } from "@/api/client"
import { showErrorToast, SystemErrorPanel } from "@/components/SystemErrorReport"
import { Play, Download, Share2, RefreshCw, Copy, Sparkles, ChevronLeft, Loader2 } from "lucide-react"

/* ============================================================
   Result — Video player 9:16 + share + analytics + remix
   ============================================================ */

type ApiJob = {
  id: string
  status: string
  video_url?: string | null
  thumbnail_url?: string | null
  share_token?: string | null
  share_views?: number
  error?: string | null
  props?: {
    title?: string
    scenes?: Array<{ start_ms?: number; end_ms?: number }>
    settings?: { aspect_ratio?: string }
  } | null
}

type ProgressPayload = {
  event?: string
  progress?: number
  message?: string
  fatal?: boolean
}

function computeDurationSec(job: ApiJob | null): number {
  const scenes = job?.props?.scenes ?? []
  const last = scenes[scenes.length - 1]
  if (!last || typeof last.end_ms !== "number") return 0
  return Math.max(0, last.end_ms / 1000)
}

export default function ResultPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()

  const [job, setJob] = useState<ApiJob | null>(null)
  const [loading, setLoading] = useState(true)
  const [videoBlobUrl, setVideoBlobUrl] = useState<string | null>(null)
  const [renderProgress, setRenderProgress] = useState<number | null>(null)
  const [renderMessage, setRenderMessage] = useState<string>("")
  const [shareToken, setShareToken] = useState<string | null>(null)
  const [shareViews, setShareViews] = useState<number>(0)
  const [isCloning, setIsCloning] = useState(false)

  const refreshJobStatus = useCallback(async () => {
    if (!jobId) return
    try {
      const data = await api.get<ApiJob>(`/jobs/${jobId}`)
      setJob(data)
      setShareToken(data.share_token || null)
      setShareViews(Number(data.share_views || 0))
    } catch {
      // Keep current UI state when a background refresh fails.
    }
  }, [jobId])

  const loadJob = useCallback(async () => {
    if (!jobId) {
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      await refreshJobStatus()
    } catch (e: any) {
      showErrorToast(e, { source: "result_load", jobId, fallback: "Không tải được kết quả" })
    } finally {
      setLoading(false)
    }
  }, [jobId, refreshJobStatus])

  useEffect(() => {
    loadJob()
  }, [loadJob])

  const fetchProtectedVideo = useCallback(async () => {
    if (!jobId || !job || job.status !== "done") return
    try {
      const res = await fetch(`/api/jobs/${jobId}/download`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`Không tải được video (${res.status})`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      setVideoBlobUrl(prev => {
        if (prev) URL.revokeObjectURL(prev)
        return url
      })
    } catch (e: any) {
      showErrorToast(e, { source: "result_video", jobId, fallback: "Lỗi khi tải video" })
    }
  }, [jobId, job])

  useEffect(() => {
    fetchProtectedVideo()
    return () => {
      setVideoBlobUrl(prev => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    }
  }, [fetchProtectedVideo])

  useEffect(() => {
    if (!jobId || !job) return
    if (job.status === "done" || job.status === "failed") return

    const es = new EventSource(`/api/jobs/${jobId}/progress`, {
      withCredentials: true,
    })
    const pollId = window.setInterval(() => {
      void refreshJobStatus()
    }, 2500)

    es.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data) as ProgressPayload
        if (typeof data.progress === "number") {
          setRenderProgress(Math.round(data.progress * 100))
        }
        if (data.message) setRenderMessage(data.message)
        if (data.event === "done") {
          es.close()
          void refreshJobStatus()
        }
        if (data.event === "error" && data.fatal) {
          es.close()
          toast.error(SYSTEM_ERROR_MESSAGE)
          void refreshJobStatus()
        }
      } catch {
        // Ignore invalid SSE payload
      }
    }

    es.onerror = () => {
      // Keep interval polling as fallback if SSE drops.
      es.close()
    }

    return () => {
      es.close()
      window.clearInterval(pollId)
    }
  }, [jobId, job?.status, refreshJobStatus])

  const shareUrl = useMemo(() => {
    if (!shareToken) return ""
    return `${window.location.origin}/share/${shareToken}`
  }, [shareToken])

  const triggerRender = async () => {
    if (!jobId) return
    try {
      await api.post(`/jobs/${jobId}/render`, {})
      toast.success("Đã bắt đầu render")
      await loadJob()
    } catch (e: any) {
      showErrorToast(e, {
        source: "result_render",
        jobId,
        fallback: "Không thể render lại",
        prefix: "Không thể render lại",
      })
    }
  }

  const handleCloneJob = async () => {
    if (!jobId) return
    setIsCloning(true)
    try {
      const data = await api.post<{ id: string; project_id?: string | null }>(`/jobs/${jobId}/clone`, {})
      toast.success("Đã tạo bản nháp chỉnh sửa mới")
      if (data.project_id) {
        navigate(`/create?project=${encodeURIComponent(data.project_id)}&job=${data.id}&mode=review`)
      } else {
        navigate(`/review/${data.id}`)
      }
    } catch (e: any) {
      showErrorToast(e, {
        source: "result_clone",
        jobId,
        fallback: "Không thể bắt đầu chỉnh sửa tiếp",
        prefix: "Không thể bắt đầu chỉnh sửa tiếp",
      })
    } finally {
      setIsCloning(false)
    }
  }

  const downloadVideo = async () => {
    if (!jobId) return
    try {
      const res = await fetch(`/api/jobs/${jobId}/download`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`Tải xuống thất bại (${res.status})`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `autoclip_${jobId}.mp4`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      showErrorToast(e, { source: "result_download", jobId, fallback: "Tải xuống thất bại" })
    }
  }

  const ensureShare = async () => {
    if (!jobId) return
    try {
      const data = await createShareLink(jobId)
      setShareToken(data.share_token)
      toast.success("Đã tạo link share")
    } catch (e: any) {
      showErrorToast(e, { source: "result_share_create", jobId, fallback: "Không tạo được link share" })
    }
  }

  const removeShare = async () => {
    if (!jobId) return
    try {
      await deleteShareLink(jobId)
      setShareToken(null)
      toast.success("Đã xóa link share")
    } catch (e: any) {
      showErrorToast(e, { source: "result_share_delete", jobId, fallback: "Không xóa được link" })
    }
  }

  const copyShareUrl = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      toast.success("Đã sao chép link")
    } catch {
      toast.error("Không sao chép được link")
    }
  }

  const openChannel = (channel: "tiktok" | "reels" | "shorts" | "email") => {
    if (!shareUrl) return
    const encoded = encodeURIComponent(shareUrl)
    const title = encodeURIComponent(String(job?.props?.title || "AutoClip Video"))
    if (channel === "email") {
      window.open(`mailto:?subject=${title}&body=${encoded}`, "_blank")
      return
    }

    const target =
      channel === "tiktok" ? `https://www.tiktok.com/upload?url=${encoded}` :
        channel === "reels" ? `https://www.instagram.com/?url=${encoded}` :
          `https://www.youtube.com/upload?url=${encoded}`

    window.open(target, "_blank", "noopener,noreferrer")
  }

  if (!jobId) {
    return <div className="surface-card p-6">Thiếu job id.</div>
  }

  if (loading) {
    return <div className="surface-card p-6">Đang tải dữ liệu kết quả...</div>
  }

  if (!job) {
    return <div className="surface-card p-6">Không tìm thấy job.</div>
  }

  const durationSec = computeDurationSec(job)
  const aspectRatio = String(job.props?.settings?.aspect_ratio || "9:16")

  return (
    <div className="space-y-6">
      <Header
        title={String(job.props?.title || "Kết quả")}
        status={job.status}
        isCloning={isCloning}
        onBack={() => navigate("/dashboard")}
        onRender={triggerRender}
        onDownload={downloadVideo}
        onClone={handleCloneJob}
      />
      <div className="grid lg:grid-cols-[420px_1fr] gap-6">
        <Player
          status={job.status}
          renderProgress={renderProgress}
          renderMessage={renderMessage}
          errorDetail={job.error || null}
          jobId={jobId}
          videoUrl={videoBlobUrl}
          thumbnailUrl={job.thumbnail_url || null}
          aspectRatio={aspectRatio}
          durationSec={durationSec}
        />
        <div className="space-y-6">
          <ShareCard
            shareToken={shareToken}
            shareUrl={shareUrl}
            status={job.status}
            onCreate={ensureShare}
            onDelete={removeShare}
            onCopy={copyShareUrl}
            onOpen={openChannel}
          />
          <Stats shareViews={shareViews} />
          <RemixCTA />
        </div>
      </div>
    </div>
  )
}

function Header({
  title,
  status,
  isCloning,
  onBack,
  onRender,
  onDownload,
  onClone,
}: {
  title: string
  status: string
  isCloning: boolean
  onBack: () => void
  onRender: () => void
  onDownload: () => void
  onClone: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button onClick={onBack} className="p-2 rounded-[var(--radius-md)] hover:bg-[var(--surface-2)]" aria-label="Quay lại">
        <ChevronLeft size={18} />
      </button>
      <div className="flex-1">
        <div className="inline-flex items-center gap-2 mb-1">
          <span className={`pill ${status === "done" ? "pill-success" : "pill-warning"}`}>
            <Sparkles size={12} /> {status === "done" ? "Render xong" : status === "failed" ? SYSTEM_ERROR_MESSAGE : `Trạng thái: ${status}`}
          </span>
        </div>
        <h1 className="text-xl md:text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
          {title}
        </h1>
      </div>
      {status === "review" ? (
        <button onClick={onRender} className="text-sm font-medium px-4 py-2 rounded-[var(--radius-md)] border inline-flex items-center gap-2"
          style={{ borderColor: "var(--border-default)", background: "var(--surface-0)" }}>
          <RefreshCw size={14} /> Render lại
        </button>
      ) : (
        <button onClick={onClone} disabled={isCloning} className="text-sm font-medium px-4 py-2 rounded-[var(--radius-md)] border inline-flex items-center gap-2 disabled:opacity-50"
          style={{ borderColor: "var(--border-default)", background: "var(--surface-0)" }}>
          {isCloning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles size={14} />
          )}
          Chỉnh sửa tiếp
        </button>
      )}
      <button onClick={onDownload} disabled={status !== "done"} className="btn-brand disabled:opacity-50">
        <Download size={16} /> Tải MP4
      </button>
    </div>
  )
}

function Player({
  status,
  renderProgress,
  renderMessage,
  errorDetail,
  jobId,
  videoUrl,
  thumbnailUrl,
  aspectRatio,
  durationSec,
}: {
  status: string
  renderProgress: number | null
  renderMessage: string
  errorDetail: unknown
  jobId?: string
  videoUrl: string | null
  thumbnailUrl: string | null
  aspectRatio: string
  durationSec: number
}) {
  const ratioLabel = aspectRatio || "9:16"
  const isRenderingLike = status === "rendering" || status === "processing" || status === "pending"
  const hasFailed = status === "failed"

  return (
    <div className="surface-card p-3">
      <div className="aspect-[9/16] rounded-[var(--radius-md)] relative overflow-hidden"
        style={{ background: "linear-gradient(135deg,#1a0d3d 0%, #3f1798 50%, #ff3da9 100%)" }}>

        {hasFailed ? (
          <div className="absolute inset-0 grid place-items-center p-6">
            <SystemErrorPanel source="result" jobId={jobId} detail={errorDetail} />
          </div>
        ) : isRenderingLike ? (
          <div className="absolute inset-0 grid place-items-center text-white">
            <div className="text-center space-y-3 px-6">
              <Loader2 className="animate-spin mx-auto" size={32} />
              <div className="text-sm">{renderMessage || "Đang xử lý video..."}</div>
              <div className="text-lg font-bold">{renderProgress ?? 0}%</div>
            </div>
          </div>
        ) : videoUrl ? (
          <video
            src={videoUrl}
            poster={thumbnailUrl || undefined}
            controls
            className="h-full w-full object-cover"
          />
        ) : thumbnailUrl ? (
          <img src={thumbnailUrl} alt="thumbnail" className="h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-white/80">Chưa có video</div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3 text-xs" style={{ color: "var(--text-secondary)" }}>
        <Spec label="Tỉ lệ" value={ratioLabel} />
        <Spec label="Độ phân giải" value="1080p" />
        <Spec label="Thời lượng" value={durationSec > 0 ? `${durationSec.toFixed(1)}s` : "--"} />
      </div>
    </div>
  )
}
function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-sm)] p-2 text-center" style={{ background: "var(--surface-2)" }}>
      <div style={{ color: "var(--text-tertiary)" }} className="text-[10px] uppercase">{label}</div>
      <div style={{ color: "var(--text-primary)" }} className="font-semibold text-sm">{value}</div>
    </div>
  )
}

function ShareCard({
  shareToken,
  shareUrl,
  status,
  onCreate,
  onDelete,
  onCopy,
  onOpen,
}: {
  shareToken: string | null
  shareUrl: string
  status: string
  onCreate: () => void
  onDelete: () => void
  onCopy: () => void
  onOpen: (channel: "tiktok" | "reels" | "shorts" | "email") => void
}) {
  const canShare = status === "done"

  return (
    <div className="surface-card p-5">
      <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
        <Share2 size={16} style={{ color: "var(--brand-500)" }} /> Chia sẻ
      </h2>

      {!shareToken ? (
        <button onClick={onCreate} disabled={!canShare} className="btn-brand disabled:opacity-60 mb-4">
          Tạo link share
        </button>
      ) : null}

      <div className="flex gap-2 mb-4">
        <input
          readOnly
          value={shareUrl || "Chưa có link share"}
          className="field flex-1 text-sm font-mono"
          style={{ background: "var(--surface-2)" }}
        />
        <button className="btn-brand disabled:opacity-60" onClick={onCopy} disabled={!shareToken}>
          <Copy size={14} /> Sao chép
        </button>
      </div>

      {shareToken ? (
        <button className="text-sm font-medium mb-4" style={{ color: "var(--status-danger)" }} onClick={onDelete}>
          Xóa link
        </button>
      ) : null}

      <div className="grid grid-cols-4 gap-2">
        {[
          { key: "tiktok" as const, label: "TikTok" },
          { key: "reels" as const, label: "Reels" },
          { key: "shorts" as const, label: "Shorts" },
          { key: "email" as const, label: "Email" },
        ].map((item) => (
          <button
            key={item.key}
            disabled={!shareToken}
            onClick={() => onOpen(item.key)}
            className="flex flex-col items-center gap-1 py-3 rounded-[var(--radius-md)] border text-xs font-medium transition hover:bg-[var(--surface-2)] disabled:opacity-50"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <div className="h-8 w-8 rounded-lg" style={{ background: "var(--gradient-brand)" }} />
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function Stats({ shareViews }: { shareViews: number }) {
  const items = [
    { icon: Play, label: "Share views", value: String(shareViews) },
    { icon: Share2, label: "Likes", value: "—" },
    { icon: Share2, label: "Comments", value: "—" },
    { icon: Share2, label: "Shares", value: "—" },
  ]
  return (
    <div className="surface-card p-5">
      <h2 className="text-base font-semibold mb-3">Hiệu suất</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {items.map(s => (
          <div key={s.label} className="rounded-[var(--radius-md)] p-3 text-center"
            style={{ background: "var(--surface-2)" }}>
            <s.icon size={16} className="mx-auto mb-1.5" style={{ color: "var(--brand-500)" }} />
            <div className="text-lg font-bold">{s.value}</div>
            <div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function RemixCTA() {
  return (
    <div className="rounded-[var(--radius-lg)] p-5 text-white"
      style={{ background: "var(--gradient-aurora)" }}>
      <div className="flex items-center gap-3">
        <Sparkles size={28} />
        <div className="flex-1">
          <h3 className="font-semibold text-lg">Làm thêm video cùng chủ đề?</h3>
          <p className="text-sm opacity-90">AutoClip sẽ tạo 3 biến thể từ kịch bản này.</p>
        </div>
        <button disabled className="px-4 py-2 rounded-[var(--radius-md)] font-semibold whitespace-nowrap opacity-70"
          style={{ background: "#fff", color: "var(--brand-700)" }}>
          Sắp ra mắt
        </button>
      </div>
    </div>
  )
}
