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
export type AnimationStyle = 'static' | 'fluid' | 'smooth' | 'pulse' | 'wave' | 'waterDrop' | 'rotate'
export type EffectType =
  | 'none'
  | 'wavy'
  | 'zigzag'
  | 'zigzag3d'
  | 'circle'
  | 'isometric'
  | 'polka'
  | 'lines'
  | 'boxes'
  | 'triangle'
  | 'rhombus'
  | 'hexagon'
  | 'squares'
  | 'pixelation'
  | 'glass'

export type GlassShape = 'strips' | 'grid' | 'circle'

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

export interface CanvasBackgroundSettings {
  color: Color
  opacity: number
}

export interface EffectSettings {
  type: EffectType
  color: Color
  lineColor: Color
  opacity: number
  scale: number
  rotate: number
}

export interface NoiseSettings {
  enabled: boolean
  animated: boolean
  color: Color
  intensity: number
  size: number
  speed: number
}

export interface GlassSettings {
  shape: GlassShape
  cells: number
  distortion: number
  angle: number
  aberration: number
  ior: number
  fresnel: number
  frost: number
  bevel: number
  corner: number
  ringThickness: number
}

export interface HexagonSettings {
  color: Color
  opacity: number
  size: number
  density: number
  strokeWidth: number
  strokeOpacity: number
  randomOpacity: number
}

export interface SquaresSettings {
  color: Color
  opacity: number
  size: number
  density: number
  strokeWidth: number
  strokeOpacity: number
  randomOpacity: number
}

export interface PixelationSettings {
  pixelSize: number
  density: number
}

export type SelectedHandle = 'left' | 'right' | 'up' | 'down' | null
