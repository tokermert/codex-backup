import { useEffect, useState } from 'react'
import { getMeshExportApi } from '../mesh/exportApi'
import { store } from '../mesh/store'

type ExportTab = 'component' | 'image' | 'video'
type ComponentTarget = 'react' | 'html' | 'reactNative' | 'swiftui'
type ImageFormat = 'png' | 'jpeg' | 'svg'
type VideoFormat = 'webm' | 'mp4'
type ExportScale = 1 | 2 | 3
type ExportFps = 24 | 30 | 60

interface Props {
  open: boolean
  onClose: () => void
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(8, 8, 14, 0.68)',
  backdropFilter: 'blur(3px)',
  zIndex: 1000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
}

const panelStyle: React.CSSProperties = {
  width: 'min(980px, calc(100vw - 48px))',
  maxHeight: 'calc(100vh - 48px)',
  background: '#0f1020',
  border: '1px solid rgba(120,115,255,0.35)',
  borderRadius: 16,
  boxShadow: '0 30px 80px rgba(0,0,0,0.55)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

const tabBtn = (active: boolean): React.CSSProperties => ({
  padding: '10px 16px',
  borderRadius: 8,
  border: `1px solid ${active ? 'rgba(110,102,255,0.95)' : 'rgba(255,255,255,0.14)'}`,
  background: active ? 'rgba(110,102,255,0.16)' : 'rgba(255,255,255,0.03)',
  color: active ? 'rgba(207,203,255,0.98)' : 'rgba(255,255,255,0.6)',
  fontSize: 14,
  cursor: 'pointer',
})

const cardBtn = (active: boolean): React.CSSProperties => ({
  textAlign: 'left',
  padding: 14,
  borderRadius: 12,
  border: `1px solid ${active ? 'rgba(110,102,255,0.9)' : 'rgba(255,255,255,0.12)'}`,
  background: active ? 'rgba(110,102,255,0.15)' : 'rgba(255,255,255,0.03)',
  color: 'rgba(255,255,255,0.88)',
  cursor: 'pointer',
})

const actionBtn = (busy: boolean): React.CSSProperties => ({
  width: '100%',
  padding: '12px 16px',
  borderRadius: 12,
  border: '1px solid rgba(132,125,255,0.9)',
  background: busy ? 'rgba(132,125,255,0.45)' : '#7f74ff',
  color: '#fff',
  fontSize: 16,
  fontWeight: 700,
  cursor: busy ? 'not-allowed' : 'pointer',
})

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function buildExportPayload() {
  const s = store.state
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    canvasSize: s.canvasSize,
    artboardSize: s.artboardSize,
    grid: s.grid,
    animation: s.animation,
    canvasBackground: s.canvasBackground,
    effect: s.effect,
    noise: s.noise,
    glass: s.glass,
    hexagon: s.hexagon,
    squares: s.squares,
    pixelation: s.pixelation,
  }
}

function buildComponentCode(target: ComponentTarget) {
  const payload = buildExportPayload()
  const json = JSON.stringify(payload, null, 2)

  if (target === 'react') {
    return `// MeshGradient.tsx (WebGL exact runtime template)
import React, { useEffect, useRef } from 'react';
import { initMeshGradientRuntime } from './mesh-runtime';

const preset = ${json};

export default function MeshGradient() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const runtime = initMeshGradientRuntime(canvasRef.current, preset);
    return () => runtime?.dispose?.();
  }, []);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />;
}
`
  }

  if (target === 'html') {
    return `<!-- index.html (WebGL exact runtime template) -->
<canvas id="mesh" style="width:100vw;height:100vh;display:block"></canvas>
<script type="module">
  import { initMeshGradientRuntime } from './mesh-runtime.js';

  const preset = ${json};
  const canvas = document.getElementById('mesh');
  const runtime = initMeshGradientRuntime(canvas, preset);
  window.addEventListener('beforeunload', () => runtime?.dispose?.());
</script>
`
  }

  if (target === 'reactNative') {
    return `// React Native note
// Full shader parity requires Skia/GL runtime integration.
// Use this JSON payload as source of truth and map to your native renderer.

export const meshGradientPreset = ${json};
`
  }

  return `// SwiftUI note
// Full shader parity requires Metal/SceneKit custom renderer.
// Use this payload as source of truth and render in your iOS pipeline.

let meshGradientPresetJSON = """
${json}
"""
`
}

export default function ExportModal({ open, onClose }: Props) {
  const [, setTick] = useState(0)
  const [tab, setTab] = useState<ExportTab>('component')
  const [componentTarget, setComponentTarget] = useState<ComponentTarget>('react')
  const [imageFormat, setImageFormat] = useState<ImageFormat>('png')
  const [imageScale, setImageScale] = useState<ExportScale>(1)
  const [videoFormat, setVideoFormat] = useState<VideoFormat>('webm')
  const [videoScale, setVideoScale] = useState<ExportScale>(1)
  const [videoFps, setVideoFps] = useState<ExportFps>(30)
  const [videoDuration, setVideoDuration] = useState('5')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const unsub = store.subscribe(() => setTick(n => n + 1))
    return () => unsub()
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, open])

  const codeText = buildComponentCode(componentTarget)
  const baseSize = store.state.artboardSize
  const imageW = Math.max(1, Math.round(baseSize.width * imageScale))
  const imageH = Math.max(1, Math.round(baseSize.height * imageScale))
  const videoW = Math.max(1, Math.round(baseSize.width * videoScale))
  const videoH = Math.max(1, Math.round(baseSize.height * videoScale))

  if (!open) return null

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={panelStyle} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '18px 20px 10px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center' }}>
          <div style={{ fontSize: 36, color: 'rgba(255,255,255,0.95)', lineHeight: 0.8 }}>Export</div>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 34, cursor: 'pointer', lineHeight: 0.8 }}>×</button>
        </div>

        <div style={{ padding: '14px 20px 0 20px', display: 'flex', gap: 8 }}>
          <button style={tabBtn(tab === 'component')} onClick={() => setTab('component')}>Component</button>
          <button style={tabBtn(tab === 'image')} onClick={() => setTab('image')}>Image</button>
          <button style={tabBtn(tab === 'video')} onClick={() => setTab('video')}>Video</button>
        </div>

        <div style={{ padding: 20, overflowY: 'auto' }}>
          {tab === 'component' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 14 }}>
                <button style={cardBtn(componentTarget === 'react')} onClick={() => setComponentTarget('react')}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>React</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>Web / Next.js</div>
                </button>
                <button style={cardBtn(componentTarget === 'html')} onClick={() => setComponentTarget('html')}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>HTML + JS</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>Vanilla / any framework</div>
                </button>
                <button style={cardBtn(componentTarget === 'reactNative')} onClick={() => setComponentTarget('reactNative')}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>React Native</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>iOS / Android notes</div>
                </button>
                <button style={cardBtn(componentTarget === 'swiftui')} onClick={() => setComponentTarget('swiftui')}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>SwiftUI</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>Native iOS notes</div>
                </button>
              </div>

              <div style={{ border: '1px solid rgba(255,255,255,0.14)', borderRadius: 12, background: 'rgba(0,0,0,0.35)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 10, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <button
                    style={{ ...tabBtn(false), padding: '6px 12px' }}
                    onClick={async () => {
                      await navigator.clipboard.writeText(codeText)
                      setNotice('Code copied')
                    }}
                  >
                    Copy
                  </button>
                </div>
                <pre style={{ margin: 0, padding: 14, maxHeight: 380, overflow: 'auto', fontSize: 13, lineHeight: 1.5, color: 'rgba(240,240,255,0.92)' }}>
                  <code>{codeText}</code>
                </pre>
              </div>
            </>
          )}

          {tab === 'image' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
                <button style={cardBtn(imageFormat === 'png')} onClick={() => setImageFormat('png')}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>PNG</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>Lossless</div>
                </button>
                <button style={cardBtn(imageFormat === 'jpeg')} onClick={() => setImageFormat('jpeg')}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>JPEG</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>Smaller size</div>
                </button>
                <button style={cardBtn(imageFormat === 'svg')} onClick={() => setImageFormat('svg')}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>SVG</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>Raster wrapped in SVG</div>
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
                {[1, 2, 3].map(s => (
                  <button key={s} style={tabBtn(imageScale === s)} onClick={() => setImageScale(s as ExportScale)}>{s}x</button>
                ))}
              </div>

              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.62)', marginBottom: 14 }}>
                {imageFormat.toUpperCase()} • {imageW} × {imageH}px
              </div>

              <button
                disabled={busy}
                style={actionBtn(busy)}
                onClick={async () => {
                  try {
                    setBusy(true)
                    setNotice('')
                    const api = getMeshExportApi()
                    if (!api) throw new Error('Export API hazir degil')
                    const res = await api.captureImage({ format: imageFormat, scale: imageScale })
                    downloadBlob(res.blob, `mesh-gradient-${res.width}x${res.height}.${res.ext}`)
                    setNotice(`Image exported (${res.ext.toUpperCase()})`)
                  } catch (err) {
                    setNotice(err instanceof Error ? err.message : 'Export failed')
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                {busy ? 'Exporting...' : 'Download'}
              </button>
            </>
          )}

          {tab === 'video' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 12 }}>
                <button style={cardBtn(videoFormat === 'webm')} onClick={() => setVideoFormat('webm')}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>WebM</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>Web / Chrome / Firefox</div>
                </button>
                <button style={cardBtn(videoFormat === 'mp4')} onClick={() => setVideoFormat('mp4')}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>MP4</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>H.264 if supported</div>
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
                {[1, 2, 3].map(s => (
                  <button key={s} style={tabBtn(videoScale === s)} onClick={() => setVideoScale(s as ExportScale)}>{s}x</button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, color: 'rgba(255,255,255,0.72)' }}>
                  Duration (seconds)
                  <input
                    value={videoDuration}
                    onChange={e => setVideoDuration(e.target.value)}
                    style={{ borderRadius: 10, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.04)', color: '#fff', padding: '10px 12px', fontSize: 18 }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, color: 'rgba(255,255,255,0.72)' }}>
                  FPS
                  <select
                    value={videoFps}
                    onChange={e => setVideoFps(Number(e.target.value) as ExportFps)}
                    style={{ borderRadius: 10, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.04)', color: '#fff', padding: '10px 12px', fontSize: 18 }}
                  >
                    <option value={24}>24 fps</option>
                    <option value={30}>30 fps</option>
                    <option value={60}>60 fps</option>
                  </select>
                </label>
              </div>

              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.62)', marginBottom: 12 }}>
                {videoW} × {videoH}px • {videoFps} fps
              </div>

              <button
                disabled={busy}
                style={actionBtn(busy)}
                onClick={async () => {
                  try {
                    setBusy(true)
                    setNotice('')
                    const duration = Math.max(1, Math.min(30, Number(videoDuration) || 5))
                    const api = getMeshExportApi()
                    if (!api) throw new Error('Export API hazir degil')
                    const res = await api.recordVideo({
                      format: videoFormat,
                      durationSec: duration,
                      fps: videoFps,
                      scale: videoScale,
                    })
                    downloadBlob(res.blob, `mesh-gradient-${res.width}x${res.height}-${videoFps}fps.${res.ext}`)
                    if (res.usedFallback) {
                      setNotice('MP4 desteklenmedi, WebM fallback ile indirildi')
                    } else {
                      setNotice(`Video exported (${res.ext.toUpperCase()})`)
                    }
                  } catch (err) {
                    setNotice(err instanceof Error ? err.message : 'Video export failed')
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                {busy ? 'Recording...' : 'Record & Download'}
              </button>
            </>
          )}

          {notice && (
            <div style={{ marginTop: 12, fontSize: 13, color: 'rgba(210,207,255,0.9)' }}>
              {notice}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
