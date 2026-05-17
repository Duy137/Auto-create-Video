import { useState, useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import { 
  Play, 
  Download, 
  Calendar, 
  Trash2, 
  AlertCircle,
  FileVideo,
  Loader2
} from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { deleteJob, listJobs } from "@/api/client"
import { toast } from "sonner"
import { showErrorToast } from "@/components/SystemErrorReport"

interface VideoJob {
  id: string
  status: string
  input_text?: string | null
  props?: {
    title?: string | null
    [key: string]: unknown
  } | null
  video_url: string | null
  thumbnail_url: string | null
  created_at: string
  completed_at: string | null
  project_id: string | null
  error: string | null
}

function getVideoTitle(job: VideoJob) {
  const title = job.props?.title || job.input_text
  return title?.trim() || `Video #${job.id.slice(0, 8)}`
}

export default function LibraryPage() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [jobs, setJobs] = useState<VideoJob[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const search = searchParams.get("q")?.trim().toLowerCase() || ""

  const fetchJobs = async () => {
    try {
      const data = await listJobs(1, 50, "done")
      setJobs((data.jobs || []).filter(job => job.status === "done"))
    } catch (e: any) {
      console.error("Failed to fetch library", e)
      showErrorToast(e, {
        source: "library_load",
        fallback: "Không thể tải danh sách video",
        prefix: "Không thể tải danh sách video",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (jobId: string) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa video này khỏi thư viện?")) return
    
    setDeletingId(jobId)
    try {
      await deleteJob(jobId)
      toast.success("Đã xóa video thành công")
      setJobs(prev => prev.filter(j => j.id !== jobId))
    } catch (e: any) {
      console.error("Delete failed", e)
      showErrorToast(e, {
        source: "library_delete",
        jobId,
        fallback: "Xóa video thất bại",
        prefix: "Xóa video thất bại",
      })
    } finally {
      setDeletingId(null)
    }
  }

  useEffect(() => {
    fetchJobs()
  }, [])

  const filteredJobs = jobs.filter(j => {
    if (!search) return true
    return getVideoTitle(j).toLowerCase().includes(search)
  })

  const getRetentionDays = () => {
    if (user?.tier === "studio") return 365
    if (user?.tier === "pro") return 180
    return 30
  }

  const calculateExpiry = (completedAt: string | null) => {
    if (!completedAt) return null
    const doneDate = new Date(completedAt)
    const expiryDate = new Date(doneDate)
    expiryDate.setDate(doneDate.getDate() + getRetentionDays())
    
    const now = new Date()
    const diffDays = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    
    return {
      date: expiryDate.toLocaleDateString("vi-VN"),
      daysLeft: diffDays
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <div>
          <h1 className="text-2xl font-bold">Thư viện của bạn</h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Quản lý và tải về các video bạn đã tạo.
          </p>
        </div>
      </div>

      {/* Retention Notice */}
      <div 
        className="flex gap-3 p-4 rounded-[var(--radius-lg)] border" 
        style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)" }}
      >
        <AlertCircle size={20} className="text-[var(--brand-500)] shrink-0" />
        <div className="text-sm">
          <span className="font-bold">Chính sách lưu trữ:</span> Video của bạn sẽ được lưu trữ trong{" "}
          <span className="font-bold text-[var(--brand-600)]">{getRetentionDays()} ngày</span> dựa trên gói{" "}
          <span className="capitalize">{user?.tier || "starter"}</span>. 
          Sau thời gian này, tệp video sẽ bị xóa để tối ưu dung lượng hệ thống.
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="aspect-video rounded-[var(--radius-lg)] animate-pulse bg-[var(--surface-2)]" />
          ))}
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="py-20 text-center space-y-4">
          <div className="inline-flex p-4 rounded-full bg-[var(--surface-2)]">
            <FileVideo size={32} style={{ color: "var(--text-tertiary)" }} />
          </div>
          <p style={{ color: "var(--text-secondary)" }}>
            {search ? "Không tìm thấy video nào khớp tên bạn nhập." : "Chưa có video nào trong thư viện."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredJobs.map(job => {
            const expiry = calculateExpiry(job.completed_at)
            const isExpired = job.status === "done" && !job.video_url
            const thumbnailSrc = job.thumbnail_url || `/api/jobs/${job.id}/thumbnail`
            const videoTitle = getVideoTitle(job)

            return (
              <div 
                key={job.id}
                className="group flex flex-col rounded-[var(--radius-xl)] border overflow-hidden transition-all hover:shadow-xl hover:-translate-y-1"
                style={{ background: "var(--surface-0)", borderColor: "var(--border-subtle)" }}
              >
                {/* Thumbnail Area */}
                <div className="aspect-video relative overflow-hidden bg-black flex items-center justify-center">
                  {thumbnailSrc ? (
                    <img 
                      src={thumbnailSrc} 
                      alt={videoTitle} 
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <FileVideo size={40} className="text-white/20" />
                  )}
                  
                  {job.status === "done" && !isExpired && (
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                      <button 
                        onClick={() => window.open(`/result/${job.id}`, "_blank")}
                        className="p-3 rounded-full bg-[var(--brand-600)] text-white hover:bg-[var(--brand-700)] transition"
                      >
                        <Play size={20} fill="currentColor" />
                      </button>
                    </div>
                  )}

                  {isExpired && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center p-4 text-center">
                      <span className="text-xs font-bold text-white/80 border border-white/20 px-2 py-1 rounded">HẾT HẠN</span>
                    </div>
                  )}

                  {/* Status Badge */}
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shadow-sm"
                    style={{ 
                      background: job.status === "done" ? "var(--status-success)" : job.status === "failed" ? "var(--status-danger)" : "var(--brand-500)",
                      color: "white"
                    }}
                  >
                    {job.status === "done" ? "Hoàn thành" : job.status === "failed" ? "Thất bại" : "Đang xử lý"}
                  </div>
                </div>

                {/* Content */}
                <div className="p-4 flex-1 flex flex-col gap-3">
                  <div className="flex-1">
                    <h3 className="font-bold text-sm leading-snug line-clamp-2 mb-1" title={videoTitle}>
                      {videoTitle}
                    </h3>
                    <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                      <Calendar size={10} />
                      {new Date(job.created_at).toLocaleDateString("vi-VN")}
                    </div>
                  </div>

                  {job.status === "done" && expiry && (
                    <div className="pt-3 border-t" style={{ borderColor: "var(--border-subtle)" }}>
                      <div className="flex justify-between items-end">
                        <div className="space-y-0.5">
                          <div className="text-[10px] uppercase font-bold tracking-tighter" style={{ color: "var(--text-tertiary)" }}>Hết hạn</div>
                          <div className="text-xs font-semibold">{expiry.date}</div>
                        </div>
                        <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${expiry.daysLeft <= 3 ? "bg-red-100 text-red-600" : "bg-orange-100 text-orange-600"}`}>
                          Còn {expiry.daysLeft} ngày
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 mt-auto pt-2">
                    {job.status === "done" && !isExpired ? (
                      <a 
                        href={job.video_url || "#"} 
                        download 
                        className="flex-1 flex items-center justify-center gap-2 h-9 rounded-[var(--radius-md)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-xs font-bold transition"
                      >
                        <Download size={14} /> Tải về
                      </a>
                    ) : (
                      <button 
                        disabled
                        className="flex-1 flex items-center justify-center h-9 rounded-[var(--radius-md)] bg-[var(--surface-1)] text-[var(--text-tertiary)] text-xs font-bold border border-[var(--border-subtle)]"
                      >
                        {isExpired ? "Đã xóa" : "Chưa có"}
                      </button>
                    )}
                    <button 
                      onClick={() => handleDelete(job.id)}
                      disabled={deletingId === job.id}
                      className="h-9 w-9 flex items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-subtle)] hover:bg-red-50 hover:text-red-500 hover:border-red-100 transition disabled:opacity-50"
                      title="Xóa video"
                    >
                      {deletingId === job.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
