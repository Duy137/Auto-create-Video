export interface ComparisonSide {
  label: string
  points: string[]
  sentiment?: string
}

export interface TimelineEvent {
  label: string
  title: string
  description?: string
}

export interface Scene {
  scene_type?: string | null
  narration: string
  visual_description?: string | null
  start_ms: number
  end_ms: number
  media_url?: string | null
  media_type?: string | null
  poster_url?: string | null
  _preview_url?: string | null
  transition?: string | null
  image_query?: string | null
  video_query?: string | null
  card_items?: Array<{ icon: string; title: string; subtitle: string }> | null
  stats?: Array<{ label: string; value: string; color: string }> | null
  diagram_spec?: Record<string, any> | null
  comparison_sides?: ComparisonSide[] | null
  timeline_events?: TimelineEvent[] | null
  story_beats?: Array<{ text: string; emoji: string; start_ms: number; end_ms: number }> | null
  audit?: {
    passed?: boolean
    signals?: string[]
    confidence?: number
    min_confidence?: number
    suggested_fallback?: string | null
    rule_details?: Record<string, any> | null
  } | null
  media_layout?: 'cinema' | 'fullscreen' | 'fit' | null
  layout?: string | null
  _alt_data?: Record<string, Record<string, any>> | null
}

export interface VideoProps {
  scenes: Scene[]
  color_palette?: Record<string, string>
}

export interface ReviewViewProps {
  jobId: string
  videoProps: VideoProps
  selectedSceneIndex: number
  onSelectScene: (index: number) => void
  onRenderStart: () => void
  onBackToSetup: () => void
  onPropsUpdate: (props: VideoProps) => void
}
