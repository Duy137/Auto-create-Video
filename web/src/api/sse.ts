/**
 * SSE (Server-Sent Events) client for pipeline progress.
 */

import { getToken } from './client';

export interface SSEEvent {
  event: 'progress' | 'review_ready' | 'done' | 'error';
  step?: string;
  progress?: number;
  message?: string;
  props?: any;
  download_url?: string;
  fatal?: boolean;
}

/**
 * Connect to SSE progress stream for a job.
 */
export function connectSSE(
  jobId: string, 
  onEvent: (event: SSEEvent) => void, 
  onError: (error: Error) => void = () => {}
) {
  const token = getToken();
  if (!token) {
    onError(new Error('No auth token'));
    return { close: () => {} };
  }

  const url = `/api/jobs/${jobId}/progress?token=${encodeURIComponent(token)}`;
  const eventSource = new EventSource(url);

  eventSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data) as SSEEvent;
      onEvent(data);

      // Auto-close on terminal events
      if (data.event === 'done' || (data.event === 'error' && data.fatal)) {
        eventSource.close();
      }
    } catch (err) {
      console.warn('SSE parse error:', err, e.data);
    }
  };

  eventSource.onerror = () => {
    if (eventSource.readyState === EventSource.CLOSED) {
      onError(new Error('SSE connection closed'));
    }
  };

  return {
    close: () => {
      eventSource.close();
    },
  };
}
