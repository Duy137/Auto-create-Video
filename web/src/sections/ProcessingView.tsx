import { useEffect, useState, useRef } from 'react'
import { connectSSE, SSEEvent } from '@/api/sse'
import { api } from '@/api/client'
import { LoaderCircle, CircleCheck, CircleAlert, Terminal, ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"

// Backend emits coarse-grained SSE events:
// Phase 1: step="processing" (0.10) → event="review_ready"
// Phase 2: step="staging" (0.20) → step="render" (0.60) → event="done"

const STEP_LABELS: Record<string, string> = {
  processing: 'AI đang phân tích và tạo nội dung...',
  staging: 'Chuẩn bị tài nguyên cho render...',
  render: 'Đang kết xuất video...',
}

interface ProcessingViewProps {
  jobId: string | null
  onReviewReady: (props: any) => void
  onDone: (url: string) => void
  onCancel?: () => void
}

export default function ProcessingView({ jobId, onReviewReady, onDone, onCancel }: ProcessingViewProps) {
  const [progress, setProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState('')
  const [message, setMessage] = useState('Đang kết nối...')
  const [logs, setLogs] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const sseRef = useRef<{ close: () => void } | null>(null)

  useEffect(() => {
    if (!jobId) return

    const addLog = (msg: string) => {
      const time = new Date().toLocaleTimeString('en-US', { hour12: false })
      setLogs(prev => [...prev.slice(-50), `[${time}] ${msg}`])
    }

    addLog('Bắt đầu kết nối tới tiến trình...')

    sseRef.current = connectSSE(
      jobId,
      (event: SSEEvent) => {
        switch (event.event) {
          case 'progress':
            setProgress(event.progress || 0)
            setCurrentStep(event.step || '')
            setMessage(event.message || 'Đang xử lý...')
            addLog(event.message || `Bước: ${event.step}`)
            break

          case 'review_ready':
            setProgress(1)
            setMessage('Đã sẵn sàng để kiểm tra!')
            addLog('✅ Hoàn tất giai đoạn 1 — Các cảnh quay đã sẵn sàng')
            if (event.props) {
              onReviewReady(event.props)
            } else {
              api.get(`/jobs/${jobId}`).then(job => {
                onReviewReady(job.props)
              })
            }
            break

          case 'done':
            setProgress(1)
            setMessage('Video đã sẵn sàng!')
            addLog('✅ Quá trình tạo video đã hoàn tất!')
            onDone(event.download_url || `/api/jobs/${jobId}/download`)
            break

          case 'error':
            setError(event.message || 'Lỗi không xác định trong tiến trình')
            addLog(`❌ Lỗi: ${event.message}`)
            break
        }
      },
      (err) => {
        addLog(`⚠ Lỗi kết nối: ${err.message}`)
      }
    )

    return () => {
      sseRef.current?.close()
    }
  }, [jobId, onReviewReady, onDone])

  const progressPercent = Math.round(progress * 100)

  return (
    <div className="max-w-2xl mx-auto space-y-8 py-8 animate-in fade-in duration-500">
      {/* Header Status */}
      <div className="text-center space-y-3">
        <div className="flex justify-center">
            {error ? (
                 <div className="bg-destructive/10 p-4 rounded-full">
                    <CircleAlert className="w-12 h-12 text-destructive" />
                 </div>
            ) : progress === 1 ? (
                <div className="bg-green-500/10 p-4 rounded-full">
                    <CircleCheck className="w-12 h-12 text-green-500" />
                </div>
            ) : (
                <div className="bg-primary/10 p-4 rounded-full relative">
                    <LoaderCircle className="w-12 h-12 text-primary animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-6 h-6 bg-primary rounded-full animate-ping opacity-20" />
                    </div>
                </div>
            )}
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            {error ? 'Gặp lỗi trong quá trình xử lý' : progress === 1 ? 'Hoàn tất xử lý' : 'Đang tạo Video với AI'}
          </h2>
          <p className="text-muted-foreground mt-1">{message}</p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="bg-destructive/5 border-destructive/20 text-destructive">
          <CircleAlert className="h-4 w-4" />
          <AlertTitle>Lỗi hệ thống</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Main Progress Card */}
      <Card className="border-primary/5 bg-card/40 backdrop-blur-md overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-muted">
            <div 
                className="h-full bg-primary transition-all duration-500 ease-out" 
                style={{ width: `${progressPercent}%` }} 
            />
        </div>
        
        <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span>Tiến độ thực hiện</span>
                <span className="font-mono text-primary">{progressPercent}%</span>
            </CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-3">
          {/* Current step indicator */}
          {currentStep && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 font-medium border border-primary/10">
              <LoaderCircle className="w-5 h-5 text-primary animate-spin flex-shrink-0" />
              <span className="text-foreground">
                {STEP_LABELS[currentStep] || currentStep.replace(/_/g, ' ')}
              </span>
            </div>
          )}
          
          {/* Progress bar */}
          <Progress value={progressPercent} className="h-2" />
        </CardContent>
      </Card>

      {/* Real-time Logs */}
      <Card className="border-none bg-black/40 text-green-500/90 font-mono text-xs shadow-none">
        <CardHeader className="py-2 px-4 border-b border-white/5">
            <CardTitle className="text-[10px] uppercase tracking-widest flex items-center gap-2 text-muted-foreground">
                <Terminal className="w-3 h-3" /> Nhật ký hệ thống
            </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
            <ScrollArea className="h-40 p-4">
                <div className="space-y-1">
                    {logs.map((log, i) => (
                        <div key={i} className="flex gap-2">
                           <span className="opacity-50 flex-shrink-0">{log.split(' ')[0]}</span>
                           <span>{log.split(' ').slice(1).join(' ')}</span>
                        </div>
                    ))}
                    {logs.length === 0 && <div className="text-muted-foreground italic">Đang chờ tín hiệu...</div>}
                </div>
            </ScrollArea>
        </CardContent>
      </Card>

      {/* Cancel button */}
      {onCancel && (
        <div className="flex flex-col items-center pt-4 gap-1">
          <Button
            variant="ghost"
            className="text-muted-foreground hover:text-foreground gap-2"
            onClick={() => {
              sseRef.current?.close()
              onCancel()
            }}
          >
            <ArrowLeft className="w-4 h-4" /> Ẩn tiến trình
          </Button>
          <p className="text-[10px] text-muted-foreground/60 text-center">
            Pipeline vẫn tiếp tục chạy nền
          </p>
        </div>
      )}
    </div>
  )
}

