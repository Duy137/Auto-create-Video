/**
 * SSE (Server-Sent Events) client for pipeline progress.
 */



export interface AgentTraceEvent {
  agent_name: string;
  action: string;
  thought?: string;
  result?: string;
  success: boolean;
  tokens_used: number;
  duration_ms: number;
}

export interface ScriptVariant {
  title: string;
  hook: string;
  body: string;
  cta: string;
  full_script: string;
  estimated_duration: number;
  hashtags: string[];
}

export interface ProgressPlanStep {
  key: string;
  label: string;
  status: 'done' | 'active' | 'pending' | 'error';
}

export interface ProgressSnapshot {
  phase: string;
  current_step: string;
  execution_plan: ProgressPlanStep[];
  active_tool?: string;
  intermediate_results: string[];
  step_index: number;
  step_count: number;
  elapsed_seconds: number;
  eta_seconds?: number;
  status: 'pending' | 'running' | 'done' | 'error' | 'needs_human';
}

export interface SSEEvent {
  event: 'progress' | 'review_ready' | 'done' | 'error' | 'agent_trace' | 'needs_human';
  step?: string;
  progress?: number;
  message?: string;
  props?: any;
  download_url?: string;
  fatal?: boolean;
  // Agentic extras
  agent_trace?: AgentTraceEvent;
  needs_human?: boolean;
  human_checkpoint_type?: string;
  human_question?: string;
  generated_scripts?: ScriptVariant[];
  progress_snapshot?: ProgressSnapshot;
}

export interface ScriptAgentTaskEvent {
  task_id: string;
  status: 'pending' | 'running' | 'done' | 'error';
  message?: string;
  progress?: number;
  variants?: ScriptVariant[];
  progress_snapshot?: ProgressSnapshot;
  result?: {
    variants: ScriptVariant[];
    job_id?: string | null;
  };
  error?: string;
}

/**
 * Connect to SSE progress stream for a job.
 */
export function connectSSE(
  jobId: string, 
  onEvent: (event: SSEEvent) => void, 
  onError: (error: Error) => void = () => {}
) {
  const url = `/api/jobs/${jobId}/progress`;
  const eventSource = new EventSource(url, {
    withCredentials: true,
  });

  eventSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data) as SSEEvent;
      onEvent(data);

      // Auto-close on terminal events
      if (data.event === 'done' || (data.event === 'error' && data.fatal) || data.event === 'needs_human') {
        eventSource.close();
      }
    } catch (err) {
      console.warn('SSE parse error:', err, e.data);
    }
  };

  eventSource.onerror = () => {
    if (eventSource.readyState === EventSource.CLOSED) {
      onError(new Error('Kết nối SSE đã đóng'));
    }
  };

  return {
    close: () => {
      eventSource.close();
    },
  };
}

/**
 * Connect to task-scoped SSE stream for ScriptAgent progress.
 */
export function connectScriptAgentSSE(
  taskId: string,
  onEvent: (event: ScriptAgentTaskEvent) => void,
  onError: (error: Error) => void = () => {}
) {
  const url = `/api/script-agent/${taskId}/stream`
  const eventSource = new EventSource(url, {
    withCredentials: true,
  })

  eventSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data) as ScriptAgentTaskEvent
      onEvent(data)

      if (data.status === 'done' || data.status === 'error') {
        eventSource.close()
      }
    } catch (err) {
      console.warn('ScriptAgent SSE parse error:', err, e.data)
    }
  }

  eventSource.onerror = () => {
    if (eventSource.readyState === EventSource.CLOSED) {
      onError(new Error('Kết nối SSE ScriptAgent đã đóng'))
    }
  }

  return {
    close: () => {
      eventSource.close()
    },
  }
}
