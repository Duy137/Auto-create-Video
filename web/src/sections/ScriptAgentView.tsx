/**
 * ScriptAgentView — "Tôi chưa có script" flow.
 *
 * User fills in topic + tone + duration → clicks "Tạo kịch bản với AI"
 * → calls POST /api/script-agent → shows 1-3 variants → user picks one
 * → parent receives the chosen full_script text and switches to normal flow.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, getProject, updateProject, SYSTEM_ERROR_MESSAGE, toUserErrorMessage } from '@/api/client'
import { SystemErrorReportButton } from '@/components/SystemErrorReport'
import { ScriptVariant, ProgressSnapshot, connectScriptAgentSSE } from '@/api/sse'
import {
  Sparkles, LoaderCircle, ChevronRight, Clock, Hash,
  CheckCircle2, ArrowRight, Link, AlignLeft, CircleCheck, Circle, Wrench, CircleAlert,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'

const TONES = [
  { value: 'casual',      label: 'Thân thiện',  emoji: '😊' },
  { value: 'educational', label: 'Giáo dục',    emoji: '📚' },
  { value: 'news',        label: 'Tin tức',      emoji: '📰' },
  { value: 'hype',        label: 'Sôi động',     emoji: '🔥' },
  { value: 'formal',      label: 'Chuyên nghiệp', emoji: '💼' },
]

const FORMATS = [
  { value: 'explainer', label: 'Giải thích' },
  { value: 'news',      label: 'Tin tức' },
  { value: 'story',     label: 'Câu chuyện' },
  { value: 'promo',     label: 'Quảng cáo' },
  { value: 'training',  label: 'Đào tạo' },
]

interface ScriptAgentViewProps {
  onScriptChosen: (script: string, title: string) => void
  onCancel: () => void
  projectId?: string | null
}

function formatSeconds(seconds?: number): string {
  if (seconds == null || Number.isNaN(seconds)) return '...'
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const sec = seconds % 60
  return `${mins}m ${sec}s`
}

function normalizePersistedVariant(raw: any): ScriptVariant {
  return {
    title: typeof raw?.title === 'string' ? raw.title : 'Script',
    hook: typeof raw?.hook === 'string' ? raw.hook : '',
    body: typeof raw?.body === 'string' ? raw.body : '',
    cta: typeof raw?.cta === 'string' ? raw.cta : '',
    full_script: typeof raw?.full_script === 'string' ? raw.full_script : '',
    estimated_duration: Number(raw?.estimated_duration || 0),
    hashtags: Array.isArray(raw?.hashtags) ? raw.hashtags.filter((tag: any) => typeof tag === 'string') : [],
  }
}

export default function ScriptAgentView({
  onScriptChosen,
  onCancel,
  projectId,
}: ScriptAgentViewProps) {
  const [topic, setTopic] = useState('')
  const [audience] = useState('general')
  const [tone, setTone] = useState('casual')
  const [format, setFormat] = useState('explainer')
  const [duration, setDuration] = useState(60)
  const [refText, setRefText] = useState('')
  const [refUrls, setRefUrls] = useState('')
  const [nVariants, setNVariants] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorDetail, setErrorDetail] = useState<unknown>(null)
  const [variants, setVariants] = useState<ScriptVariant[]>([])
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [progressSnapshot, setProgressSnapshot] = useState<ProgressSnapshot | null>(null)
  const [elapsedTick, setElapsedTick] = useState(0)
  const [timerStartedAtMs, setTimerStartedAtMs] = useState<number | null>(null)
  const hydratedProjectIdRef = useRef<string | null>(null)
  const draftPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resumeTaskRef = useRef<(taskId: string) => Promise<void>>(async () => {})
  const progressSnapshotRef = useRef<ProgressSnapshot | null>(null)
  const lastSseEventAtRef = useRef<number>(0)

  useEffect(() => {
    progressSnapshotRef.current = progressSnapshot
  }, [progressSnapshot])

  const setTimerStart = useCallback((startedAtMs: number | null) => {
    setTimerStartedAtMs(startedAtMs)
    setElapsedTick(tick => tick + 1)
  }, [])

  const ensureTaskTimer = useCallback((
    taskId: string,
    fallbackElapsedSeconds?: number,
    preferredStartedAtMs?: number,
  ) => {
    const storageKey = `script_agent_started_at_${taskId}`
    const stored = Number(sessionStorage.getItem(storageKey))
    const fallbackMs = Math.max(0, Number(fallbackElapsedSeconds || 0)) * 1000
    const startedAtMs = Number.isFinite(stored) && stored > 0
      ? stored
      : preferredStartedAtMs || Date.now() - fallbackMs

    sessionStorage.setItem(storageKey, String(startedAtMs))
    setTimerStart(startedAtMs)
  }, [setTimerStart])

  useEffect(() => {
    if (!projectId || hydratedProjectIdRef.current === projectId) return

    let cancelled = false
    ;(async () => {
      try {
        const project = await getProject(projectId)
        if (cancelled) return

        const draft = project.script_agent_draft || {}
        if (typeof draft.topic === 'string' && !topic) setTopic(draft.topic)
        if (typeof draft.tone === 'string') setTone(draft.tone)
        if (typeof draft.format === 'string') setFormat(draft.format)
        if (typeof draft.duration_seconds === 'number') setDuration(draft.duration_seconds)
        if (typeof draft.reference_text === 'string') setRefText(draft.reference_text)
        if (Array.isArray(draft.reference_urls)) setRefUrls(draft.reference_urls.join('\n'))
        if (typeof draft.n_variants === 'number') setNVariants(Math.min(3, Math.max(1, draft.n_variants)))

        const variantsFromProject = Array.isArray(project.script_variants) && project.script_variants.length > 0
        if (variantsFromProject && variants.length === 0) {
          const nextVariants = (project.script_variants as any[]).map(normalizePersistedVariant)
          setVariants(nextVariants)
          setSelectedIdx(nextVariants.length > 0 ? 0 : null)
        }

        if (project.script_agent_progress_snapshot && !progressSnapshot) {
          setProgressSnapshot(project.script_agent_progress_snapshot as ProgressSnapshot)
        }

        hydratedProjectIdRef.current = projectId

        // If a task was running when the user navigated away, reconnect to it
        if (project.script_agent_task_id && !variantsFromProject && !cancelled) {
          setLoading(true)
          void resumeTaskRef.current(project.script_agent_task_id)
        }
      } catch {
        // Ignore hydration failure and keep local interaction responsive.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [projectId, progressSnapshot, topic, variants.length])

  const persistIdeaDraft = useCallback(async () => {
    if (!projectId) return

    const urlList = refUrls
      .split('\n')
      .map(u => u.trim())
      .filter(Boolean)

    const hasMeaningfulDraft = Boolean(topic.trim() || refText.trim() || urlList.length > 0)
    if (!hasMeaningfulDraft && variants.length === 0 && !progressSnapshotRef.current) return

    try {
      await updateProject(projectId, {
        stage: 'idea',
        title: topic.trim() ? topic.trim().slice(0, 200) : null,
        script_agent_draft: {
          topic: topic.trim(),
          audience,
          tone,
          format,
          duration_seconds: duration,
          language: 'vi',
          reference_text: refText.trim() || null,
          reference_urls: urlList,
          n_variants: nVariants,
        },
        script_variants: variants.length > 0 ? variants : null,
        script_agent_progress_snapshot: progressSnapshotRef.current || null,
      })
    } catch {
      // Keep local flow running; persistence will retry on next edit.
    }
  }, [audience, duration, format, nVariants, projectId, refText, refUrls, tone, topic, variants])

  useEffect(() => {
    if (draftPersistTimerRef.current) {
      clearTimeout(draftPersistTimerRef.current)
    }

    draftPersistTimerRef.current = setTimeout(() => {
      void persistIdeaDraft()
    }, 700)

    return () => {
      if (draftPersistTimerRef.current) {
        clearTimeout(draftPersistTimerRef.current)
      }
    }
  }, [persistIdeaDraft])

  useEffect(() => {
    return () => {
      // Flush the latest draft when leaving the page so recent typing is not lost.
      void persistIdeaDraft()
    }
  }, [persistIdeaDraft])

  const progressPercent = useMemo(() => {
    if (!progressSnapshot || progressSnapshot.step_count <= 0) return 0
    return Math.round((progressSnapshot.step_index / progressSnapshot.step_count) * 100)
  }, [progressSnapshot])

  useEffect(() => {
    if (!loading || !timerStartedAtMs) return
    const timerId = window.setInterval(() => {
      setElapsedTick(tick => tick + 1)
    }, 1000)
    return () => window.clearInterval(timerId)
  }, [loading, timerStartedAtMs])

  const liveElapsedSeconds = useMemo(() => {
    if (timerStartedAtMs) {
      return Math.max(0, Math.floor((Date.now() - timerStartedAtMs) / 1000))
    }
    return typeof progressSnapshot?.elapsed_seconds === 'number'
      ? progressSnapshot.elapsed_seconds
      : undefined
  }, [elapsedTick, progressSnapshot, timerStartedAtMs])

  // Reconnect to an in-progress or completed task after page reload/navigation.
  // Called from the hydration effect; stored in a ref so the effect closure stays fresh.
  const resumeTask = useCallback(async (taskId: string) => {
    if (!projectId) { setLoading(false); return }
    let streamHandle: { close: () => void } | null = null
    try {
      const initial = await api.get(`/script-agent/${taskId}`)
      if (initial.progress_snapshot) {
        setProgressSnapshot(initial.progress_snapshot)
        ensureTaskTimer(taskId, initial.progress_snapshot.elapsed_seconds)
      } else {
        ensureTaskTimer(taskId)
      }

      if (initial.status === 'done') {
        const vs: ScriptVariant[] = (initial.result?.variants || []).map(normalizePersistedVariant)
        setVariants(vs)
        if (vs.length > 0) {
          setSelectedIdx(0)
          void updateProject(projectId, { stage: 'idea', script_variants: vs })
        }
        return
      }
      if (initial.status === 'error') {
        setError(SYSTEM_ERROR_MESSAGE)
        setErrorDetail(initial.error || 'Lỗi khi tạo kịch bản')
        return
      }

      let terminalStatus: 'done' | 'error' | null = null
      let terminalError: string | null = null
      try {
        streamHandle = connectScriptAgentSSE(
          taskId,
          (event) => {
            lastSseEventAtRef.current = Date.now()
            if (event.progress_snapshot) {
              setProgressSnapshot(event.progress_snapshot)
              ensureTaskTimer(taskId, event.progress_snapshot.elapsed_seconds)
            }
            if (event.status === 'done') {
              const vs: ScriptVariant[] = (event.result?.variants || event.variants || []).map(normalizePersistedVariant)
              setVariants(vs)
              if (vs.length > 0) {
                setSelectedIdx(0)
                void updateProject(projectId, { stage: 'idea', script_variants: vs })
              }
              terminalStatus = 'done'
            }
            if (event.status === 'error') {
              terminalStatus = 'error'
              terminalError = event.error || 'Lỗi khi tạo kịch bản'
            }
          },
          () => {},
        )
      } catch {}

      const MAX_POLLS = 150
      for (let i = 0; i < MAX_POLLS; i++) {
        if (terminalStatus === 'done') return
        if (terminalStatus === 'error') throw new Error(terminalError || 'Lỗi khi tạo kịch bản')
        await new Promise(r => setTimeout(r, 2000))
        if (terminalStatus === 'done') return
        if (terminalStatus === 'error') throw new Error(terminalError || 'Lỗi khi tạo kịch bản')
        // Skip GET if SSE fired within the last 5s — polling is only a fallback
        if (Date.now() - lastSseEventAtRef.current < 5000) continue
        const poll = await api.get(`/script-agent/${taskId}`)
        if (poll.progress_snapshot) {
          setProgressSnapshot(poll.progress_snapshot)
          ensureTaskTimer(taskId, poll.progress_snapshot.elapsed_seconds)
        }
        if (poll.status === 'done') {
          const vs: ScriptVariant[] = (poll.result?.variants || []).map(normalizePersistedVariant)
          setVariants(vs)
          if (vs.length > 0) {
            setSelectedIdx(0)
            void updateProject(projectId, { stage: 'idea', script_variants: vs })
          }
          return
        }
        if (poll.status === 'error') throw new Error(poll.error || 'Lỗi khi tạo kịch bản')
      }
      throw new Error('Quá thời gian chờ — vui lòng thử lại')
    } catch (e: any) {
      setError(toUserErrorMessage(e.message || 'Không thể khôi phục kết quả'))
      setErrorDetail(e)
    } finally {
      streamHandle?.close()
      setLoading(false)
    }
  }, [ensureTaskTimer, projectId])
  resumeTaskRef.current = resumeTask

  const handleGenerate = async () => {
    if (!topic.trim()) return
    if (!projectId) {
      setError('Dự án chưa sẵn sàng. Vui lòng tạo dự án mới trước khi tiếp tục.')
      return
    }
    setLoading(true)
    setError(null)
    setErrorDetail(null)
    setVariants([])
    setSelectedIdx(null)
    setProgressSnapshot(null)
    const requestStartedAtMs = Date.now()
    setTimerStart(requestStartedAtMs)
    let streamHandle: { close: () => void } | null = null

    try {
      const urlList = refUrls
        .split('\n')
        .map(u => u.trim())
        .filter(u => u.startsWith('http'))

      // Enqueue task — backend returns task_id immediately
      const {
        task_id,
        status: initialStatus,
        result: immediateResult,
        progress_snapshot: initialProgressSnapshot,
      } = await api.post('/script-agent', {
        project_id: projectId,
        topic: topic.trim(),
        audience,
        tone,
        format,
        duration_seconds: duration,
        language: 'vi',
        reference_text: refText.trim() || null,
        reference_urls: urlList,
        n_variants: nVariants,
      })
      ensureTaskTimer(task_id, initialProgressSnapshot?.elapsed_seconds, requestStartedAtMs)
      if (initialProgressSnapshot) setProgressSnapshot(initialProgressSnapshot)
      void updateProject(projectId, {
        stage: 'idea',
        script_agent_task_id: task_id,
        script_agent_draft: {
          topic: topic.trim(),
          audience,
          tone,
          format,
          duration_seconds: duration,
          language: 'vi',
          reference_text: refText.trim() || null,
          reference_urls: urlList,
          n_variants: nVariants,
        },
        script_agent_progress_snapshot: initialProgressSnapshot || null,
      })

      // If Redis was unavailable backend ran synchronously and returned result directly
      if (initialStatus === 'done' && immediateResult) {
        setVariants(immediateResult.variants || [])
        if ((immediateResult.variants || []).length > 0) setSelectedIdx(0)
        void updateProject(projectId, {
          stage: 'idea',
          script_variants: immediateResult.variants || [],
          script_agent_progress_snapshot: initialProgressSnapshot || null,
        })
        return
      }

      let terminalStatus: 'done' | 'error' | null = null
      let terminalError: string | null = null

      try {
        streamHandle = connectScriptAgentSSE(
          task_id,
          (event) => {
            lastSseEventAtRef.current = Date.now()
            if (event.progress_snapshot) {
              setProgressSnapshot(event.progress_snapshot)
              ensureTaskTimer(task_id, event.progress_snapshot.elapsed_seconds)
            }

            if (event.status === 'done') {
              const sseVariants = event.result?.variants || event.variants || []
              setVariants(sseVariants)
              if (sseVariants.length > 0) setSelectedIdx(0)
              terminalStatus = 'done'
              return
            }

            if (event.status === 'error') {
              terminalStatus = 'error'
              terminalError = event.error || 'Lỗi khi tạo kịch bản'
            }
          },
          () => {
            // Polling loop below will continue as transport fallback.
          },
        )
      } catch {
        // EventSource unsupported or blocked; fallback polling below.
      }

      // Poll until done or error (max 5 minutes, every 2 seconds)
      const MAX_POLLS = 150
      for (let i = 0; i < MAX_POLLS; i++) {
        if (terminalStatus === 'done') return
        if (terminalStatus === 'error') throw new Error(terminalError || 'Lỗi khi tạo kịch bản')

        await new Promise(r => setTimeout(r, 2000))

        if (terminalStatus === 'done') return
        if (terminalStatus === 'error') throw new Error(terminalError || 'Lỗi khi tạo kịch bản')

        // Skip GET if SSE fired within the last 5s — polling is only a fallback
        if (Date.now() - lastSseEventAtRef.current < 5000) continue

        const poll = await api.get(`/script-agent/${task_id}`)
        if (poll.progress_snapshot) {
          setProgressSnapshot(poll.progress_snapshot)
          ensureTaskTimer(task_id, poll.progress_snapshot.elapsed_seconds)
        }
        if (poll.status === 'done') {
          setVariants(poll.result?.variants || [])
          if ((poll.result?.variants || []).length > 0) setSelectedIdx(0)
          return
        }
        if (poll.status === 'error') {
          throw new Error(poll.error || 'Lỗi khi tạo kịch bản')
        }
      }
      throw new Error('Quá thời gian chờ — vui lòng thử lại')
    } catch (e: any) {
      setError(toUserErrorMessage(e.message || 'Không thể tạo kịch bản'))
      setErrorDetail(e)
    } finally {
      streamHandle?.close()
      setLoading(false)
    }
  }

  const handleUseScript = () => {
    if (selectedIdx === null || !variants[selectedIdx]) return
    const v = variants[selectedIdx]
    if (projectId) {
      void updateProject(projectId, {
        stage: 'config',
        chosen_script: v.full_script,
        script_variants: variants,
      })
    }
    onScriptChosen(v.full_script, v.title)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2.5 rounded-xl">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-base">AI Viết Kịch Bản</h3>
            <p className="text-xs text-muted-foreground">Chỉ cần nhập chủ đề — AI tự viết nội dung</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel} className="text-muted-foreground">
          Hủy
        </Button>
      </div>

      {/* Form */}
      {variants.length === 0 && (
        <div className="space-y-4">
          {/* Topic */}
          <div className="space-y-1.5">
            <Label htmlFor="topic">Chủ đề video <span className="text-destructive">*</span></Label>
            <Input
              id="topic"
              placeholder="vd: AI trong giáo dục 2026, Cách học tiếng Anh nhanh..."
              value={topic}
              onChange={e => setTopic(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !loading && topic.trim() && handleGenerate()}
            />
          </div>

          {/* Tone chips */}
          <div className="space-y-1.5">
            <Label>Giọng điệu</Label>
            <div className="flex flex-wrap gap-2">
              {TONES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setTone(t.value)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                    tone === t.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border hover:border-primary/50',
                  )}
                >
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Format */}
          <div className="space-y-1.5">
            <Label>Định dạng</Label>
            <div className="flex flex-wrap gap-2">
              {FORMATS.map(f => (
                <button
                  key={f.value}
                  onClick={() => setFormat(f.value)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                    format === f.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border hover:border-primary/50',
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Duration + variants row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Clock className="w-3 h-3" /> Thời lượng: <span className="text-primary font-mono">{duration}s</span>
              </Label>
              <Slider
                min={15} max={120} step={15}
                value={[duration]}
                onValueChange={([v]) => setDuration(v)}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>15s</span><span>60s</span><span>120s</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" /> Số phiên bản
              </Label>
              <div className="flex gap-2">
                {[1, 2, 3].map(n => (
                  <button
                    key={n}
                    onClick={() => setNVariants(n)}
                    className={cn(
                      'w-10 h-10 rounded-lg text-sm font-medium border transition-all',
                      nVariants === n
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border hover:border-primary/50',
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Reference (collapsible) */}
          <details className="group">
            <summary className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer hover:text-foreground select-none">
              <ChevronRight className="w-3 h-3 transition-transform group-open:rotate-90" />
              Thêm tài liệu tham khảo (tùy chọn)
            </summary>
            <div className="pt-3 space-y-3">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs">
                  <AlignLeft className="w-3 h-3" /> Dán nội dung tham khảo
                </Label>
                <Textarea
                  rows={3}
                  placeholder="Dán văn bản, số liệu, trích dẫn..."
                  value={refText}
                  onChange={e => setRefText(e.target.value)}
                  className="text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs">
                  <Link className="w-3 h-3" /> Liên kết (mỗi dòng 1 link, tối đa 3)
                </Label>
                <Textarea
                  rows={2}
                  placeholder="https://..."
                  value={refUrls}
                  onChange={e => setRefUrls(e.target.value)}
                  className="text-xs font-mono"
                />
              </div>
            </div>
          </details>

          {error && (
            <div className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-md flex flex-wrap items-center justify-between gap-2">
              <span>{error}</span>
              {error === SYSTEM_ERROR_MESSAGE && (
                <SystemErrorReportButton
                  source="script_agent"
                  detail={errorDetail}
                  className="border-destructive/30 text-destructive hover:bg-destructive/10"
                />
              )}
            </div>
          )}

          {loading && progressSnapshot && (
            <Card className="border border-primary/15 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>Tiến độ tạo kịch bản</span>
                  <span className="font-mono text-primary">{progressSnapshot.step_index}/{progressSnapshot.step_count}</span>
                </CardTitle>
                <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden mt-1">
                  <div
                    className="h-full bg-primary transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground">Bước hiện tại</p>
                  <p className="text-sm font-medium">{progressSnapshot.current_step}</p>
                  {progressSnapshot.active_tool && (
                    <Badge variant="secondary" className="mt-2 gap-1.5">
                      <Wrench className="w-3 h-3" /> Công cụ đang dùng: {progressSnapshot.active_tool}
                    </Badge>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Đã chạy: {formatSeconds(liveElapsedSeconds)}
                  </p>
                </div>

                <div className="space-y-1">
                  {progressSnapshot.execution_plan.map((step) => (
                    <div
                      key={step.key}
                      className={cn(
                        'flex items-center gap-2 p-2 rounded-md text-xs',
                        step.status === 'active' && 'bg-primary/10',
                        step.status === 'error' && 'bg-destructive/10 text-destructive',
                        step.status === 'done' && 'opacity-65',
                        step.status === 'pending' && 'opacity-40',
                      )}
                    >
                      {step.status === 'done' && <CircleCheck className="w-3.5 h-3.5 text-green-500" />}
                      {step.status === 'active' && <LoaderCircle className="w-3.5 h-3.5 text-primary animate-spin" />}
                      {step.status === 'error' && <CircleAlert className="w-3.5 h-3.5 text-destructive" />}
                      {step.status === 'pending' && <Circle className="w-3.5 h-3.5 text-muted-foreground" />}
                      <span>{step.label}</span>
                    </div>
                  ))}
                </div>

                {progressSnapshot.intermediate_results.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Kết quả trung gian</p>
                    {progressSnapshot.intermediate_results.map((item, idx) => (
                      <p key={`${item}-${idx}`} className="text-xs text-muted-foreground">
                        {item}
                      </p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Button
            className="w-full gap-2"
            onClick={handleGenerate}
            disabled={!topic.trim() || loading}
          >
            {loading
              ? <><LoaderCircle className="w-4 h-4 animate-spin" /> Đang tạo kịch bản...</>
              : <><Sparkles className="w-4 h-4" /> Tạo kịch bản với AI</>
            }
          </Button>
        </div>
      )}

      {/* Variants */}
      {variants.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Chọn phiên bản kịch bản</p>
            <Button
              variant="ghost" size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => { setVariants([]); setSelectedIdx(null) }}
            >
              Tạo lại
            </Button>
          </div>

          {variants.map((v, i) => (
            <Card
              key={i}
              onClick={() => setSelectedIdx(i)}
              className={cn(
                'cursor-pointer transition-all border-2',
                selectedIdx === i
                  ? 'border-primary bg-primary/5'
                  : 'border-transparent hover:border-primary/30',
              )}
            >
              <CardHeader className="py-3 px-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    {selectedIdx === i
                      ? <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                      : <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/40 flex-shrink-0 mt-0.5" />
                    }
                    <div className="min-w-0">
                      <CardTitle className="text-sm truncate">{v.title || `Phiên bản ${i + 1}`}</CardTitle>
                      <CardDescription className="text-xs mt-0.5 flex items-center gap-2">
                        <Clock className="w-3 h-3" /> ~{v.estimated_duration}s
                        {v.hashtags?.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Hash className="w-3 h-3" />
                            {v.hashtags.slice(0, 3).join(' ')}
                          </span>
                        )}
                      </CardDescription>
                    </div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); setExpanded(expanded === i ? null : i) }}
                    className="text-[10px] text-muted-foreground hover:text-foreground flex-shrink-0"
                  >
                    {expanded === i ? 'Thu gọn' : 'Xem trước'}
                  </button>
                </div>
              </CardHeader>

              {expanded === i && (
                <CardContent className="px-4 pb-3 pt-0 space-y-2">
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground mb-1">Mở đầu</p>
                    <p className="text-xs bg-muted/50 px-2 py-1.5 rounded italic">{v.hook}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground mb-1">Nội dung</p>
                    <p className="text-xs text-muted-foreground line-clamp-4">{v.body}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground mb-1">Kêu gọi hành động</p>
                    <p className="text-xs bg-primary/10 px-2 py-1.5 rounded">{v.cta}</p>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}

          <Button
            className="w-full gap-2"
            onClick={handleUseScript}
            disabled={selectedIdx === null}
          >
            Dùng bản này <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
