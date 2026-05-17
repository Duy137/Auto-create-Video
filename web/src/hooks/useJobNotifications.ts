import { useEffect, useRef } from 'react'

export interface JobNotificationEvent {
  event: 'job_done' | 'job_review_ready' | 'job_failed' | 'job_rendering'
  job_id: string
  title?: string
}

/**
 * Subscribe to user-level job completion events via SSE.
 * Fires onEvent when any of the user's jobs transitions to done/review_ready/failed.
 * Used by Dashboard and Admin pages for real-time auto-refresh.
 */
export function useJobNotifications(onEvent: (event: JobNotificationEvent) => void) {
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  useEffect(() => {
    let es: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let alive = true

    const connect = () => {
      if (!alive) return
      es = new EventSource('/api/jobs/stream', { withCredentials: true })

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data) as JobNotificationEvent
          if (['job_done', 'job_review_ready', 'job_failed', 'job_rendering'].includes(data.event)) {
            onEventRef.current(data)
          }
        } catch {}
      }

      es.onerror = () => {
        es?.close()
        es = null
        if (alive) {
          reconnectTimer = setTimeout(connect, 5000)
        }
      }
    }

    connect()

    return () => {
      alive = false
      if (reconnectTimer) clearTimeout(reconnectTimer)
      es?.close()
    }
  }, [])
}
