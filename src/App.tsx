import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MeshCanvas from './components/MeshCanvas'
import RightPanel from './components/RightPanel'
import Toolbar from './components/Toolbar'
import { store } from './mesh/store'

const VIEWPORT_PADDING = 28
const INTERACTION_MARGIN = 22
const MIN_ZOOM = 0.5
const MAX_ZOOM = 3
const ZOOM_STEP = 0.1

export default function App() {
  const [, setTick] = useState(0)
  const viewportRef = useRef<HTMLDivElement>(null)
  const panDragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    startPanX: number
    startPanY: number
  } | null>(null)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [spacePressed, setSpacePressed] = useState(false)
  const [isPanning, setIsPanning] = useState(false)

  useEffect(() => {
    const unsub = store.subscribe(() => setTick(n => n + 1))
    return () => unsub()
  }, [])

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return

    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setViewportSize({ width: Math.max(0, width), height: Math.max(0, height) })
    })

    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const artboard = store.state.artboardSize
  const fitted = useMemo(() => {
    if (viewportSize.width <= 0 || viewportSize.height <= 0) {
      return { width: 0, height: 0 }
    }

    const availableWidth = Math.max(1, viewportSize.width - INTERACTION_MARGIN * 2)
    const availableHeight = Math.max(1, viewportSize.height - INTERACTION_MARGIN * 2)
    const ratio = artboard.width / artboard.height
    let width = availableWidth
    let height = width / ratio

    if (height > availableHeight) {
      height = availableHeight
      width = height * ratio
    }

    return {
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    }
  }, [artboard.height, artboard.width, viewportSize.height, viewportSize.width])

  const availableViewport = useMemo(() => ({
    width: Math.max(1, viewportSize.width - INTERACTION_MARGIN * 2),
    height: Math.max(1, viewportSize.height - INTERACTION_MARGIN * 2),
  }), [viewportSize.height, viewportSize.width])

  const displaySize = useMemo(() => ({
    width: Math.max(1, Math.round(fitted.width * zoom)),
    height: Math.max(1, Math.round(fitted.height * zoom)),
  }), [fitted.height, fitted.width, zoom])

  const panLimits = useMemo(() => ({
    x: Math.max(0, (displaySize.width - availableViewport.width) / 2 + INTERACTION_MARGIN),
    y: Math.max(0, (displaySize.height - availableViewport.height) / 2 + INTERACTION_MARGIN),
  }), [availableViewport.height, availableViewport.width, displaySize.height, displaySize.width])

  const clampPan = useCallback((x: number, y: number) => ({
    x: Math.max(-panLimits.x, Math.min(panLimits.x, x)),
    y: Math.max(-panLimits.y, Math.min(panLimits.y, y)),
  }), [panLimits.x, panLimits.y])

  useEffect(() => {
    setPan(prev => clampPan(prev.x, prev.y))
  }, [clampPan])

  const updateZoom = useCallback((next: number | ((current: number) => number)) => {
    setZoom(current => {
      const raw = typeof next === 'function' ? next(current) : next
      const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, raw))
      return Number(clamped.toFixed(2))
    })
  }, [])

  const resetView = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  useEffect(() => {
    const isTextInput = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)

    const isSpace = (e: KeyboardEvent) =>
      e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar'

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isSpace(e)) return
      if (isTextInput(e.target)) return
      e.preventDefault()
      setSpacePressed(true)
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (!isSpace(e)) return
      setSpacePressed(false)
      setIsPanning(false)
      panDragRef.current = null
    }

    const onBlur = () => {
      setSpacePressed(false)
      setIsPanning(false)
      panDragRef.current = null
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  const onViewportPointerDownCapture = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const wantsPan = spacePressed || e.button === 1
    if (!wantsPan) return

    const start = clampPan(pan.x, pan.y)
    panDragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startPanX: start.x,
      startPanY: start.y,
    }
    setIsPanning(true)
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
    e.stopPropagation()
  }, [clampPan, pan.x, pan.y, spacePressed])

  const onViewportPointerMoveCapture = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = panDragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    setPan(clampPan(drag.startPanX + dx, drag.startPanY + dy))
    e.preventDefault()
    e.stopPropagation()
  }, [clampPan])

  const onViewportPointerUpCapture = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = panDragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    panDragRef.current = null
    setIsPanning(false)
    e.currentTarget.releasePointerCapture(e.pointerId)
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const onViewportWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (!(e.ctrlKey || e.metaKey)) return
    e.preventDefault()
    const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP
    updateZoom(current => current + delta)
  }, [updateZoom])

  const viewportCursor = isPanning ? 'grabbing' : (spacePressed ? 'grab' : 'default')

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#141414',
      userSelect: 'none',
    }}>
      <Toolbar />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* ── Canvas viewport ─────────────────────────────────────────────── */}
        <div style={{
          flex: 1,
          background: '#1e1e1e',
          backgroundImage: `
            radial-gradient(circle at 20% 20%, rgba(108,99,255,0.04) 0%, transparent 60%),
            radial-gradient(circle at 80% 80%, rgba(255,100,130,0.03) 0%, transparent 60%)
          `,
          overflow: 'hidden',
          padding: VIEWPORT_PADDING,
          position: 'relative',
        }}>
          {/* Subtle dot grid bg */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }} />

          <div
            ref={viewportRef}
            style={{
              position: 'absolute',
              inset: VIEWPORT_PADDING,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'visible',
              cursor: viewportCursor,
            }}
            onPointerDownCapture={onViewportPointerDownCapture}
            onPointerMoveCapture={onViewportPointerMoveCapture}
            onPointerUpCapture={onViewportPointerUpCapture}
            onPointerCancelCapture={onViewportPointerUpCapture}
            onWheel={onViewportWheel}
          >
            {/* Canvas wrapper */}
            <div style={{
              position: 'relative',
              borderRadius: 10,
              overflow: 'visible',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.06), 0 12px 48px rgba(0,0,0,0.7)',
              width: displaySize.width,
              height: displaySize.height,
              transform: `translate3d(${pan.x}px, ${pan.y}px, 0)`,
              transformOrigin: 'center center',
            }}>
              <MeshCanvas />
            </div>
          </div>

          <div style={{
            position: 'absolute',
            left: VIEWPORT_PADDING + 8,
            bottom: VIEWPORT_PADDING + 8,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            zIndex: 6,
            padding: '6px 8px',
            borderRadius: 8,
            background: 'rgba(16,16,20,0.78)',
            border: '1px solid rgba(255,255,255,0.12)',
            backdropFilter: 'blur(8px)',
          }}>
            <button
              onClick={() => updateZoom(v => v - ZOOM_STEP)}
              style={{
                width: 26,
                height: 24,
                borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.18)',
                background: 'rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.9)',
                cursor: 'pointer',
              }}
            >
              -
            </button>
            <button
              onClick={() => updateZoom(v => v + ZOOM_STEP)}
              style={{
                width: 26,
                height: 24,
                borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.18)',
                background: 'rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.9)',
                cursor: 'pointer',
              }}
            >
              +
            </button>
            <button
              onClick={resetView}
              style={{
                height: 24,
                borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.18)',
                background: 'rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.8)',
                cursor: 'pointer',
                padding: '0 10px',
                fontSize: 11,
                letterSpacing: '0.02em',
              }}
            >
              Fit
            </button>
            <div style={{
              minWidth: 44,
              textAlign: 'right',
              fontSize: 11,
              fontVariantNumeric: 'tabular-nums',
              color: 'rgba(255,255,255,0.7)',
            }}>
              {Math.round(zoom * 100)}%
            </div>
          </div>
        </div>

        {/* ── Right panel ─────────────────────────────────────────────────── */}
        <RightPanel />
      </div>
    </div>
  )
}
