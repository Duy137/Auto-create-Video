export const TRANSITION_OPTIONS = ['fade', 'slide', 'wipe', 'zoom', 'flip', 'clock-wipe', 'iris', 'none']

export const TRANSITION_LABELS: Record<string, string> = {
  fade: 'Mờ dần',
  slide: 'Trượt',
  wipe: 'Lau',
  zoom: 'Phóng to',
  flip: 'Lật',
  'clock-wipe': 'Đồng hồ',
  iris: 'Mống mắt',
  none: 'Không',
}

// Only these scene types use external stock media (Pexels).
// Other types render gradient/animated backgrounds — no media needed.
export const NEEDS_MEDIA = new Set(['stock_background', 'media_showcase', 'title_card', 'cryptovn101_news'])

export const SCENE_TYPE_LABELS: Record<string, string> = {
  title_card: 'Thẻ tiêu đề',
  stock_background: 'Video nền',
  info_card: 'Thẻ thông tin',
  stats_highlight: 'Số liệu',
  diagram: 'Sơ đồ',
  emoji_grid: 'Lưới biểu tượng',
  comparison: 'So sánh',
  media_showcase: 'Trình chiếu media',
  timeline: 'Dòng thời gian',
  story_beats: 'Cảnh emoji động',
  cryptovn101_news: 'Bản tin (CryptoVN101)',
}

/** Get browser-accessible URL for scene media preview */
export function getPreviewUrl(scene: { media_url?: string | null; [key: string]: any }): string | null {
  const url = scene.media_url
  if (!url) return null
  if (url.startsWith('http') || url.startsWith('/api/')) return url
  // Relative asset path (e.g. "assets/jobid/scene_1.mp4") → serve via API
  if (url.startsWith('assets/')) return `/api/demo/${url}`
  // Local absolute path (e.g. "D:\...\output\jobid\media\scene.mp4") → serve via API
  const normalized = url.replace(/\\/g, '/')
  const outputIdx = normalized.indexOf('output/')
  if (outputIdx >= 0) {
    const relPath = normalized.substring(outputIdx + 'output/'.length)
    return `/api/outputs/${relPath}`
  }
  // Fallback: check _preview_url
  return scene._preview_url || null
}

export function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ')
}
