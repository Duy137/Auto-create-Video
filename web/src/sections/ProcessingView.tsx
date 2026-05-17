import { useEffect, useMemo, useRef, useState } from 'react'
import { connectSSE, SSEEvent, ScriptVariant, ProgressSnapshot } from '@/api/sse'
import { api, SYSTEM_ERROR_MESSAGE } from '@/api/client'
import { SystemErrorReportButton } from '@/components/SystemErrorReport'
import {
  LoaderCircle, CircleCheck, CircleAlert,
  ArrowLeft, Circle, Clock3, Wrench, Zap,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const LEGACY_PROCESS_STEPS = [
  { key: 'processing', label: 'Phân tích & Tạo nội dung', sub: 'AI chia cảnh · Tổng hợp TTS · Tìm kiếm media' },
]

const LEGACY_RENDER_STEPS = [
  { key: 'staging', label: 'Chuẩn bị tài nguyên', sub: 'Sao chép file vào thư mục render' },
  { key: 'render', label: 'Kết xuất video', sub: 'Remotion render từng frame → MP4' },
]

const LEGACY_PROCESS_STEPS_SKIP = [
  { key: 'processing', label: 'Phân tích & Tạo nội dung', sub: 'AI chia cảnh · TTS · Tìm media' },
  { key: 'stage_assets', label: 'Chuẩn bị tài nguyên render', sub: '' },
  { key: 'render', label: 'Kết xuất video', sub: 'Remotion render → MP4' },
]

const RENDER_STEP_KEYS = new Set(['stage_assets', 'render_frames', 'finish_video'])
type PlanStepStatus = 'done' | 'active' | 'pending' | 'error'

function inferDoneSteps<T extends { status: PlanStepStatus }>(rows: T[]): T[] {
  const firstActive = rows.findIndex(r => r.status === 'active')
  if (firstActive <= 0) return rows
  return rows.map((r, i) => i < firstActive && r.status !== 'done' ? { ...r, status: 'done' as const } : r)
}

const PENDING_RENDER_ROWS = [
  { key: 'stage_assets', label: 'Chuẩn bị tài nguyên render', sub: '', status: 'pending' as const },
  { key: 'render_frames', label: 'Kết xuất video', sub: 'Remotion render từng frame → MP4', status: 'pending' as const },
  { key: 'finish_video', label: 'Hoàn tất video', sub: '', status: 'pending' as const },
]

interface HumanCheckpoint {
  type: string
  question: string
  scripts?: ScriptVariant[]
}

interface ProcessingViewProps {
  jobId: string | null
  onReviewReady: (props: any) => void
  onDone: (url: string) => void
  onCancel?: () => void
  onNeedsHuman?: (checkpoint: HumanCheckpoint) => void
  skipReview?: boolean
}

function formatSeconds(seconds?: number): string {
  if (seconds == null || Number.isNaN(seconds)) return '...'
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const sec = seconds % 60
  return `${mins}m ${sec}s`
}

export default function ProcessingView({
  jobId, onReviewReady, onDone, onCancel, onNeedsHuman, skipReview,
}: ProcessingViewProps) {
  const savedStateRef = useRef<any>(undefined)
  if (savedStateRef.current === undefined) {
    try {
      const raw = jobId ? sessionStorage.getItem(`processing_state_${jobId}`) : null
      savedStateRef.current = raw ? JSON.parse(raw) : null
    } catch {
      savedStateRef.current = null
    }
  }
  const _s = savedStateRef.current

  const [progress, setProgress] = useState<number>(_s?.progress ?? 0)
  const [currentStep, setCurrentStep] = useState<string>(_s?.currentStep ?? '')
  const [message, setMessage] = useState<string>(
    _s?.message ?? (skipReview ? 'Đang xử lý...' : 'Đang kết nối...'),
  )
  const [snapshot, setSnapshot] = useState<ProgressSnapshot | null>(_s?.snapshot ?? null)
  const [error, setError] = useState<string | null>(null)
  const [errorDetail, setErrorDetail] = useState<unknown>(null)
  const [elapsedTick, setElapsedTick] = useState(0)
  const [timerStartedAtMs, setTimerStartedAtMs] = useState<number | null>(() => {
    const value = Number(_s?.timerStartedAtMs)
    if (Number.isFinite(value) && value > 0) return value
    if (!jobId) return null
    const stored = Number(sessionStorage.getItem(`processing_started_at_${jobId}`))
    return Number.isFinite(stored) && stored > 0 ? stored : null
  })
  const [timerStorageKey, setTimerStorageKey] = useState<string | null>(_s?.timerStorageKey ?? null)
  const sseRef = useRef<{ close: () => void } | null>(null)
  const terminalHandledRef = useRef(false)

  useEffect(() => {
    if (!jobId || error || progress === 1) return
    try {
      sessionStorage.setItem(`processing_state_${jobId}`, JSON.stringify({
        progress,
        currentStep,
        message,
        snapshot,
        timerStartedAtMs,
        timerStorageKey,
      }))
    } catch {}
  }, [jobId, progress, currentStep, message, snapshot, timerStartedAtMs, timerStorageKey, error])

  useEffect(() => {
    if (!jobId) return

    terminalHandledRef.current = false

    const finalizeReview = (props: any) => {
      if (terminalHandledRef.current) return
      terminalHandledRef.current = true
      setProgress(1)
      setMessage('Đã sẵn sàng để kiểm tra!')
      setCurrentStep('')
      sessionStorage.removeItem(`processing_state_${jobId}`)
      onReviewReady(props)
    }

    const finalizeDone = (downloadUrl: string) => {
      if (terminalHandledRef.current) return
      terminalHandledRef.current = true
      setProgress(1)
      setMessage('Video đã sẵn sàng!')
      setCurrentStep('')
      sessionStorage.removeItem(`processing_state_${jobId}`)
      onDone(downloadUrl)
    }

    const finalizeError = (messageText: string) => {
      if (terminalHandledRef.current) return
      terminalHandledRef.current = true
      setError(SYSTEM_ERROR_MESSAGE)
      setErrorDetail(messageText)
      setMessage(SYSTEM_ERROR_MESSAGE)
      sessionStorage.removeItem(`processing_state_${jobId}`)
    }

    sseRef.current = connectSSE(
      jobId,
      (event: SSEEvent) => {
        if (terminalHandledRef.current) return

        if (event.progress_snapshot) {
          setSnapshot(event.progress_snapshot)
        }

        const nextProgressFromSnapshot =
          event.progress_snapshot && event.progress_snapshot.step_count > 0
            ? event.progress_snapshot.step_index / event.progress_snapshot.step_count
            : undefined
        const nextProgress = event.progress ?? nextProgressFromSnapshot

        switch (event.event) {
          case 'progress':
            setProgress(nextProgress ?? 0)
            setCurrentStep(event.step || '')
            setMessage(event.message || event.progress_snapshot?.current_step || 'Đang xử lý...')
            break

          case 'needs_human':
            setProgress(nextProgress ?? 0.5)
            setMessage(event.human_question || 'Cần quyết định từ bạn')
            if (onNeedsHuman) {
              onNeedsHuman({
                type: event.human_checkpoint_type || 'general',
                question: event.human_question || '',
                scripts: event.generated_scripts,
              })
            }
            break

          case 'review_ready':
            if (event.props) {
              finalizeReview(event.props)
            } else {
              api.get(`/jobs/${jobId}`).then((job) => {
                if (job?.props) finalizeReview(job.props)
              })
            }
            break

          case 'done':
            finalizeDone(event.download_url || `/api/jobs/${jobId}/download`)
            break

          case 'error':
            finalizeError(event.message || 'Lỗi không xác định trong tiến trình')
            break

          case 'agent_trace':
            break
        }
      },
      () => {
        setMessage((prev) => prev || 'Kết nối tiến độ tạm thời gián đoạn...')
      }
    )

    return () => {
      sseRef.current?.close()
    }
  }, [jobId, onReviewReady, onDone, onNeedsHuman])

  useEffect(() => {
    if (!jobId) return

    let cancelled = false

    const pollStatus = async () => {
      if (cancelled || terminalHandledRef.current) return

      try {
        const job = await api.get(`/jobs/${jobId}`)
        if (cancelled || terminalHandledRef.current) return

        const status = String(job?.status || '')
        if (status === 'review' && job?.props) {
          terminalHandledRef.current = true
          setProgress(1)
          setMessage('Đã sẵn sàng để kiểm tra!')
          setCurrentStep('')
          sessionStorage.removeItem(`processing_state_${jobId}`)
          onReviewReady(job.props)
          return
        }

        if (status === 'done') {
          terminalHandledRef.current = true
          setProgress(1)
          setMessage('Video đã sẵn sàng!')
          setCurrentStep('')
          sessionStorage.removeItem(`processing_state_${jobId}`)
          onDone(`/api/jobs/${jobId}/download`)
          return
        }

        if (status === 'failed') {
          terminalHandledRef.current = true
          setError(SYSTEM_ERROR_MESSAGE)
          setErrorDetail(job?.error || job?.failure_reason || 'Lỗi không xác định trong tiến trình')
          setMessage(SYSTEM_ERROR_MESSAGE)
          sessionStorage.removeItem(`processing_state_${jobId}`)
        }
      } catch {
        // Keep SSE as primary signal; polling is best-effort fallback.
      }
    }

    void pollStatus()
    const timerId = window.setInterval(() => {
      void pollStatus()
    }, 2500)

    return () => {
      cancelled = true
      window.clearInterval(timerId)
    }
  }, [jobId, onReviewReady, onDone])

  const progressPercent = Math.round(progress * 100)

  useEffect(() => {
    if (!jobId || !snapshot) return
    const phase = snapshot.phase || 'job'
    const storageKey = `processing_started_at_${jobId}_${phase}`
    const stored = Number(sessionStorage.getItem(storageKey))
    const fallbackElapsedMs = Math.max(0, Number(snapshot.elapsed_seconds || 0)) * 1000
    const startedAtMs = Number.isFinite(stored) && stored > 0
      ? stored
      : Date.now() - fallbackElapsedMs

    sessionStorage.setItem(storageKey, String(startedAtMs))
    setTimerStartedAtMs(startedAtMs)
    setTimerStorageKey(storageKey)
    setElapsedTick(tick => tick + 1)
  }, [jobId, snapshot])

  useEffect(() => {
    if (error || progress >= 1 || !timerStartedAtMs) return
    const timerId = window.setInterval(() => {
      setElapsedTick(tick => tick + 1)
    }, 1000)
    return () => window.clearInterval(timerId)
  }, [error, progress, timerStartedAtMs])

  const liveElapsedSeconds = useMemo(() => {
    if (timerStartedAtMs) {
      return Math.max(0, Math.floor((Date.now() - timerStartedAtMs) / 1000))
    }
    return typeof snapshot?.elapsed_seconds === 'number'
      ? snapshot.elapsed_seconds
      : undefined
  }, [elapsedTick, snapshot, timerStartedAtMs])

  const isRenderPhase = useMemo(() => {
    if (snapshot?.execution_plan?.length) {
      return snapshot.execution_plan.some(s => RENDER_STEP_KEYS.has(s.key))
    }
    return RENDER_STEP_KEYS.has(currentStep)
  }, [snapshot, currentStep])

  const planRows = useMemo(() => {
    if (skipReview) {
      if (snapshot?.execution_plan?.length) {
        const rows = inferDoneSteps(snapshot.execution_plan.map((step) => ({
          key: step.key,
          label: step.label,
          status: step.status,
          sub: '',
        })))
        // Phase 1 active: append pending render rows at bottom if not yet in render phase
        if (!isRenderPhase) {
          return [...rows, ...PENDING_RENDER_ROWS]
        }
        return rows
      }

      // Legacy fallback for skip_review
      const usingRenderPhase = isRenderPhase
      const legacy = usingRenderPhase ? LEGACY_RENDER_STEPS : LEGACY_PROCESS_STEPS_SKIP
      return legacy.map((step, idx) => {
        let status: PlanStepStatus = 'pending'
        if (progress >= 1) {
          status = 'done'
        } else if (currentStep === step.key) {
          status = 'active'
        } else if (idx === 0 && progress > 0 && !usingRenderPhase) {
          status = 'active'
        }
        return { ...step, status }
      })
    }

    // Normal flow (non-skip_review)
    if (snapshot?.execution_plan?.length) {
      return inferDoneSteps(snapshot.execution_plan.map((step) => ({
        key: step.key,
        label: step.label,
        status: step.status,
        sub: '',
      })))
    }

    const usingRenderPhase = currentStep === 'staging' || currentStep === 'render'
    const legacy = usingRenderPhase ? LEGACY_RENDER_STEPS : LEGACY_PROCESS_STEPS

    return legacy.map((step, idx) => {
      let status: PlanStepStatus = 'pending'
      if (progress >= 1) {
        status = 'done'
      } else if (currentStep === step.key) {
        status = 'active'
      } else if (idx === 0 && progress > 0) {
        status = 'active'
      }
      return {
        ...step,
        status,
      }
    })
  }, [snapshot, currentStep, progress, skipReview, isRenderPhase])

  const stepCounterText = snapshot
    ? `${snapshot.step_index}/${snapshot.step_count} bước`
    : `${progressPercent}%`

  const currentStepText = snapshot?.current_step || message
  const activeTool = snapshot?.active_tool
  const intermediateResults = snapshot?.intermediate_results || []

  const mainTitle = error
    ? SYSTEM_ERROR_MESSAGE
    : progress === 1
      ? 'Hoàn tất xử lý'
      : skipReview && isRenderPhase
        ? 'Đang kết xuất video...'
        : 'Đang tạo Video với AI'

  // Split planRows into two phases for skipReview layout
  const phase1Rows = useMemo(() => {
    if (!skipReview) return null
    return planRows.filter(r => !RENDER_STEP_KEYS.has(r.key))
  }, [planRows, skipReview])

  const phase2Rows = useMemo(() => {
    if (!skipReview) return null
    return planRows.filter(r => RENDER_STEP_KEYS.has(r.key))
  }, [planRows, skipReview])

  const phase1Done = useMemo(() => {
    if (!skipReview || !phase1Rows) return false
    return phase1Rows.every(r => r.status === 'done')
  }, [skipReview, phase1Rows])

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-8 animate-in fade-in duration-500 relative">
      <div
        className="pointer-events-none absolute -top-20 left-1/2 h-56 w-[28rem] -translate-x-1/2 rounded-full blur-3xl opacity-40"
        style={{ background: 'var(--gradient-glow)' }}
      />

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
            <div
              className="p-4 rounded-full relative"
              style={{ background: 'color-mix(in srgb, var(--brand-500) 12%, transparent)' }}
            >
              <LoaderCircle className="w-12 h-12 text-primary animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-6 h-6 bg-primary rounded-full animate-ping opacity-20" />
              </div>
            </div>
          )}
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{mainTitle}</h2>
          {!error && <p className="text-muted-foreground mt-1">{message}</p>}
          {skipReview && !error && progress < 1 && (
            <div className="flex justify-center mt-2">
              <Badge variant="secondary" className="gap-1.5 text-xs">
                <Zap className="w-3 h-3 text-yellow-500" /> Tạo nhanh — bỏ qua bước kiểm tra
              </Badge>
            </div>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="bg-destructive/5 border-destructive/20 text-destructive">
          <CircleAlert className="h-4 w-4" />
          <AlertTitle>{SYSTEM_ERROR_MESSAGE}</AlertTitle>
          <AlertDescription className="pt-2">
            <SystemErrorReportButton
              source="processing"
              jobId={jobId}
              detail={errorDetail}
              className="border-destructive/30 text-destructive hover:bg-destructive/10"
            />
          </AlertDescription>
        </Alert>
      )}

      {!error && <Card className="surface-card border-0 bg-[color:var(--surface-0)]/85 backdrop-blur-md overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-muted">
          <div
            className="h-full transition-all duration-700 ease-out"
            style={{ width: `${progressPercent}%`, background: 'var(--gradient-brand)' }}
          />
        </div>

        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <span>Tiến độ thực hiện</span>
            <span className="font-mono text-primary">{stepCounterText}</span>
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="rounded-lg border border-primary/10 bg-primary/5 p-3">
            <p className="text-xs text-muted-foreground mb-1">Bước hiện tại</p>
            <p className="text-sm font-medium">{currentStepText}</p>
            {activeTool && (
              <div className="mt-2">
                <Badge variant="secondary" className="gap-1.5">
                  <Wrench className="w-3 h-3" /> Công cụ đang dùng: {activeTool}
                </Badge>
              </div>
            )}
            <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Clock3 className="w-3.5 h-3.5" />
                Đã chạy: {formatSeconds(liveElapsedSeconds)}
              </span>
            </div>
          </div>

          {skipReview ? (
            <div className="space-y-3">
              {/* Phase 1 */}
              <div>
                <div className={cn(
                  'flex items-center gap-2 px-1 mb-1',
                  phase1Done ? 'opacity-60' : '',
                )}>
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                    {phase1Done
                      ? <><CircleCheck className="w-3 h-3 text-green-500" /> Giai đoạn 1: Xử lý nội dung</>
                      : <>Giai đoạn 1: Xử lý nội dung</>
                    }
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                {phase1Done ? (
                  <div className="flex items-center gap-3 p-2.5 rounded-lg opacity-50">
                    <CircleCheck className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span className="text-sm text-muted-foreground">Hoàn tất xử lý nội dung</span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {phase1Rows?.map((step) => (
                      <div
                        key={step.key}
                        className={cn(
                          'flex items-start gap-3 p-3 rounded-lg transition-all duration-300',
                          step.status === 'active' && 'bg-primary/5 border border-primary/10',
                          step.status === 'error' && 'bg-destructive/10 border border-destructive/20 text-destructive',
                          step.status === 'done' && 'opacity-55',
                          step.status === 'pending' && 'opacity-30',
                        )}
                      >
                        <div className="mt-0.5 flex-shrink-0">
                          {step.status === 'done' && <CircleCheck className="w-5 h-5 text-green-500" />}
                          {step.status === 'active' && <LoaderCircle className="w-5 h-5 text-primary animate-spin" />}
                          {step.status === 'error' && <CircleAlert className="w-5 h-5 text-destructive" />}
                          {step.status === 'pending' && <Circle className="w-5 h-5 text-muted-foreground" />}
                        </div>
                        <div>
                          <p className="font-medium text-sm leading-tight">{step.label}</p>
                          {step.sub ? <p className="text-xs text-muted-foreground mt-0.5">{step.sub}</p> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Phase 2 */}
              <div>
                <div className={cn(
                  'flex items-center gap-2 px-1 mb-1',
                  !isRenderPhase ? 'opacity-40' : '',
                )}>
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                    {isRenderPhase && !phase2Rows?.every(r => r.status === 'done')
                      ? <><LoaderCircle className="w-3 h-3 text-primary animate-spin" /> Giai đoạn 2: Kết xuất video</>
                      : phase2Rows?.every(r => r.status === 'done')
                        ? <><CircleCheck className="w-3 h-3 text-green-500" /> Giai đoạn 2: Kết xuất video</>
                        : <>Giai đoạn 2: Kết xuất video</>
                    }
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div className="space-y-1">
                  {phase2Rows?.map((step) => (
                    <div
                      key={step.key}
                      className={cn(
                        'flex items-start gap-3 p-3 rounded-lg transition-all duration-300',
                        step.status === 'active' && 'bg-primary/5 border border-primary/10',
                        step.status === 'error' && 'bg-destructive/10 border border-destructive/20 text-destructive',
                        step.status === 'done' && 'opacity-55',
                        step.status === 'pending' && 'opacity-30',
                      )}
                    >
                      <div className="mt-0.5 flex-shrink-0">
                        {step.status === 'done' && <CircleCheck className="w-5 h-5 text-green-500" />}
                        {step.status === 'active' && <LoaderCircle className="w-5 h-5 text-primary animate-spin" />}
                        {step.status === 'error' && <CircleAlert className="w-5 h-5 text-destructive" />}
                        {step.status === 'pending' && <Circle className="w-5 h-5 text-muted-foreground" />}
                      </div>
                      <div>
                        <p className="font-medium text-sm leading-tight">{step.label}</p>
                        {step.sub ? <p className="text-xs text-muted-foreground mt-0.5">{step.sub}</p> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              {planRows.map((step) => (
                <div
                  key={step.key}
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-lg transition-all duration-300',
                    step.status === 'active' && 'bg-primary/5 border border-primary/10',
                    step.status === 'error' && 'bg-destructive/10 border border-destructive/20 text-destructive',
                    step.status === 'done' && 'opacity-55',
                    step.status === 'pending' && 'opacity-30',
                  )}
                >
                  <div className="mt-0.5 flex-shrink-0">
                    {step.status === 'done' && <CircleCheck className="w-5 h-5 text-green-500" />}
                    {step.status === 'active' && <LoaderCircle className="w-5 h-5 text-primary animate-spin" />}
                    {step.status === 'error' && <CircleAlert className="w-5 h-5 text-destructive" />}
                    {step.status === 'pending' && <Circle className="w-5 h-5 text-muted-foreground" />}
                  </div>
                  <div>
                    <p className="font-medium text-sm leading-tight">{step.label}</p>
                    {step.sub ? <p className="text-xs text-muted-foreground mt-0.5">{step.sub}</p> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>}

      {!error && <Card className="surface-card border-0 bg-[color:var(--surface-0)]/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Kết quả trung gian</CardTitle>
        </CardHeader>
        <CardContent>
          {intermediateResults.length > 0 ? (
            <div className="space-y-2 text-sm">
              {intermediateResults.map((item, idx) => (
                <p key={`${item}-${idx}`} className="text-muted-foreground">
                  {item}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Đang thu thập dữ liệu xử lý...</p>
          )}
        </CardContent>
      </Card>}

      {onCancel && (
        <div className="flex flex-col items-center pt-2 gap-1">
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
