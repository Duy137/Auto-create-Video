import { Film, Play, Palette } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { Scene } from './types'

/** Visual mockup preview for non-stock scene types */
export function ScenePreviewMockup({ scene, palette }: { scene: Scene; palette: Record<string, string> }) {
  const bg = palette?.background || '#0f0f0f'
  const primary = palette?.primary || '#6366f1'
  const text = palette?.text || '#ffffff'

  switch (scene.scene_type) {
    case 'cryptovn101_news': {
      return (
        <div className="w-full h-full flex flex-col relative" style={{ background: bg }}>
          <div className="h-1/2 w-full opacity-30 bg-white/10" />
          <div className="h-1/2 w-full flex flex-col justify-end p-6" style={{ background: `linear-gradient(to top, ${bg}, transparent)` }}>
            <div className="w-10 h-1 mb-3" style={{ backgroundColor: primary }} />
            <div className="text-[10px] font-bold tracking-widest uppercase mb-1" style={{ color: primary }}>Brand Name</div>
            <div className="text-xl font-black leading-tight" style={{ color: text }}>{scene.narration?.slice(0, 40)}</div>
          </div>
        </div>
      )
    }

    case 'title_card': {
      const layout = scene.layout || 'standard'
      
      if (layout === 'news_intro') {
        return (
          <div className="w-full h-full flex flex-col relative" style={{ background: bg }}>
            <div className="h-1/2 w-full opacity-30 bg-white/10" />
            <div className="h-1/2 w-full flex flex-col justify-end p-6" style={{ background: `linear-gradient(to top, ${bg}, transparent)` }}>
              <div className="w-10 h-1 mb-3" style={{ backgroundColor: primary }} />
              <div className="text-[10px] font-bold tracking-widest uppercase mb-1" style={{ color: primary }}>Brand Name</div>
              <div className="text-xl font-black leading-tight" style={{ color: text }}>{scene.narration?.slice(0, 40)}</div>
            </div>
          </div>
        )
      }
      
      if (layout === 'educational') {
        return (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 gap-6" style={{ background: `linear-gradient(135deg, ${bg}, ${primary}10)` }}>
            <div className="w-24 h-24 rounded-full flex items-center justify-center bg-white/5 border border-white/10 backdrop-blur shadow-2xl">
              <span className="text-5xl">{(scene as any).emoji || '💡'}</span>
            </div>
            <div className="text-center space-y-2">
              <div className="text-xs font-bold uppercase tracking-widest opacity-70" style={{ color: text }}>Did You Know?</div>
              <div className="text-lg font-bold leading-tight" style={{ color: text }}>{scene.narration?.slice(0, 50)}</div>
            </div>
          </div>
        )
      }

      if (layout === 'tutorial') {
        return (
          <div className="w-full h-full flex flex-col items-center justify-center p-8 gap-4" style={{ background: bg }}>
            <div className="absolute opacity-5 font-black text-[120px]" style={{ color: primary }}>1</div>
            <div className="z-10 text-center space-y-3">
              <div className="inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest" style={{ backgroundColor: `${primary}20`, color: primary }}>
                Tutorial
              </div>
              <div className="text-xl font-bold leading-snug" style={{ color: text }}>{scene.narration?.slice(0, 60)}</div>
            </div>
          </div>
        )
      }

      if (layout === 'commercial') {
        return (
          <div className="w-full h-full flex flex-col justify-center items-center relative p-8" style={{ background: '#1a1a1a' }}>
            {/* Fake background image layer */}
            <div className="absolute inset-0 opacity-20 bg-gradient-to-br from-white/10 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            
            <div className="z-10 w-full border border-white/20 p-6 flex flex-col items-center text-center gap-4 backdrop-blur-sm">
              <div className="text-sm tracking-[0.3em] uppercase opacity-80" style={{ color: '#fff' }}>Premium</div>
              <div className="text-2xl font-serif" style={{ color: '#fff' }}>{scene.narration?.slice(0, 30)}</div>
              <div className="w-8 h-[1px] bg-white/50" />
            </div>
          </div>
        )
      }

      // Fallback
      return (
        <div className="w-full h-full flex flex-col items-center justify-center p-8 gap-4"
             style={{ background: `linear-gradient(135deg, ${bg}, ${primary}20)` }}>
          <div className="text-2xl font-black text-center leading-tight" style={{ color: text }}>
            {scene.narration?.slice(0, 60)}
          </div>
          <div className="w-16 h-1 rounded-full" style={{ backgroundColor: primary }} />
        </div>
      )
    }
    
    case 'info_card': {
      const layout = scene.layout || 'vertical_stack'
      return (
        <div className="w-full h-full flex items-center justify-center p-6"
             style={{ background: `linear-gradient(135deg, ${bg}, ${primary}10)` }}>
          <div className={`w-full max-w-[280px] ${layout === 'grid_2x2' ? 'grid grid-cols-2 gap-2' : 'space-y-2'}`}>
            {(scene.card_items || []).slice(0, layout === 'grid_2x2' ? 4 : 3).map((item, i) => (
              <div key={i} className="p-3 rounded-xl border border-white/10 bg-white/5 backdrop-blur flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
                     style={{ backgroundColor: `${primary}25` }}>{item.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-bold truncate" style={{ color: text }}>{item.title}</div>
                </div>
              </div>
            ))}
            {!scene.card_items?.length && (
              <div className="p-4 rounded-xl border border-white/10 bg-white/5">
                <p className="text-xs" style={{ color: text }}>{scene.narration?.slice(0, 80)}</p>
              </div>
            )}
          </div>
        </div>
      )
    }
    
    case 'stats_highlight':
      return (
        <div className="w-full h-full flex flex-col items-center justify-center p-8 gap-3"
             style={{ background: bg }}>
          {scene.stats?.length ? (
            scene.stats.slice(0, 3).map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-3xl font-black" style={{ color: stat.color || primary }}>
                  {stat.value}
                </div>
                <div className="text-xs opacity-60" style={{ color: text }}>{stat.label}</div>
              </div>
            ))
          ) : (
            <div className="text-4xl font-black" style={{ color: primary }}>85%</div>
          )}
          <p className="text-xs text-center opacity-60 max-w-[200px]" style={{ color: text }}>
            {scene.narration?.slice(0, 60)}
          </p>
        </div>
      )
    
    case 'comparison':
      return (
        <div className="w-full h-full flex relative" style={{ background: bg }}>
          {(scene.comparison_sides || []).slice(0, 2).map((side, i) => (
            <div key={i} className="flex-1 flex flex-col items-center justify-center p-4 gap-2"
                 style={{ borderRight: i === 0 ? '1px solid rgba(255,255,255,0.1)' : 'none' }}>
              <span className="text-sm font-bold" style={{ color: i === 0 ? '#22C55E' : '#EF4444' }}>
                {side.label}
              </span>
              <ul className="text-[10px] opacity-70 space-y-1 text-center" style={{ color: text }}>
                {side.points?.slice(0, 3).map((p, j) => <li key={j}>• {p}</li>)}
              </ul>
            </div>
          ))}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white/10 backdrop-blur px-3 py-1 rounded-full text-xs font-bold" style={{ color: text }}>
            VS
          </div>
        </div>
      )

    case 'timeline':
      return (
        <div className="w-full h-full flex flex-col items-center justify-center p-6 gap-2"
             style={{ background: `linear-gradient(135deg, ${bg}, ${primary}08)` }}>
          <div className="w-full max-w-[280px] space-y-2">
            {(scene.timeline_events || []).slice(0, 4).map((ev, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                     style={{ background: `linear-gradient(135deg, ${primary}, ${palette.secondary || primary})`, color: '#fff' }}>
                  {i + 1}
                </div>
                <div className="flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
                  <span className="text-[9px] font-mono block" style={{ color: primary }}>{ev.label}</span>
                  <span className="text-[10px] truncate block" style={{ color: text }}>{ev.title}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )

    case 'diagram':
      return (
        <div className="w-full h-full flex flex-col items-center justify-center p-6 gap-2"
             style={{ background: bg }}>
          <div className="text-xs font-bold uppercase tracking-wider opacity-40" style={{ color: text }}>Sơ đồ</div>
          <div className="space-y-2 w-full max-w-[240px]">
            {['Bước 1', 'Bước 2', 'Bước 3'].map((step, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                     style={{ backgroundColor: `${primary}30`, color: primary }}>
                  {i + 1}
                </div>
                <div className="flex-1 h-px" style={{ backgroundColor: `${primary}30` }} />
                <span className="text-xs" style={{ color: text }}>{step}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-center opacity-50 mt-2 max-w-[200px]" style={{ color: text }}>
            {scene.narration?.slice(0, 50)}
          </p>
        </div>
      )

    case 'emoji_grid':
      return (
        <div className="w-full h-full flex flex-col items-center justify-center p-6 gap-3"
             style={{ background: `linear-gradient(135deg, ${bg}, ${primary}08)` }}>
          {scene.card_items?.length ? (
            <div className="grid grid-cols-2 gap-3 max-w-[260px]">
              {scene.card_items.slice(0, 4).map((item, i) => (
                <div key={i} className="flex flex-col items-center gap-1 p-3 rounded-xl bg-white/5">
                  <div className="text-3xl">{item.icon}</div>
                  <div className="text-[10px] font-medium text-center" style={{ color: text }}>{item.title}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex gap-4 text-4xl">
              {['⚡', '🎨', '💰'].map((e, i) => <span key={i}>{e}</span>)}
            </div>
          )}
        </div>
      )

    case 'story_beats': {
      const beats = (scene.story_beats || []).slice(0, 3)
      const fallbackRows = [
        { emoji: '✨', text: scene.narration?.split(' ').slice(0, 5).join(' ') || 'Story beat 1' },
        { emoji: '⚡', text: scene.narration?.split(' ').slice(5, 10).join(' ') || 'Story beat 2' },
        { emoji: '🎯', text: scene.narration?.split(' ').slice(10, 15).join(' ') || 'Story beat 3' },
      ]
      const rows = beats.length ? beats : fallbackRows

      return (
        <div
          className="w-full h-full flex flex-col justify-center px-6 gap-3"
          style={{
            background: `linear-gradient(180deg, ${primary}18 0%, ${bg} 60%, ${(palette.secondary || primary)}18 100%)`,
          }}
        >
          {rows.map((beat, idx) => {
            const isCurrent = idx === rows.length - 1
            return (
              <div
                key={`story-beat-mock-${idx}`}
                className="rounded-xl border px-3 py-2 flex items-center gap-3"
                style={{
                  borderColor: isCurrent ? `${primary}66` : 'rgba(255,255,255,0.12)',
                  backgroundColor: isCurrent ? `${primary}22` : 'rgba(255,255,255,0.04)',
                  opacity: isCurrent ? 1 : 0.65,
                }}
              >
                <span className="text-2xl leading-none">{beat.emoji}</span>
                <span
                  className="text-xs leading-snug line-clamp-2"
                  style={{ color: isCurrent ? text : `${text}CC`, fontWeight: isCurrent ? 700 : 500 }}
                >
                  {beat.text}
                </span>
              </div>
            )
          })}
        </div>
      )
    }

    case 'media_showcase': {
      const mediaLayout = scene.layout || scene.media_layout || 'fit'
      if (mediaLayout === 'fullscreen') {
        return (
          <div className="w-full h-full flex items-center justify-center" style={{ background: bg }}>
            <div className="text-center space-y-2">
              <Film className="w-10 h-10 mx-auto text-primary/40" />
              <p className="text-xs" style={{ color: text }}>Toàn màn hình</p>
            </div>
          </div>
        )
      }
      return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-6" style={{ background: bg }}>
          <p className="text-sm font-bold text-center" style={{ color: text }}>
            {scene.visual_description?.slice(0, 40) || scene.narration?.slice(0, 40)}
          </p>
          <div className="w-[240px] h-[135px] rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
            <Play className="w-8 h-8 text-primary/30" />
          </div>
          <span className="text-[10px] uppercase tracking-wider opacity-40" style={{ color: text }}>
            {mediaLayout === 'cinema' ? 'Cinema 16:9' : 'Fit'}
          </span>
        </div>
      )
    }

    default:
      return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-4"
             style={{ background: `linear-gradient(135deg, ${primary}20, ${bg}, ${primary}10)` }}>
          <Palette className="w-10 h-10 text-primary/40" />
          <Badge variant="secondary" className="text-xs">
            {SCENE_TYPE_LABELS[scene.scene_type || ''] || scene.scene_type}
          </Badge>
        </div>
      )
  }
}

// Import here to avoid circular dependency
import { SCENE_TYPE_LABELS } from './constants'
