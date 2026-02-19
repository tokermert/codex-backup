export interface Vec2 {
  x: number
  y: number
}

export interface Color {
  r: number  // 0-1
  g: number
  b: number
  a: number
}

export type HandleType = 'mirrorAngle' | 'mirrorLength' | 'free'
export type AnimationStyle = 'static' | 'fluid' | 'smooth' | 'pulse' | 'wave'

export interface Handles {
  left: Vec2
  right: Vec2
  up: Vec2
  down: Vec2
  type: HandleType
}

export interface MeshPoint {
  id: string
  position: Vec2        // normalized 0-1
  color: Color
  handles: Handles
}

export interface MeshGrid {
  rows: number          // number of control rows
  cols: number          // number of control cols
  points: MeshPoint[][]  // [row][col]
  width: number         // canvas width in px
  height: number        // canvas height in px
}

export interface AnimationSettings {
  style: AnimationStyle
  speed: number
  strength: number
}

export type SelectedHandle = 'left' | 'right' | 'up' | 'down' | null
