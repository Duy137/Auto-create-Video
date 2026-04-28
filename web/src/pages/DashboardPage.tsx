import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, getToken } from '@/api/client'
import { toast } from 'sonner'
import {
  Download, Trash2, Clapperboard, Film, CircleAlert,
  Clock, CheckCircle, Loader, Plus
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

const FILTERS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'done', label: 'Hoàn thành' },
  { key: 'active', label: 'Đang xử lý' },
  { key: 'review', label: 'Chờ duyệt' },
  { key: 'failed', label: 'Lỗi' },
]

const STATUS_CONFIG: Record<string, { variant: "default" | "secondary" | "destructive" | "outline", icon: any, label: string, colorClass: string }> = {
  done: { variant: 'default', icon: <CheckCircle className="h-3 w-3" />, label: 'Hoàn thành', colorClass: 'bg-green-500 hover:bg-green-600' },
  processing: { variant: 'secondary', icon: <Loader className="h-3 w-3 animate-spin" />, label: 'Đang xử lý', colorClass: 'bg-yellow-500 hover:bg-yellow-600 text-white' },
  rendering: { variant: 'secondary', icon: <Loader className="h-3 w-3 animate-spin" />, label: 'Đang render', colorClass: 'bg-yellow-500 hover:bg-yellow-600 text-white' },
  review: { variant: 'outline', icon: <Clock className="h-3 w-3" />, label: 'Chờ duyệt', colorClass: 'text-blue-500 border-blue-500' },
  pending: { variant: 'outline', icon: <Clock className="h-3 w-3" />, label: 'Đang chờ', colorClass: 'text-gray-500 border-gray-500' },
  failed: { variant: 'destructive', icon: <CircleAlert className="h-3 w-3" />, label: 'Lỗi', colorClass: '' },
}

export default function DashboardPage() {
  const [jobs, setJobs] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    try {
      if (filter === 'active') {
        // Fetch all, filter client-side for processing + rendering
        const data = await api.get(`/jobs?page=${page}&per_page=12`)
        const allJobs = data.jobs || []
        const filtered = allJobs.filter((j: any) => 
          ['processing', 'rendering'].includes(j.status)
        )
        setJobs(filtered)
        setTotal(filtered.length)
      } else {
        const params = new URLSearchParams({ page: page.toString(), per_page: '12' })
        if (filter !== 'all') params.set('status', filter)
        const data = await api.get(`/jobs?${params.toString()}`)
        setJobs(data.jobs || [])
        setTotal(data.total || 0)
      }
    } catch {
      toast.error('Không thể tải danh sách video')
    } finally {
      setLoading(false)
    }
  }, [page, filter])

  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  const handleDelete = async (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm('Bạn có chắc chắn muốn xóa video này?')) return
    try {
      await api.delete(`/jobs/${jobId}`)
      toast.success('Đã xóa thành công')
      fetchJobs()
    } catch {
      toast.error('Xóa thất bại')
    }
  }

  const handleDownload = (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const token = getToken()
    fetch(`/api/jobs/${jobId}/download`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then(res => {
        if (!res.ok) throw new Error('Tải xuống thất bại')
        return res.blob()
      })
      .then(blob => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `autoclip_${jobId}.mp4`
        a.click()
        URL.revokeObjectURL(url)
      })
      .catch(err => toast.error(err.message))
  }

  const totalPages = Math.ceil(total / 12)

  return (
    <div className="flex flex-1 flex-col h-full overflow-y-auto p-6 bg-background space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <Button onClick={() => navigate('/')}>
          <Plus className="mr-2 h-4 w-4" /> Tạo Video
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <div className="text-2xl font-bold">{total}</div>
            <p className="text-xs text-muted-foreground mt-1">Tổng số Video</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-2xl font-bold text-green-500">
              {jobs.filter(j => j.status === 'done').length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Đã hoàn thành (trang này)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-2xl font-bold text-yellow-500">
              {jobs.filter(j => ['processing', 'rendering', 'review'].includes(j.status)).length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Đang thực hiện (trang này)</p>
          </CardContent>
        </Card>
      </div>

      {/* Latest active job highlight */}
      {(() => {
        const activeJob = jobs.find(j => ['processing', 'rendering', 'review'].includes(j.status))
        if (!activeJob) return null
        const config = STATUS_CONFIG[activeJob.status] || STATUS_CONFIG.pending
        const title = activeJob.props?.title || activeJob.input_text?.slice(0, 50) || 'Video đang xử lý'
        
        return (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-full">
                  {config.icon}
                </div>
                <div>
                  <p className="text-sm font-medium truncate max-w-[300px]">{title}</p>
                  <p className="text-xs text-muted-foreground">{config.label}</p>
                </div>
              </div>
              <Button 
                size="sm" 
                variant="outline"
                className="shrink-0"
                onClick={() => {
                  if (activeJob.status === 'review') {
                    navigate(`/?job=${activeJob.id}&mode=review`)
                  } else {
                    navigate('/')
                  }
                }}
              >
                Tiếp tục →
              </Button>
            </CardContent>
          </Card>
        )
      })()}

      {/* Filter Tabs */}
      <div className="flex space-x-2 border-b pb-2">
        {FILTERS.map(f => (
          <button
            key={f.key}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              filter === f.key
                ? 'border-b-2 border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => { setFilter(f.key); setPage(1) }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Jobs Grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <Skeleton className="h-32 w-full" />
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <Film className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">Chưa có video nào</h3>
          <p className="mb-4 mt-2 text-sm text-muted-foreground">
            Tạo video đầu tiên của bạn để xem ở đây
          </p>
          <Button onClick={() => navigate('/')}>
            <Clapperboard className="mr-2 h-4 w-4" /> Tạo Video
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {jobs.map(job => {
            const config = STATUS_CONFIG[job.status] || STATUS_CONFIG.pending
            const title = job.props?.title || job.input_text?.slice(0, 40) || 'Chưa có tên'
            const createdAt = new Date(job.created_at).toLocaleDateString('vi-VN')

            return (
              <Card 
                key={job.id} 
                className="group cursor-pointer overflow-hidden transition-all hover:border-primary/50 hover:shadow-md"
                onClick={() => {
                  if (job.status === 'review') {
                    navigate(`/?job=${job.id}&mode=review`)
                  } else if (job.status === 'done') {
                    navigate(`/?job=${job.id}&mode=result`)
                  } else {
                    navigate('/')
                  }
                }}
              >
                <div className="flex aspect-video items-center justify-center bg-muted">
                  <Film className="h-8 w-8 text-muted-foreground/50" />
                </div>
                
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 overflow-hidden">
                      <p className="truncate text-sm font-medium leading-none" title={title}>
                        {title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {createdAt}
                      </p>
                    </div>
                    <Badge variant={config.variant} className={`shrink-0 flex items-center gap-1 ${config.colorClass}`}>
                      {config.icon}
                      <span className="hidden sm:inline">{config.label}</span>
                    </Badge>
                  </div>

                  <div className="mt-4 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                    {job.status === 'done' && (
                      <Button size="sm" variant="secondary" className="h-8 flex-1" onClick={(e) => handleDownload(job.id, e)}>
                        <Download className="mr-2 h-3 w-3" /> Tải về
                      </Button>
                    )}
                    <Button size="sm" variant="destructive" className="h-8 w-8 p-0" onClick={(e) => handleDelete(job.id, e)}>
                      <Trash2 className="h-3 w-3" />
                      <span className="sr-only">Xóa</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-4">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
          >
            ← Trước
          </Button>
          <span className="text-sm text-muted-foreground">
            Trang {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
          >
            Sau →
          </Button>
        </div>
      )}
    </div>
  )
}
