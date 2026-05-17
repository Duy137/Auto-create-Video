import { useState } from 'react'
import { AlertTriangle, Send } from 'lucide-react'
import { toast } from 'sonner'

import { reportErrorToAdmin, SYSTEM_ERROR_MESSAGE, toUserErrorMessage } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

type SystemErrorReportProps = {
  source: string
  jobId?: string | null
  detail?: unknown
  className?: string
}

type ErrorReportBoxProps = SystemErrorReportProps & {
  toastId: string | number
  onSubmitted?: () => void
}

function normalizeDetail(detail: unknown) {
  if (detail instanceof Error) {
    const errorDetail: Record<string, unknown> = {
      name: detail.name,
      message: detail.message,
      stack: detail.stack,
    }
    if ('status' in detail) errorDetail.status = (detail as { status?: unknown }).status
    if ('data' in detail) errorDetail.data = (detail as { data?: unknown }).data
    return errorDetail
  }
  return detail
}

function getErrorMessage(error: unknown, fallback = SYSTEM_ERROR_MESSAGE) {
  const status = typeof error === 'object' && error && 'status' in error
    ? Number((error as { status?: unknown }).status)
    : undefined
  const raw = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : typeof error === 'object' && error && 'message' in error
        ? String((error as { message?: unknown }).message || '')
        : fallback

  return toUserErrorMessage(raw || fallback, Number.isFinite(status) ? status : undefined)
}

function buildReportBoxId(source: string, jobId?: string | null, id?: string | number) {
  if (id !== undefined) return `${String(id)}-report-box`
  return `system-error-report-${source}-${jobId || 'page'}`
}

function SystemErrorReportBox({
  source,
  jobId,
  detail,
  toastId,
  onSubmitted,
}: ErrorReportBoxProps) {
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const trimmedDescription = description.trim()
  const canSubmit = trimmedDescription.length >= 3 && !submitting

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      await reportErrorToAdmin({
        source,
        job_id: jobId || null,
        description: trimmedDescription,
        detail: normalizeDetail(detail),
        page_url: window.location.href,
      })
      toast.dismiss(toastId)
      onSubmitted?.()
      toast.success('Đã gửi lỗi đến admin')
    } catch {
      toast.error('Không gửi được lỗi đến admin')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      className="w-[min(420px,calc(100vw-32px))] rounded-xl border bg-[var(--surface-0)] p-4 shadow-[var(--shadow-xl)]"
      style={{ borderColor: 'var(--border-subtle)' }}
      onSubmit={(event) => {
        event.preventDefault()
        void handleSubmit()
      }}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-600">
          <AlertTriangle size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-[var(--text-primary)]">Mô tả lỗi bạn gặp</h3>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
            Mô tả này sẽ được dùng làm tên lỗi để admin dễ nhận biết.
          </p>
        </div>
      </div>

      <Textarea
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Ví dụ: Không render được video sau khi đổi ảnh nền"
        className="mt-4 min-h-[104px] resize-none bg-[var(--surface-1)]"
        maxLength={300}
        autoFocus
        required
      />
      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-[var(--text-tertiary)]">
        <span>Nhập ít nhất 3 ký tự.</span>
        <span>{trimmedDescription.length}/300</span>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => toast.dismiss(toastId)}
          disabled={submitting}
        >
          Hủy
        </Button>
        <Button type="submit" className="btn-brand" disabled={!canSubmit}>
          <Send size={14} className="mr-1.5" />
          {submitting ? 'Đang gửi...' : 'Gửi lỗi'}
        </Button>
      </div>
    </form>
  )
}

function openSystemErrorReportBox({
  source,
  jobId,
  detail,
  id,
  onSubmitted,
}: SystemErrorReportProps & {
  id?: string | number
  onSubmitted?: () => void
}) {
  const boxId = buildReportBoxId(source, jobId, id)
  toast.custom(
    (toastId) => (
      <SystemErrorReportBox
        source={source}
        jobId={jobId}
        detail={detail}
        toastId={toastId}
        onSubmitted={onSubmitted}
      />
    ),
    { id: boxId, duration: Number.POSITIVE_INFINITY },
  )
}

export function showSystemErrorReportToast({
  source,
  jobId,
  detail,
  duration = 8000,
  id,
}: SystemErrorReportProps & { duration?: number; id?: string | number }) {
  toast.error(SYSTEM_ERROR_MESSAGE, {
    duration,
    id,
    action: {
      label: 'Gửi lỗi này đến admin',
      onClick: () => openSystemErrorReportBox({ source, jobId, detail, id }),
    },
  })
}

export function showErrorToast(
  error: unknown,
  {
    fallback = SYSTEM_ERROR_MESSAGE,
    prefix,
    source,
    jobId,
    duration,
    id,
  }: SystemErrorReportProps & {
    fallback?: string
    prefix?: string
    duration?: number
    id?: string | number
  },
) {
  const message = getErrorMessage(error, fallback)
  if (message === SYSTEM_ERROR_MESSAGE) {
    showSystemErrorReportToast({ source, jobId, detail: error, duration, id })
    return message
  }

  const visibleMessage = prefix && message !== prefix && message !== fallback
    ? `${prefix}: ${message}`
    : message
  toast.error(visibleMessage, { duration, id })
  return message
}

export function SystemErrorReportButton({
  source,
  jobId,
  detail,
  className,
}: SystemErrorReportProps) {
  const [sent, setSent] = useState(false)

  const handleReport = () => {
    if (sent) return
    openSystemErrorReportBox({
      source,
      jobId,
      detail,
      id: `button-${source}-${jobId || 'page'}`,
      onSubmitted: () => setSent(true),
    })
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      onClick={handleReport}
      disabled={sent}
    >
      {sent ? 'Đã gửi đến admin' : 'Gửi lỗi này đến admin'}
    </Button>
  )
}

export function SystemErrorPanel(props: SystemErrorReportProps) {
  return (
    <div
      className="rounded-[var(--radius-lg)] border p-4 flex flex-col gap-3"
      style={{
        borderColor: 'rgba(239,68,68,0.25)',
        background: 'rgba(239,68,68,0.06)',
      }}
    >
      <div className="text-sm font-semibold" style={{ color: 'var(--status-danger)' }}>
        {SYSTEM_ERROR_MESSAGE}
      </div>
      <div>
        <SystemErrorReportButton {...props} />
      </div>
    </div>
  )
}
