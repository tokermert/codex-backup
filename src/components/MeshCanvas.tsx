import { useEffect, useRef, useCallback, useState } from 'react'
import { MeshRenderer } from '../mesh/renderer'
import { store } from '../mesh/store'
import type { AnimationSettings } from '../mesh/types'

const POINT_RADIUS = 6
const HANDLE_RADIUS = 4
const HIT_RADIUS = 14  // px — hit target (in client px)
const OVERLAY_PAD = 200 // allow drawing/interacting outside artboard bounds
const VIEWPORT_RADIUS = 10

interface DragState {
  type: 'point' | 'handle'
  row: number
  col: number
  handle?: 'left' | 'right' | 'up' | 'down'
  lastX: number
  lastY: number
}

export default function MeshCanvas() {
  const glCanvasRef  = useRef<HTMLCanvasElement>(null)
  const overlayRef   = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef  = useRef<MeshRenderer | null>(null)
  const dragRef      = useRef<DragState | null>(null)
  const reducedMotionRef = useRef(false)
  const [cursor, setCursor] = useState<'crosshair' | 'grab' | 'grabbing'>('crosshair')

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { reducedMotionRef.current = mql.matches }
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [])

  // ── Draw overlay (mesh lines + points + handles) ──────────────────────────
  const drawOverlay = useCallback(() => {
    const canvas = overlayRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.translate(OVERLAY_PAD, OVERLAY_PAD)

    const { grid, selectedPoint, hoveredPoint } = store.state
    const W = canvas.width  / dpr - OVERLAY_PAD * 2
    const H = canvas.height / dpr - OVERLAY_PAD * 2

    // ── Mesh bezier lines ─────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'
    ctx.lineWidth   = 1

    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols - 1; c++) {
        const p0 = grid.points[r][c]
        const p1 = grid.points[r][c + 1]
        ctx.beginPath()
        ctx.moveTo(p0.position.x * W, p0.position.y * H)
        ctx.bezierCurveTo(
          (p0.position.x + p0.handles.right.x) * W,
          (p0.position.y + p0.handles.right.y) * H,
          (p1.position.x + p1.handles.left.x) * W,
          (p1.position.y + p1.handles.left.y) * H,
          p1.position.x * W,
          p1.position.y * H,
        )
        ctx.stroke()
      }
    }

    for (let c = 0; c < grid.cols; c++) {
      for (let r = 0; r < grid.rows - 1; r++) {
        const p0 = grid.points[r][c]
        const p1 = grid.points[r + 1][c]
        ctx.beginPath()
        ctx.moveTo(p0.position.x * W, p0.position.y * H)
        ctx.bezierCurveTo(
          (p0.position.x + p0.handles.down.x) * W,
          (p0.position.y + p0.handles.down.y) * H,
          (p1.position.x + p1.handles.up.x) * W,
          (p1.position.y + p1.handles.up.y) * H,
          p1.position.x * W,
          p1.position.y * H,
        )
        ctx.stroke()
      }
    }

    // ── Handles for selected point ────────────────────────────────────────
    if (selectedPoint) {
      const p  = grid.points[selectedPoint.row][selectedPoint.col]
      const px = p.position.x * W
      const py = p.position.y * H

      const hs = [
        { dx: p.handles.left.x,  dy: p.handles.left.y  },
        { dx: p.handles.right.x, dy: p.handles.right.y },
        { dx: p.handles.up.x,    dy: p.handles.up.y    },
        { dx: p.handles.down.x,  dy: p.handles.down.y  },
      ] as const

      hs.forEach(({ dx, dy }) => {
        const hx = (p.position.x + dx) * W
        const hy = (p.position.y + dy) * H

        ctx.beginPath()
        ctx.setLineDash([3, 3])
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'
        ctx.lineWidth = 1
        ctx.moveTo(px, py)
        ctx.lineTo(hx, hy)
        ctx.stroke()
        ctx.setLineDash([])

        ctx.beginPath()
        ctx.fillStyle = '#fff'
        ctx.arc(hx, hy, HANDLE_RADIUS, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'
        ctx.lineWidth = 1
        ctx.stroke()
      })
    }

    // ── Mesh points ───────────────────────────────────────────────────────
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        const p  = grid.points[r][c]
        const px = p.position.x * W
        const py = p.position.y * H
        const isSel = selectedPoint?.row === r && selectedPoint?.col === c
        const isHov = hoveredPoint?.row === r && hoveredPoint?.col === c

        ctx.beginPath()
        ctx.arc(px, py, POINT_RADIUS + (isSel ? 3 : 2), 0, Math.PI * 2)
        ctx.fillStyle = isSel  ? 'rgba(255,255,255,1)'
                      : isHov  ? 'rgba(255,255,255,0.8)'
                      :          'rgba(255,255,255,0.6)'
        ctx.fill()

        const { r: cr, g: cg, b: cb } = p.color
        ctx.beginPath()
        ctx.arc(px, py, POINT_RADIUS, 0, Math.PI * 2)
        ctx.fillStyle = `rgb(${cr * 255 | 0},${cg * 255 | 0},${cb * 255 | 0})`
        ctx.fill()
      }
    }

    ctx.restore()
  }, [])

  // ── Three.js renderer setup ───────────────────────────────────────────────
  useEffect(() => {
    const canvas = glCanvasRef.current
    if (!canvas) return

    const renderer = new MeshRenderer(canvas)
    rendererRef.current = renderer

    const tick = () => {
      const { grid, subdivision, canvasBackground, effect } = store.state
      renderer.subdivision = subdivision
      renderer.setBackground(canvasBackground)
      renderer.setEffect(effect)
      renderer.update(grid)
      drawOverlay()
    }

    const unsub = store.subscribe(tick)
    tick()

    let rafId = 0
    const frame = (now: number) => {
      const anim = store.state.animation
      const effectiveAnimation: AnimationSettings = reducedMotionRef.current
        ? { ...anim, style: 'static', strength: 0 }
        : anim
      renderer.setAnimation(effectiveAnimation, now / 1000)
      renderer.render()
      rafId = requestAnimationFrame(frame)
    }
    rafId = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(rafId)
      unsub()
      renderer.dispose()
    }
  }, [drawOverlay])

  // ── ResizeObserver ────────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      const w = Math.round(width)
      const h = Math.round(height)

      rendererRef.current?.setSize(w, h)
      store.setCanvasSize(w, h)

      const overlay = overlayRef.current
      if (overlay) {
        const dpr = window.devicePixelRatio || 1
        const ow = w + OVERLAY_PAD * 2
        const oh = h + OVERLAY_PAD * 2
        overlay.width  = ow * dpr
        overlay.height = oh * dpr
        overlay.style.width  = ow + 'px'
        overlay.style.height = oh + 'px'
      }

      drawOverlay()
    })

    ro.observe(container)
    return () => ro.disconnect()
  }, [drawOverlay])

  // ── Hit testing ───────────────────────────────────────────────────────────
  const getHitPoint = useCallback((cx: number, cy: number) => {
    const { width: W, height: H } = store.state.canvasSize
    const { grid, selectedPoint } = store.state

    if (selectedPoint) {
      const p = grid.points[selectedPoint.row][selectedPoint.col]
      for (const h of ['left', 'right', 'up', 'down'] as const) {
        const hx = (p.position.x + p.handles[h].x) * W
        const hy = (p.position.y + p.handles[h].y) * H
        if (Math.hypot(cx - hx, cy - hy) < HIT_RADIUS) {
          return { type: 'handle' as const, row: selectedPoint.row, col: selectedPoint.col, handle: h }
        }
      }
    }

    let best: { type: 'point'; row: number; col: number } | null = null
    let bestDist = HIT_RADIUS

    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        const p = grid.points[r][c]
        const d = Math.hypot(cx - p.position.x * W, cy - p.position.y * H)
        if (d < bestDist) {
          bestDist = d
          best = { type: 'point', row: r, col: c }
        }
      }
    }

    return best
  }, [])

  const clientXY = useCallback((e: React.PointerEvent) => {
    const rect = overlayRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left - OVERLAY_PAD, y: e.clientY - rect.top - OVERLAY_PAD }
  }, [])

  // ── Pointer events ────────────────────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const { x, y } = clientXY(e)
    const hit = getHitPoint(x, y)

    if (!hit) {
      store.selectPoint(null, null)
      return
    }

    if (hit.type === 'point') {
      store.selectPoint(hit.row, hit.col)
      dragRef.current = { type: 'point', row: hit.row, col: hit.col, lastX: x, lastY: y }
    } else {
      dragRef.current = { type: 'handle', row: hit.row, col: hit.col, handle: hit.handle, lastX: x, lastY: y }
    }

    setCursor('grabbing')
    overlayRef.current!.setPointerCapture(e.pointerId)
  }, [clientXY, getHitPoint])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const { x, y } = clientXY(e)

    if (!dragRef.current) {
      const hit = getHitPoint(x, y)
      if (hit?.type === 'point') {
        store.hoverPoint(hit.row, hit.col)
        setCursor('grab')
      } else if (hit?.type === 'handle') {
        store.hoverPoint(null, null)
        setCursor('grab')
      } else {
        store.hoverPoint(null, null)
        setCursor('crosshair')
      }
      return
    }

    const drag = dragRef.current
    const dx = x - drag.lastX
    const dy = y - drag.lastY
    drag.lastX = x
    drag.lastY = y

    if (dx === 0 && dy === 0) return

    if (drag.type === 'point') {
      store.movePoint(drag.row, drag.col, dx, dy)
    } else if (drag.type === 'handle' && drag.handle) {
      store.moveHandle(drag.row, drag.col, drag.handle, dx, dy)
    }
  }, [clientXY, getHitPoint])

  const onPointerUp = useCallback(() => {
    if (dragRef.current) store.commitSnapshot()
    dragRef.current = null
    setCursor('crosshair')
  }, [])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === 'z') {
        e.preventDefault()
        e.shiftKey ? store.redo() : store.undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Transparency checkerboard (UI-only, not part of canvas export) */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          borderRadius: VIEWPORT_RADIUS,
          backgroundColor: '#d9d9d9',
          backgroundImage: `
            linear-gradient(45deg, rgba(255,255,255,0.55) 25%, transparent 25%),
            linear-gradient(-45deg, rgba(255,255,255,0.55) 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.55) 75%),
            linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.55) 75%)
          `,
          backgroundSize: '20px 20px',
          backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0',
        }}
      />

      {/* WebGL gradient render */}
      <canvas
        ref={glCanvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'block',
          width: '100%',
          height: '100%',
          borderRadius: VIEWPORT_RADIUS,
        }}
      />

      {/* 2D overlay: mesh lines + points */}
      <canvas
        ref={overlayRef}
        style={{
          position: 'absolute',
          left: -OVERLAY_PAD,
          top: -OVERLAY_PAD,
          cursor,
          touchAction: 'none',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => {
          if (!dragRef.current) {
            store.hoverPoint(null, null)
            setCursor('crosshair')
          }
        }}
      />
    </div>
  )
}
