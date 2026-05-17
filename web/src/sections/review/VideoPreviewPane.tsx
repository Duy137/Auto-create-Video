import { useState, useEffect } from 'react'
import {
  Image as ImageIcon, Film, Clock, Play, LoaderCircle,
} from 'lucide-react'
import type { Scene } from './types'
import { NEEDS_MEDIA, getPreviewUrl } from './constants'
import { ScenePreviewMockup } from './ScenePreviewMockup'

interface VideoPreviewPaneProps {
  selectedScene: Scene
  palette: Record<string, string>
  selectedSceneIndex: number
}

export function VideoPreviewPane({
  selectedScene,
  palette,
  selectedSceneIndex,
}: VideoPreviewPaneProps) {
  const [mediaLoading, setMediaLoading] = useState(true)
  const [mediaError, setMediaError] = useState(false)

  const currentMediaUrl = selectedScene?.media_url ?? null

  // Reset media state when scene changes
  useEffect(() => {
    setMediaLoading(true)
    setMediaError(false)
  }, [selectedSceneIndex, currentMediaUrl])

  return (
    <div className="flex flex-col bg-muted/5 items-center justify-center p-8 relative overflow-hidden">
      <div className="relative aspect-[9/16] h-full max-h-[680px] border shadow-2xl rounded-2xl overflow-hidden bg-black group-hover:ring-1 ring-white/10 transition-all">
        {getPreviewUrl(selectedScene) ? (
          <>
            {/* Media loading overlay */}
            {mediaLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
                <LoaderCircle className="w-6 h-6 animate-spin text-primary" />
              </div>
            )}
            {/* Media error fallback */}
            {mediaError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/40 z-10 gap-2">
                <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
                <span className="text-xs text-muted-foreground">Media không tải được</span>
              </div>
            )}

            {/* Layout-aware media rendering */}
            {selectedScene?.scene_type === 'media_showcase' && (selectedScene?.media_layout || 'cinema') === 'cinema' ? (
              // Cinema layout: 16:9 container in center with title above
              <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-4" 
                   style={{ background: palette.background || '#0a0a0a' }}>
                <p className="text-sm font-bold text-center px-6 line-clamp-2" 
                   style={{ color: palette.text || '#fff' }}>
                  {selectedScene?.visual_description || selectedScene?.narration}
                </p>
                <div className="w-[85%] aspect-video rounded-xl overflow-hidden shadow-2xl border border-white/10">
                  {selectedScene.media_type === 'video' ? (
                    <video
                      key={getPreviewUrl(selectedScene)!}
                      src={getPreviewUrl(selectedScene)!}
                      autoPlay muted loop
                      className="w-full h-full object-cover"
                      onLoadedData={() => setMediaLoading(false)}
                      onError={() => { setMediaLoading(false); setMediaError(true) }}
                    />
                  ) : (
                    <img
                      key={getPreviewUrl(selectedScene)!}
                      src={getPreviewUrl(selectedScene)!}
                      alt=""
                      className="w-full h-full object-cover"
                      onLoad={() => setMediaLoading(false)}
                      onError={() => { setMediaLoading(false); setMediaError(true) }}
                    />
                  )}
                </div>
              </div>
            ) : selectedScene?.scene_type === 'media_showcase' && selectedScene?.media_layout === 'fit' ? (
              // Fit layout: media width=100%, natural height, centered vertically
              <div className="w-full h-full flex items-center justify-center"
                   style={{ background: palette.background || '#0a0a0a' }}>
                {selectedScene.media_type === 'video' ? (
                  <video
                    key={getPreviewUrl(selectedScene)!}
                    src={getPreviewUrl(selectedScene)!}
                    autoPlay muted loop
                    className="w-full"
                    style={{ objectFit: 'contain' }}
                    onLoadedData={() => setMediaLoading(false)}
                    onError={() => { setMediaLoading(false); setMediaError(true) }}
                  />
                ) : (
                  <img
                    key={getPreviewUrl(selectedScene)!}
                    src={getPreviewUrl(selectedScene)!}
                    alt=""
                    className="w-full"
                    style={{ objectFit: 'contain' }}
                    onLoad={() => setMediaLoading(false)}
                    onError={() => { setMediaLoading(false); setMediaError(true) }}
                  />
                )}
              </div>
            ) : (
              // Fullscreen layout (default for all other types)
              <>
                {selectedScene.media_type === 'video' ? (
                  <video 
                    key={getPreviewUrl(selectedScene)!}
                    src={getPreviewUrl(selectedScene)!} 
                    autoPlay muted loop 
                    className="w-full h-full object-cover" 
                    onLoadedData={() => setMediaLoading(false)}
                    onError={() => { setMediaLoading(false); setMediaError(true) }}
                  />
                ) : (
                  <img
                    src={getPreviewUrl(selectedScene)!}
                    alt=""
                    className="w-full h-full object-cover"
                    onLoad={() => setMediaLoading(false)}
                    onError={() => { setMediaLoading(false); setMediaError(true) }}
                  />
                )}
              </>
            )}
            
            {/* Subtitle Overlay Mockup */}
            <div className="absolute bottom-20 left-6 right-6 text-center">
              <p className="text-white text-xl font-bold drop-shadow-2xl leading-tight uppercase tracking-tight" style={{ 
                textShadow: '0 2px 4px rgba(0,0,0,0.8), 0 0 20px rgba(0,0,0,0.6)',
                WebkitTextStroke: '0.8px rgba(0,0,0,0.4)'
              }}>
                {selectedScene.narration}
              </p>
            </div>
          </>
        ) : !NEEDS_MEDIA.has(selectedScene?.scene_type || '') ? (
          <div className="w-full h-full relative">
            <ScenePreviewMockup scene={selectedScene} palette={palette} />
            {/* Subtitle overlay */}
            <div className="absolute bottom-20 left-6 right-6 text-center">
              <p className="text-foreground/80 text-lg font-bold leading-tight">
                {selectedScene?.narration}
              </p>
            </div>
          </div>
        ) : (
          // Clear placeholder instead of infinite spinner
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-4 bg-muted/20">
            <ImageIcon className="w-12 h-12 opacity-20" />
            <span className="text-sm font-medium opacity-60">Chưa có media</span>
            <span className="text-xs opacity-40">Tìm trên Pexels hoặc tải lên từ máy tính</span>
          </div>
        )}
        
        {/* Play Button Overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/40 cursor-default">
           <div className="bg-white/10 backdrop-blur-xl p-5 rounded-full border border-white/20 shadow-2xl transform scale-90 hover:scale-100 transition-transform cursor-pointer">
              <Play size={40} className="text-white fill-white ml-1.5" />
           </div>
        </div>
      </div>
      
      {/* Metadata floating badges */}
      <div className="absolute top-3 left-3 sm:top-4 sm:left-4 flex flex-col gap-2 sm:gap-3 origin-top-left scale-75 sm:scale-90 lg:scale-100">
        <div className="bg-background/40 backdrop-blur-md border border-white/5 shadow-xl rounded-full px-3 sm:px-4 py-1.5 sm:py-2 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-mono">{(selectedScene?.start_ms / 1000).toFixed(1)}s → {(selectedScene?.end_ms / 1000).toFixed(1)}s</span>
        </div>
        <div className="bg-background/40 backdrop-blur-md border border-white/5 shadow-xl rounded-full px-3 sm:px-4 py-1.5 sm:py-2 flex items-center gap-2">
            <Film className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-medium capitalize">{selectedScene?.media_type || 'Media'}</span>
        </div>
      </div>
    </div>
  )
}
