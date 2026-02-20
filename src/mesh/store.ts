import { createDefaultGrid } from './math'
import type {
  MeshGrid,
  MeshPoint,
  Color,
  HandleType,
  AnimationSettings,
  AnimationStyle,
  CanvasBackgroundSettings,
  EffectSettings,
  EffectType,
  NoiseSettings,
} from './types'

// Simple reactive store using callbacks
type Listener = () => void

export interface EditorState {
  grid: MeshGrid
  selectedPoint: { row: number; col: number } | null
  hoveredPoint: { row: number; col: number } | null
  canvasSize: { width: number; height: number }
  artboardSize: { width: number; height: number }
  subdivision: number
  animation: AnimationSettings
  canvasBackground: CanvasBackgroundSettings
  effect: EffectSettings
  noise: NoiseSettings
}

class EditorStore {
  state: EditorState
  private listeners: Set<Listener> = new Set()
  private history: MeshGrid[] = []
  private historyIndex = -1

  private animSpeedBounds(style: AnimationStyle) {
    return style === 'smooth' ? { min: 2, max: 6 } : { min: 0.1, max: 4 }
  }

  private animStrengthBounds(style: AnimationStyle) {
    return style === 'smooth' ? { min: 0.5, max: 2 } : { min: 0, max: 1 }
  }

  constructor() {
    this.state = {
      grid: createDefaultGrid(3, 3, 800, 600),
      selectedPoint: null,
      hoveredPoint: null,
      canvasSize: { width: 800, height: 600 },
      artboardSize: { width: 1600, height: 1000 },
      subdivision: 20,
      animation: {
        style: 'static',
        speed: 1,
        strength: 0.5,
      },
      canvasBackground: {
        color: {
          r: 0x11 / 255,
          g: 0x11 / 255,
          b: 0x11 / 255,
          a: 1,
        },
        opacity: 1,
      },
      effect: {
        type: 'none',
        color: {
          r: 0xe5 / 255,
          g: 0xe5 / 255,
          b: 0xf7 / 255,
          a: 1,
        },
        lineColor: {
          r: 0,
          g: 0,
          b: 0,
          a: 1,
        },
        opacity: 0.3,
        scale: 30,
        rotate: 0,
      },
      noise: {
        enabled: false,
        animated: false,
        color: {
          r: 1,
          g: 1,
          b: 1,
          a: 1,
        },
        intensity: 0.30,
        size: 1.34,
        speed: 0.40,
      },
    }
    this.snapshot()
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  private notify() {
    this.listeners.forEach(fn => fn())
  }

  private snapshot() {
    // Deep clone grid for undo
    const clone = JSON.parse(JSON.stringify(this.state.grid))
    this.history = this.history.slice(0, this.historyIndex + 1)
    this.history.push(clone)
    this.historyIndex++
    // Keep history bounded
    if (this.history.length > 50) {
      this.history.shift()
      this.historyIndex--
    }
  }

  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--
      this.state.grid = JSON.parse(JSON.stringify(this.history[this.historyIndex]))
      this.notify()
    }
  }

  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++
      this.state.grid = JSON.parse(JSON.stringify(this.history[this.historyIndex]))
      this.notify()
    }
  }

  setCanvasSize(width: number, height: number) {
    this.state.canvasSize = { width, height }
    this.state.grid = { ...this.state.grid, width, height }
    this.notify()
  }

  setArtboardSize(width: number, height: number) {
    const w = Math.round(Math.max(128, Math.min(8192, width)))
    const h = Math.round(Math.max(128, Math.min(8192, height)))
    this.state.artboardSize = { width: w, height: h }
    this.notify()
  }

  selectPoint(row: number | null, col: number | null) {
    if (row === null || col === null) {
      this.state.selectedPoint = null
    } else {
      this.state.selectedPoint = { row, col }
    }
    this.notify()
  }

  hoverPoint(row: number | null, col: number | null) {
    const prev = this.state.hoveredPoint
    const next = (row === null || col === null) ? null : { row, col }
    // Only notify if hover actually changed (avoids re-render on every mousemove)
    const changed = (prev === null) !== (next === null)
      || (prev !== null && next !== null && (prev.row !== next.row || prev.col !== next.col))
    this.state.hoveredPoint = next
    if (changed) this.notify()
  }

  movePoint(row: number, col: number, dx: number, dy: number) {
    const p = this.state.grid.points[row][col]
    const clamp = (v: number) => Math.max(-1.5, Math.min(2.5, v))
    const newPos = {
      x: clamp(p.position.x + dx / this.state.grid.width),
      y: clamp(p.position.y + dy / this.state.grid.height),
    }
    this.state.grid.points[row][col] = { ...p, position: newPos }
    this.notify()
  }

  commitSnapshot() {
    this.snapshot()
  }

  moveHandle(
    row: number,
    col: number,
    handle: 'left' | 'right' | 'up' | 'down',
    dx: number,
    dy: number,
  ) {
    const p = this.state.grid.points[row][col]
    const w = this.state.grid.width
    const h = this.state.grid.height

    const nx = p.handles[handle].x + dx / w
    const ny = p.handles[handle].y + dy / h

    const newHandles = { ...p.handles, [handle]: { x: nx, y: ny } }

    // Mirror angle: opposite handle mirrors direction
    if (p.handles.type === 'mirrorAngle') {
      const opposite = { left: 'right', right: 'left', up: 'down', down: 'up' } as const
      const opp    = opposite[handle]
      const len    = Math.hypot(p.handles[opp].x, p.handles[opp].y)
      const newLen = Math.hypot(nx, ny)
      if (newLen > 0.0001) {
        newHandles[opp] = { x: (-nx / newLen) * len, y: (-ny / newLen) * len }
      }
    }

    this.state.grid.points[row][col] = { ...p, handles: newHandles }
    this.notify()
  }

  setPointColor(row: number, col: number, color: Color) {
    const p = this.state.grid.points[row][col]
    this.state.grid.points[row][col] = { ...p, color }
    this.notify()
    this.snapshot()
  }

  setPointOpacity(row: number, col: number, opacity: number) {
    const p = this.state.grid.points[row][col]
    const a = Math.max(0, Math.min(1, opacity))
    this.state.grid.points[row][col] = { ...p, color: { ...p.color, a } }
    this.notify()
  }

  setHandleType(row: number, col: number, type: HandleType) {
    const p = this.state.grid.points[row][col]
    this.state.grid.points[row][col] = { ...p, handles: { ...p.handles, type } }
    this.notify()
    this.snapshot()
  }

  setSubdivision(s: number) {
    this.state.subdivision = s
    this.notify()
  }

  setAnimationStyle(style: AnimationStyle) {
    this.state.animation.style = style
    const speedBounds = this.animSpeedBounds(style)
    const strengthBounds = this.animStrengthBounds(style)
    this.state.animation.speed = Math.max(speedBounds.min, Math.min(speedBounds.max, this.state.animation.speed))
    this.state.animation.strength = Math.max(strengthBounds.min, Math.min(strengthBounds.max, this.state.animation.strength))
    this.notify()
  }

  setAnimationSpeed(speed: number) {
    const b = this.animSpeedBounds(this.state.animation.style)
    this.state.animation.speed = Math.max(b.min, Math.min(b.max, speed))
    this.notify()
  }

  setAnimationStrength(strength: number) {
    const b = this.animStrengthBounds(this.state.animation.style)
    this.state.animation.strength = Math.max(b.min, Math.min(b.max, strength))
    this.notify()
  }

  setCanvasBackgroundColor(color: Color) {
    this.state.canvasBackground.color = { ...color, a: 1 }
    this.notify()
  }

  setCanvasBackgroundOpacity(opacity: number) {
    this.state.canvasBackground.opacity = Math.max(0, Math.min(1, opacity))
    this.notify()
  }

  setEffectType(type: EffectType) {
    const prevType = this.state.effect.type
    if (prevType === type) {
      this.notify()
      return
    }
    this.state.effect.type = type
    const presets: Record<Exclude<EffectType, 'none'>, { scale: number; rotate: number }> = {
      wavy: { scale: 10, rotate: 0 },
      zigzag: { scale: 20, rotate: 0 },
      zigzag3d: { scale: 20, rotate: 0 },
      circle: { scale: 10, rotate: 0 },
      isometric: { scale: 20, rotate: 0 },
      polka: { scale: 10, rotate: 0 },
      lines: { scale: 10, rotate: 0 },
      boxes: { scale: 20, rotate: 0 },
      triangle: { scale: 10, rotate: 0 },
      rhombus: { scale: 10, rotate: 0 },
    }
    if (type !== 'none') {
      const p = presets[type]
      this.state.effect.color = { r: 0xe5 / 255, g: 0xe5 / 255, b: 0xf7 / 255, a: 1 }
      this.state.effect.lineColor = { r: 0x44 / 255, g: 0x4c / 255, b: 0xf7 / 255, a: 1 }
      this.state.effect.opacity = 0.8
      this.state.effect.scale = p.scale
      this.state.effect.rotate = p.rotate
    }
    this.notify()
  }

  setEffectColor(color: Color) {
    this.state.effect.color = { ...color, a: 1 }
    this.notify()
  }

  setEffectLineColor(color: Color) {
    this.state.effect.lineColor = { ...color, a: 1 }
    this.notify()
  }

  setEffectOpacity(opacity: number) {
    this.state.effect.opacity = Math.max(0, Math.min(1, opacity))
    this.notify()
  }

  setEffectScale(scale: number) {
    this.state.effect.scale = Math.round(Math.max(4, Math.min(128, scale)))
    this.notify()
  }

  setEffectRotate(rotate: number) {
    this.state.effect.rotate = Math.max(-180, Math.min(180, rotate))
    this.notify()
  }

  setNoiseAnimated(animated: boolean) {
    this.state.noise.animated = animated
    this.notify()
  }

  setNoiseEnabled(enabled: boolean) {
    this.state.noise.enabled = enabled
    this.notify()
  }

  setNoiseIntensity(intensity: number) {
    this.state.noise.intensity = Math.max(0, Math.min(1, intensity))
    this.notify()
  }

  setNoiseColor(color: Color) {
    this.state.noise.color = { ...color, a: 1 }
    this.notify()
  }

  setNoiseSize(size: number) {
    this.state.noise.size = Math.max(0.1, Math.min(4, size))
    this.notify()
  }

  setNoiseSpeed(speed: number) {
    this.state.noise.speed = Math.max(0, Math.min(1.5, speed))
    this.notify()
  }

  resetGrid(rows: number, cols: number) {
    const { width, height } = this.state.canvasSize
    this.state.grid = createDefaultGrid(rows, cols, width, height)
    this.state.selectedPoint = null
    this.snapshot()
    this.notify()
  }

  applyPreset(colors: { r: number; g: number; b: number; a: number }[][]) {
    const { rows, cols } = this.state.grid
    const points = this.state.grid.points.map((row, r) =>
      row.map((p, c) => ({
        ...p,
        color: colors[r % colors.length][c % colors[r % colors.length].length],
      }))
    )
    this.state.grid = { ...this.state.grid, points }
    this.state.selectedPoint = null
    this.snapshot()
    this.notify()
  }

  randomize() {
    const { rows, cols, width, height } = this.state.grid
    const points = this.state.grid.points.map(row =>
      row.map(p => ({
        ...p,
        color: {
          r: Math.random(),
          g: Math.random(),
          b: Math.random(),
          a: 1,
        },
      }))
    )
    this.state.grid = { rows, cols, width, height, points }
    this.state.selectedPoint = null
    this.snapshot()
    this.notify()
  }

  getSelectedPoint(): MeshPoint | null {
    const sel = this.state.selectedPoint
    if (!sel) return null
    return this.state.grid.points[sel.row][sel.col]
  }
}

// HMR-safe singleton: preserve store instance across hot reloads
// so WebGL renderer subscriptions stay alive during development
const _win = window as typeof window & { __meshStore?: EditorStore }
if (!_win.__meshStore) {
  _win.__meshStore = new EditorStore()
}
export const store: EditorStore = _win.__meshStore
