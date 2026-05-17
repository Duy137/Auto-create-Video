/**
 * API client with JWT auth for AutoClip backend.
 */

const API_BASE = '/api';
export const SYSTEM_ERROR_MESSAGE = 'Lỗi hệ thống';

const TECHNICAL_ERROR_PATTERNS = [
  /remotion/i,
  /traceback/i,
  /node_modules/i,
  /localhost:\d+/i,
  /appdata[\\/]/i,
  /desktop[\\/]/i,
  /received a status code/i,
  /error while downloading/i,
  /render failed/i,
  /could not be found/i,
  /file not found/i,
  /\bHTTP\s+5\d\d\b/i,
  /\(\s*5\d\d\s*\)/,
  /\bat\s+[\w.<>]+.*\(.+:\d+:\d+\)/i,
  /[a-z]:[\\/]/i,
];

export function isTechnicalErrorMessage(message: unknown): boolean {
  if (typeof message !== 'string') return false;
  return TECHNICAL_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export function toUserErrorMessage(message: unknown, status?: number): string {
  const text = typeof message === 'string' && message.trim()
    ? message.trim()
    : SYSTEM_ERROR_MESSAGE;
  if ((typeof status === 'number' && status >= 500) || isTechnicalErrorMessage(text)) {
    return SYSTEM_ERROR_MESSAGE;
  }
  return text;
}

class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data: any = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Make an authenticated API request.
 */
async function apiRequest<T = any>(
  method: string,
  path: string,
  body: any = null,
  _isRetry = false,
): Promise<T> {
  const url = `${API_BASE}${path}`;

  const headers: Record<string, string> = {};
  const options: RequestInit = {
    method,
    headers,
    credentials: 'include', // Send cookies automatically
  };

  if (body !== null) {
    if (body instanceof FormData) {
      options.body = body;
    } else {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
  }

  const res = await fetch(url, options);

  // Auto-refresh on 401 (only retry once, skip for login/me/refresh endpoints)
  const isAuthEndpoint = path.includes('/auth/login') || path.includes('/auth/me') || path.includes('/auth/refresh');
  if (res.status === 401 && !_isRetry && !isAuthEndpoint) {
    const refreshOk = await tryRefresh();
    if (refreshOk) {
      return apiRequest<T>(method, path, body, true);
    }
    // Refresh failed or no refresh token -> session expired
    if (!window.location.pathname.includes('/login')) {
      window.location.href = '/login';
    }
    throw new ApiError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 401);
  }

  if (res.status === 204) {
    return null as any;
  }

  let data;
  try {
    data = await res.json();
  } catch {
    if (!res.ok) {
      throw new ApiError(`Yêu cầu thất bại với mã trạng thái ${res.status}`, res.status);
    }
    return null as any;
  }

  if (!res.ok) {
    const detail = data?.detail || data?.message || `Yêu cầu thất bại (${res.status})`;
    throw new ApiError(toUserErrorMessage(detail, res.status), res.status, data);
  }

  return data as T;
}

/**
 * Attempt to refresh the access token using the refresh cookie.
 */
export async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const api = {
  get: <T = any>(path: string) => apiRequest<T>('GET', path),
  post: <T = any>(path: string, body: any) => apiRequest<T>('POST', path, body),
  patch: <T = any>(path: string, body: any) => apiRequest<T>('PATCH', path, body),
  delete: <T = any>(path: string) => apiRequest<T>('DELETE', path),
  upload: <T = any>(path: string, formData: FormData) => apiRequest<T>('POST', path, formData),
};

export interface TemplateData {
  id: number;
  slug: string;
  name: string;
  description?: string | null;
  category: string;
  settings: Record<string, any>;
  example_script?: string | null;
  thumbnail_url?: string | null;
  is_system: boolean;
  is_active: boolean;
}

export function getTemplates() {
  return api.get<{ templates: TemplateData[] }>("/templates");
}

export function getTemplate(slug: string) {
  return api.get<TemplateData>(`/templates/${encodeURIComponent(slug)}`);
}

export interface BgmTrack {
  id: string;
  name: string;
  mood: string;
  bpm: number;
  duration_sec: number;
  preview_url: string;
}

export function getBgmLibrary() {
  return api.get<{ tracks: BgmTrack[] }>("/bgm/library");
}

export function listJobs(page = 1, perPage = 10, status?: string) {
  const query = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
  });
  if (status) query.set("status", status);
  return api.get<{ jobs: any[]; total: number }>(`/jobs?${query.toString()}`);
}

export function deleteJob(jobId: string) {
  return api.delete(`/jobs/${jobId}`);
}

export interface ErrorReportPayload {
  source: string;
  job_id?: string | null;
  description: string;
  detail?: any;
  page_url?: string | null;
}

export function reportErrorToAdmin(payload: ErrorReportPayload) {
  return api.post<{ ok: boolean }>('/error-reports', payload);
}

export interface AdminErrorReportData {
  id: number;
  user_id?: number | null;
  username?: string | null;
  action: string;
  target_type?: string | null;
  target_id?: string | null;
  details: Record<string, any>;
  ip_address?: string | null;
  created_at: string;
}

export interface AdminErrorReportListData {
  reports: AdminErrorReportData[];
  total: number;
  page: number;
  per_page: number;
}

export function listAdminErrorReports(page = 1, perPage = 20) {
  const query = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
  });
  return api.get<AdminErrorReportListData>(`/admin/error-reports?${query.toString()}`);
}

export function getAdminErrorReport(reportId: number | string) {
  return api.get<AdminErrorReportData>(`/admin/error-reports/${encodeURIComponent(String(reportId))}`);
}

export function updateAdminErrorReportFixed(reportId: number | string, isFixed: boolean) {
  return api.patch<AdminErrorReportData>(
    `/admin/error-reports/${encodeURIComponent(String(reportId))}/fixed`,
    { is_fixed: isFixed },
  );
}

export interface NotificationData {
  id: number;
  user_id?: number;
  title: string;
  message?: string | null;
  type: string;
  is_read: boolean;
  action_url?: string | null;
  created_at: string;
}

export interface NotificationListData {
  notifications: NotificationData[];
  unread_count: number;
}

export function getNotifications() {
  return api.get<NotificationListData>('/notifications');
}

export function markNotificationRead(notificationId: number) {
  return api.patch<{ success: boolean }>(`/notifications/${notificationId}/read`, {});
}

export function markAllNotificationsRead() {
  return api.post<{ success: boolean }>('/notifications/read-all', {});
}

export function deleteAllNotifications() {
  return api.delete<{ success: boolean }>('/notifications');
}

export interface ShareLinkData {
  share_token: string;
  share_url: string;
  api_url: string;
}

export type ProjectStage = 'idea' | 'config' | 'processing' | 'review' | 'rendering' | 'result' | 'failed';

export interface ProjectData {
  id: string;
  user_id: number;
  title?: string | null;
  stage: ProjectStage;
  config_draft?: {
    text?: string;
    settings?: Record<string, any>;
  } | null;
  script_agent_draft?: Record<string, any> | null;
  script_variants?: Array<Record<string, any>> | null;
  chosen_script?: string | null;
  script_agent_task_id?: string | null;
  script_agent_progress_snapshot?: Record<string, any> | null;
  active_job_id?: string | null;
  last_known_props?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectPayload {
  title?: string | null;
  stage?: ProjectStage;
  config_draft?: Record<string, any> | null;
  script_agent_draft?: Record<string, any> | null;
  script_variants?: Array<Record<string, any>> | null;
  chosen_script?: string | null;
  script_agent_task_id?: string | null;
  script_agent_progress_snapshot?: Record<string, any> | null;
}

export interface UpdateProjectPayload {
  title?: string | null;
  stage?: ProjectStage;
  config_draft?: Record<string, any> | null;
  script_agent_draft?: Record<string, any> | null;
  script_variants?: Array<Record<string, any>> | null;
  chosen_script?: string | null;
  script_agent_task_id?: string | null;
  script_agent_progress_snapshot?: Record<string, any> | null;
  active_job_id?: string | null;
  last_known_props?: Record<string, any> | null;
}

export function createProject(payload: CreateProjectPayload = {}) {
  return api.post<ProjectData>('/projects', payload);
}

export function listProjects(
  page = 1,
  perPage = 20,
  options?: {
    activeOnly?: boolean;
    stages?: ProjectStage[];
  },
) {
  const query = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
  });
  if (options?.activeOnly) {
    query.set('active_only', 'true');
  }
  if (options?.stages && options.stages.length > 0) {
    query.set('stages', options.stages.join(','));
  }
  return api.get<{ projects: ProjectData[]; total: number }>(`/projects?${query.toString()}`);
}

export async function getLatestActiveProject() {
  const data = await listProjects(1, 1, { activeOnly: true });
  return data.projects[0] || null;
}

export function getProject(projectId: string) {
  return api.get<ProjectData>(`/projects/${projectId}`);
}

export function updateProject(projectId: string, payload: UpdateProjectPayload) {
  return api.patch<ProjectData>(`/projects/${projectId}`, payload);
}

export function deleteProject(projectId: string) {
  return api.delete(`/projects/${projectId}`);
}

export interface PublicShareData {
  job_id: string;
  title: string;
  status: string;
  video_url: string;
  thumbnail_url?: string | null;
  share_views: number;
  created_at: string;
}

export function createShareLink(jobId: string) {
  return api.post<ShareLinkData>(`/jobs/${jobId}/share`, {});
}

export function deleteShareLink(jobId: string) {
  return api.delete(`/jobs/${jobId}/share`);
}

export async function getPublicShare(token: string): Promise<PublicShareData> {
  const res = await fetch(`/api/share/${encodeURIComponent(token)}`);
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    if (!res.ok) {
      throw new ApiError(`Yêu cầu thất bại (${res.status})`, res.status);
    }
  }

  if (!res.ok) {
    const detail = data?.detail || `Yêu cầu thất bại (${res.status})`;
    throw new ApiError(detail, res.status, data);
  }

  return data as PublicShareData;
}
