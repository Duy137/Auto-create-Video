import { useRef, useState, useEffect } from 'react'
import { Download, RefreshCw, CircleCheck, Clapperboard, Share2, Info, LoaderCircle, CircleAlert, Copy, Link2 } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'

import { createShareLink, deleteShareLink, type ShareLinkData, tryRefresh } from '@/api/client'
import { showErrorToast } from '@/components/SystemErrorReport'
import { Card, CardContent, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { toast } from "sonner"

interface ResultViewProps {
  jobId: string
  videoUrl?: string
  videoProps?: any
  onCreateAnother: () => void
}

/**
 * Result View — video player, download button, generation stats.
 */
export default function ResultView({ jobId, videoUrl, videoProps, onCreateAnother }: ResultViewProps) {
  const downloadUrl = videoUrl || `/api/jobs/${jobId}/download`
  const thumbnailUrl = `/api/jobs/${jobId}/thumbnail`
  const videoRef = useRef<HTMLVideoElement>(null)
  const [videoLoading, setVideoLoading] = useState(true)
  const [videoError, setVideoError] = useState(false)
  const [thumbnailError, setThumbnailError] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareLoading, setShareLoading] = useState(false)
  const [shareBusy, setShareBusy] = useState(false)
  const [shareData, setShareData] = useState<ShareLinkData | null>(null)
  const appBase = window.location.pathname.startsWith('/web') ? '/web' : ''
  const sharePublicUrl = shareData
    ? `${window.location.origin}${appBase}${shareData.share_url}`
    : ''

  // Fetch video with auth header → create blob URL → set as video src
  useEffect(() => {
    if (!downloadUrl) return
    let objectUrl: string | null = null

    setVideoLoading(true)
    setVideoError(false)

    const fetchVideo = async (retry = false) => {
      try {
        const r = await fetch(downloadUrl, { credentials: 'include' })
        if (r.status === 401 && !retry) {
          const refreshed = await tryRefresh()
          if (refreshed) {
            return fetchVideo(true)
          }
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        
        const blob = await r.blob()
        objectUrl = URL.createObjectURL(blob)
        if (videoRef.current) {
          videoRef.current.src = objectUrl
          setVideoLoading(false)
        }
      } catch (err) {
        console.error('Video load failed:', err)
        setVideoError(true)
        setVideoLoading(false)
      }
    }

    fetchVideo()

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [downloadUrl])

  useEffect(() => {
    if (!shareOpen || shareData || shareLoading) return

    setShareLoading(true)
    createShareLink(jobId)
      .then((data) => setShareData(data))
      .catch((err: any) => {
        showErrorToast(err, {
          source: 'result_share_create',
          jobId,
          fallback: 'Không thể tạo liên kết chia sẻ',
          prefix: 'Không thể tạo liên kết chia sẻ',
        })
      })
      .finally(() => setShareLoading(false))
  }, [shareOpen, shareData, shareLoading, jobId])

  // Build download link with auth
  const handleDownload = () => {
    toast.promise(
      new Promise(async (resolve, reject) => {
        try {
          const fetchFile = async (retry = false): Promise<Response> => {
            const res = await fetch(downloadUrl, { credentials: 'include' })
            if (res.status === 401 && !retry) {
              const refreshed = await tryRefresh()
              if (refreshed) return fetchFile(true)
            }
            return res
          }
          const res = await fetchFile()
          if (!res.ok) throw new Error('Tải xuống thất bại')
          const blob = await res.blob()
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `autoclip_${jobId}.mp4`
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          URL.revokeObjectURL(url)
          resolve(true)
        } catch (err) {
          reject(err)
        }
      }),
      {
        loading: 'Đang chuẩn bị file video...',
        success: 'Bắt đầu tải xuống!',
        error: 'Lỗi khi tải video. Vui lòng thử lại.',
      }
    )
  }

  const handleCopyShareUrl = async () => {
    if (!sharePublicUrl) return
    try {
      await navigator.clipboard.writeText(sharePublicUrl)
      toast.success('Đã sao chép liên kết chia sẻ')
    } catch {
      toast.error('Không thể sao chép liên kết')
    }
  }

  const handleDisableShare = async () => {
    setShareBusy(true)
    try {
      await deleteShareLink(jobId)
      setShareData(null)
      setShareOpen(false)
      toast.success('Đã tắt chia sẻ công khai')
    } catch (err: any) {
      showErrorToast(err, {
        source: 'result_share_delete',
        jobId,
        fallback: 'Không thể tắt chia sẻ',
        prefix: 'Không thể tắt chia sẻ',
      })
    } finally {
      setShareBusy(false)
    }
  }

  const title = videoProps?.title || 'Video đã hoàn thiện'
  const sceneCount = videoProps?.scenes?.length || 0
  const lastScene = videoProps?.scenes?.[sceneCount - 1]
  const durationSec = lastScene ? (lastScene.end_ms / 1000).toFixed(1) : '—'

  return (
    <div className="max-w-3xl mx-auto py-10 space-y-8 animate-in zoom-in-95 duration-500 relative">
      <div className="pointer-events-none absolute -top-20 left-1/2 h-60 w-[28rem] -translate-x-1/2 rounded-full blur-3xl opacity-40" style={{ background: 'var(--gradient-glow)' }} />
      {/* Success Header */}
      <div className="text-center space-y-4">
        <div className="flex justify-center">
            <div className="bg-green-500/10 p-5 rounded-full ring-8 ring-green-500/5">
                <CircleCheck className="w-16 h-12 text-green-500" />
            </div>
        </div>
        <div className="space-y-1">
            <h2 className="text-3xl font-extrabold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Tuyệt vời! Video đã sẵn sàng</h2>
          <p className="text-muted-foreground">AI đã hoàn tất quá trình biên tập và kết xuất video của bạn.</p>
        </div>
      </div>

      {/* Video Player Card */}
      <Card className="surface-card border-0 bg-[color:var(--surface-0)]/90 backdrop-blur-md overflow-hidden shadow-2xl">
        <CardContent className="p-0">
          <div className="aspect-[9/16] w-full max-h-[600px] bg-black relative group">
            {videoLoading && (
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <LoaderCircle className="w-8 h-8 animate-spin text-primary" />
                <span className="ml-2 text-sm text-muted-foreground">Đang tải video...</span>
              </div>
            )}
            {videoError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground z-10">
                <CircleAlert className="w-8 h-8" />
                <span className="text-sm">Không thể tải video</span>
              </div>
            )}
            <video
              ref={videoRef}
              controls
              playsInline
              poster={!thumbnailError ? (thumbnailUrl || undefined) : undefined}
              className="w-full h-full object-contain"
              style={{ display: videoLoading || videoError ? 'none' : 'block' }}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col items-start p-6 space-y-4" style={{ background: 'color-mix(in srgb, var(--surface-2) 60%, transparent)' }}>
            <div className="w-full flex justify-between items-center">
                <div className="space-y-1">
                    <CardTitle className="text-lg font-bold flex items-center gap-2">
                        <Clapperboard className="w-4 h-4 text-primary" /> {title}
                    </CardTitle>
                    <div className="flex gap-2 items-center">
                        <Badge variant="outline" className="font-mono text-[10px]">{durationSec}s</Badge>
                        <Badge variant="outline" className="font-mono text-[10px]">{sceneCount} Cảnh quay</Badge>
                      <Badge variant="secondary" className="text-[10px] border-none uppercase" style={{ background: 'color-mix(in srgb, var(--brand-500) 14%, transparent)', color: 'var(--brand-700)' }}>Toàn HD</Badge>
                    </div>
                </div>
                <Dialog open={shareOpen} onOpenChange={setShareOpen}>
                  <DialogTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-full h-10 w-10 hover:bg-primary/10 hover:text-primary transition-colors"
                      />
                    }
                  >
                    <Share2 className="w-5 h-5" />
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <Link2 className="w-4 h-4" /> Chia sẻ công khai
                      </DialogTitle>
                      <DialogDescription>
                        Tạo liên kết công khai để người khác xem video mà không cần đăng nhập.
                      </DialogDescription>
                    </DialogHeader>

                    {shareLoading && !shareData ? (
                      <div className="py-8 flex items-center justify-center text-sm text-muted-foreground gap-2">
                        <LoaderCircle className="w-4 h-4 animate-spin" /> Đang tạo liên kết chia sẻ...
                      </div>
                    ) : shareData ? (
                      <div className="space-y-4">
                        <div className="flex justify-center">
                          <div className="rounded-lg border p-3 bg-white">
                            <QRCodeSVG value={sharePublicUrl} size={168} />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Input value={sharePublicUrl} readOnly />
                          <div className="flex gap-2">
                            <Button className="flex-1" onClick={handleCopyShareUrl}>
                              <Copy className="w-4 h-4 mr-2" /> Sao chép liên kết
                            </Button>
                            <Button
                              variant="outline"
                              className="flex-1"
                              onClick={() => window.open(sharePublicUrl, '_blank')}
                            >
                              Mở trang chia sẻ
                            </Button>
                          </div>
                        </div>

                        <DialogFooter>
                          <Button
                            variant="destructive"
                            onClick={handleDisableShare}
                            disabled={shareBusy}
                          >
                            {shareBusy ? 'Đang xử lý...' : 'Tắt chia sẻ'}
                          </Button>
                        </DialogFooter>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Không thể tạo liên kết chia sẻ.</p>
                    )}
                  </DialogContent>
                </Dialog>
            </div>
        </CardFooter>
      </Card>

      {thumbnailUrl && !thumbnailError && (
        <Card className="surface-card border-0 bg-[color:var(--surface-0)]/80 backdrop-blur-sm shadow-sm">
          <CardContent className="p-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ảnh bìa tự động</p>
            <img
              src={thumbnailUrl}
              alt={`Thumbnail ${jobId}`}
              className="w-full aspect-video object-cover rounded-md border bg-muted"
              loading="lazy"
              onError={() => setThumbnailError(true)}
            />
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="grid md:grid-cols-2 gap-4 pt-4">
        <Button
            size="lg"
            className="h-14 font-bold text-lg gap-2 shadow-lg transition-all hover:scale-[1.02]"
            style={{ background: 'var(--gradient-brand)', color: '#fff' }}
            onClick={handleDownload}
        >
          <Download className="w-5 h-5" /> Tải xuống Video (.mp4)
        </Button>
        <Button
            variant="outline"
            size="lg"
            className="h-14 font-bold text-lg gap-2 border-primary/20 hover:bg-primary/5 transition-all hover:scale-[1.02]"
            onClick={onCreateAnother}
        >
          <RefreshCw className="w-5 h-5" /> Tạo Video mới
        </Button>
      </div>
    </div>
  )
}
