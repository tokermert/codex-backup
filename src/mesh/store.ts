import { createDefaultGrid } from './math'
import type { MeshGrid, MeshPoint, Color, Vec2, HandleType } from './types'

// Simple reactive store using callbacks
type Listener = () => void

export interface EditorState {
  grid: MeshGrid
  selectedPoint: { row: number; col: number } | null
  hoveredPoint: { row: number; col: number } | null
  canvasSize: { width: number; height: number }
  subdivision: number
}

class EditorStore {
  state: EditorState
  private listeners: Set<Listener> = new Set()
  private history: MeshGrid[] = []
  private historyIndex = -1

  constructor() {
    this.state = {
      grid: createDefaultGrid(3, 3, 800, 600),
      selectedPoint: null,
      hoveredPoint: null,
      canvasSize: { width: 800, height: 600 },
      subdivision: 20,
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
    const newPos = {
      x: Math.max(0, Math.min(1, p.position.x + dx / this.state.grid.width)),
      y: Math.max(0, Math.min(1, p.position.y + dy / this.state.grid.height)),
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
