import { useRef, useState, useEffect } from 'react'
import { Download, RefreshCw, CircleCheck, Clapperboard, Share2, Info, LoaderCircle, CircleAlert } from 'lucide-react'
import { getToken } from '@/api/client'
import { Card, CardContent, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
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
  const token = getToken()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [videoLoading, setVideoLoading] = useState(true)
  const [videoError, setVideoError] = useState(false)

  // Fetch video with auth header → create blob URL → set as video src
  useEffect(() => {
    if (!downloadUrl) return
    let objectUrl: string | null = null

    setVideoLoading(true)
    setVideoError(false)

    fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${getToken()}` }
    })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.blob()
      })
      .then(blob => {
        objectUrl = URL.createObjectURL(blob)
        if (videoRef.current) {
          videoRef.current.src = objectUrl
          setVideoLoading(false)
        }
      })
      .catch(err => {
        console.error('Video load failed:', err)
        setVideoError(true)
        setVideoLoading(false)
      })

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [downloadUrl])

  // Build download link with auth
  const handleDownload = () => {
    toast.promise(
      new Promise(async (resolve, reject) => {
        try {
          const res = await fetch(downloadUrl, {
            headers: { 'Authorization': `Bearer ${token}` },
          })
          if (!res.ok) throw new Error('Download failed')
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

  const title = videoProps?.title || 'Video đã hoàn thiện'
  const sceneCount = videoProps?.scenes?.length || 0
  const lastScene = videoProps?.scenes?.[sceneCount - 1]
  const durationSec = lastScene ? (lastScene.end_ms / 1000).toFixed(1) : '—'

  return (
    <div className="max-w-2xl mx-auto py-10 space-y-8 animate-in zoom-in-95 duration-500">
      {/* Success Header */}
      <div className="text-center space-y-4">
        <div className="flex justify-center">
            <div className="bg-green-500/10 p-5 rounded-full ring-8 ring-green-500/5">
                <CircleCheck className="w-16 h-12 text-green-500" />
            </div>
        </div>
        <div className="space-y-1">
            <h2 className="text-3xl font-extrabold tracking-tight">Tuyệt vời! Video đã sẵn sàng</h2>
            <p className="text-muted-foreground">AI đã hoàn tất quá trình biên tập và render video của bạn.</p>
        </div>
      </div>

      {/* Video Player Card */}
      <Card className="border-primary/10 bg-card/40 backdrop-blur-md overflow-hidden shadow-2xl">
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
              className="w-full h-full object-contain"
              style={{ display: videoLoading || videoError ? 'none' : 'block' }}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col items-start p-6 space-y-4 bg-muted/20">
            <div className="w-full flex justify-between items-center">
                <div className="space-y-1">
                    <CardTitle className="text-lg font-bold flex items-center gap-2">
                        <Clapperboard className="w-4 h-4 text-primary" /> {title}
                    </CardTitle>
                    <div className="flex gap-2 items-center">
                        <Badge variant="outline" className="font-mono text-[10px]">{durationSec}s</Badge>
                        <Badge variant="outline" className="font-mono text-[10px]">{sceneCount} Cảnh quay</Badge>
                        <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px] border-none uppercase">Full HD</Badge>
                    </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full h-10 w-10 hover:bg-primary/10 hover:text-primary transition-colors"
                  onClick={() => {
                    const shareUrl = `${window.location.origin}/api/jobs/${jobId}/download`
                    navigator.clipboard.writeText(shareUrl).then(() => {
                      toast.success('Đã sao chép link tải video!')
                    }).catch(() => {
                      toast.error('Không thể sao chép link')
                    })
                  }}
                >
                    <Share2 className="w-5 h-5" />
                </Button>
            </div>
            
            <Separator className="bg-primary/5" />
            
            <div className="w-full flex items-center gap-2 text-muted-foreground text-xs bg-primary/5 p-3 rounded-lg border border-primary/10">
                <Info className="w-4 h-4 text-primary shrink-0" />
                <span>Video này được lưu trữ tạm thời trong 24h. Vui lòng tải xuống để lưu giữ vĩnh viễn.</span>
            </div>
        </CardFooter>
      </Card>

      {/* Action Buttons */}
      <div className="grid md:grid-cols-2 gap-4 pt-4">
        <Button 
            size="lg" 
            className="h-14 font-bold text-lg gap-2 shadow-lg shadow-primary/20 transition-all hover:scale-[1.02]" 
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
