import type { Vec2, Color, MeshPoint, MeshGrid } from './types'

// ─── Cubic Bezier ────────────────────────────────────────────────────────────

export function cubicBezier(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const l = 1 - t
  return l * l * l * p0 + 3 * l * l * t * p1 + 3 * l * t * t * p2 + t * t * t * p3
}

export function cubicBezierVec2(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  return {
    x: cubicBezier(p0.x, p1.x, p2.x, p3.x, t),
    y: cubicBezier(p0.y, p1.y, p2.y, p3.y, t),
  }
}

// ─── Coons Patch ─────────────────────────────────────────────────────────────
// Given 4 corner MeshPoints with their bezier handles,
// evaluate the position and color at parametric coords (u, v) ∈ [0,1]²

export interface PatchCorners {
  tl: MeshPoint  // top-left     (row r, col c)
  tr: MeshPoint  // top-right    (row r, col c+1)
  bl: MeshPoint  // bottom-left  (row r+1, col c)
  br: MeshPoint  // bottom-right (row r+1, col c+1)
}

// Convert normalized mesh position to pixel position
function toPixel(v: Vec2, w: number, h: number): Vec2 {
  return { x: v.x * w, y: v.y * h }
}

// Evaluate position on a Coons patch at (u, v)
// u goes left→right, v goes top→bottom
export function evalPatchPosition(patch: PatchCorners, u: number, v: number, w: number, h: number): Vec2 {
  const { tl, tr, bl, br } = patch

  // Pixel positions
  const TL = toPixel(tl.position, w, h)
  const TR = toPixel(tr.position, w, h)
  const BL = toPixel(bl.position, w, h)
  const BR = toPixel(br.position, w, h)

  // Handle scale factors (handles are stored as relative offsets)
  // Top edge: tl→tr (u direction, v=0)
  const topCurveX = cubicBezier(
    TL.x,
    TL.x + tl.handles.right.x * w,
    TR.x + tr.handles.left.x * w,
    TR.x,
    u
  )
  const topCurveY = cubicBezier(
    TL.y,
    TL.y + tl.handles.right.y * h,
    TR.y + tr.handles.left.y * h,
    TR.y,
    u
  )

  // Bottom edge: bl→br (u direction, v=1)
  const botCurveX = cubicBezier(
    BL.x,
    BL.x + bl.handles.right.x * w,
    BR.x + br.handles.left.x * w,
    BR.x,
    u
  )
  const botCurveY = cubicBezier(
    BL.y,
    BL.y + bl.handles.right.y * h,
    BR.y + br.handles.left.y * h,
    BR.y,
    u
  )

  // Left edge: tl→bl (v direction, u=0)
  const leftCurveX = cubicBezier(
    TL.x,
    TL.x + tl.handles.down.x * w,
    BL.x + bl.handles.up.x * w,
    BL.x,
    v
  )
  const leftCurveY = cubicBezier(
    TL.y,
    TL.y + tl.handles.down.y * h,
    BL.y + bl.handles.up.y * h,
    BL.y,
    v
  )

  // Right edge: tr→br (v direction, u=1)
  const rightCurveX = cubicBezier(
    TR.x,
    TR.x + tr.handles.down.x * w,
    BR.x + br.handles.up.x * w,
    BR.x,
    v
  )
  const rightCurveY = cubicBezier(
    TR.y,
    TR.y + tr.handles.down.y * h,
    BR.y + br.handles.up.y * h,
    BR.y,
    v
  )

  // Bilinear blend of corner positions (ruled surface)
  const ruledX = TL.x * (1 - u) * (1 - v) + TR.x * u * (1 - v) + BL.x * (1 - u) * v + BR.x * u * v
  const ruledY = TL.y * (1 - u) * (1 - v) + TR.y * u * (1 - v) + BL.y * (1 - u) * v + BR.y * u * v

  // Coons formula: Lc + Ld - B
  // Lc = ruled surface from left/right edges
  // Ld = ruled surface from top/bottom edges
  // B  = bilinear blend of corners
  const Lc_x = leftCurveX * (1 - u) + rightCurveX * u
  const Lc_y = leftCurveY * (1 - u) + rightCurveY * u
  const Ld_x = topCurveX * (1 - v) + botCurveX * v
  const Ld_y = topCurveY * (1 - v) + botCurveY * v

  return {
    x: Lc_x + Ld_x - ruledX,
    y: Lc_y + Ld_y - ruledY,
  }
}

// Bilinear color interpolation across the patch
export function evalPatchColor(patch: PatchCorners, u: number, v: number): Color {
  const { tl, tr, bl, br } = patch
  const w00 = (1 - u) * (1 - v)
  const w10 = u * (1 - v)
  const w01 = (1 - u) * v
  const w11 = u * v
  return {
    r: w00 * tl.color.r + w10 * tr.color.r + w01 * bl.color.r + w11 * br.color.r,
    g: w00 * tl.color.g + w10 * tr.color.g + w01 * bl.color.g + w11 * br.color.g,
    b: w00 * tl.color.b + w10 * tr.color.b + w01 * bl.color.b + w11 * br.color.b,
    a: w00 * tl.color.a + w10 * tr.color.a + w01 * bl.color.a + w11 * br.color.a,
  }
}

// ─── Tessellation ─────────────────────────────────────────────────────────────
// Generate Float32Arrays for Three.js BufferGeometry from the mesh grid

export interface TessellationResult {
  positions: Float32Array    // x, y, z per vertex
  colors: Float32Array       // r, g, b, a per vertex
  indices: Uint16Array | Uint32Array
  vertexCount: number
}

export function tessellate(grid: MeshGrid, subdivision: number = 16): TessellationResult {
  const { rows, cols, points, width, height } = grid
  const patchRows = rows - 1
  const patchCols = cols - 1

  // Each patch is divided into subdivision×subdivision quads
  const vertsPerPatchRow = subdivision + 1
  const vertsPerPatchCol = subdivision + 1
  const vertsPerPatch = vertsPerPatchRow * vertsPerPatchCol
  const totalVerts = patchRows * patchCols * vertsPerPatch
  const totalTris = patchRows * patchCols * subdivision * subdivision * 2
  const totalIndices = totalTris * 3

  const positions = new Float32Array(totalVerts * 3)
  const colors = new Float32Array(totalVerts * 4)
  // WebGL1 compatibility: use 16-bit indices when possible.
  const indices = totalVerts <= 65535
    ? new Uint16Array(totalIndices)
    : new Uint32Array(totalIndices)

  let vi = 0  // vertex index
  let ii = 0  // index index
  let baseVertex = 0

  for (let pr = 0; pr < patchRows; pr++) {
    for (let pc = 0; pc < patchCols; pc++) {
      const patch: PatchCorners = {
        tl: points[pr][pc],
        tr: points[pr][pc + 1],
        bl: points[pr + 1][pc],
        br: points[pr + 1][pc + 1],
      }

      // Generate vertices for this patch
      for (let row = 0; row <= subdivision; row++) {
        for (let col = 0; col <= subdivision; col++) {
          const u = col / subdivision
          const v = row / subdivision

          const pos = evalPatchPosition(patch, u, v, width, height)
          const col4 = evalPatchColor(patch, u, v)

          // Normalize to [-1, 1] for WebGL clip space
          positions[vi * 3 + 0] = (pos.x / width) * 2 - 1
          positions[vi * 3 + 1] = -((pos.y / height) * 2 - 1)  // flip Y
          positions[vi * 3 + 2] = 0

          colors[vi * 4 + 0] = col4.r
          colors[vi * 4 + 1] = col4.g
          colors[vi * 4 + 2] = col4.b
          colors[vi * 4 + 3] = col4.a

          vi++
        }
      }

      // Generate indices (2 triangles per quad)
      for (let row = 0; row < subdivision; row++) {
        for (let col = 0; col < subdivision; col++) {
          const v0 = baseVertex + row * vertsPerPatchRow + col
          const v1 = v0 + 1
          const v2 = v0 + vertsPerPatchRow
          const v3 = v2 + 1

          indices[ii++] = v0
          indices[ii++] = v2
          indices[ii++] = v1

          indices[ii++] = v1
          indices[ii++] = v2
          indices[ii++] = v3
        }
      }

      baseVertex += vertsPerPatch
    }
  }

  return { positions, colors, indices, vertexCount: totalVerts }
}

// ─── Default grid factory ─────────────────────────────────────────────────────

function makeId() {
  return Math.random().toString(36).slice(2, 9)
}

const DEFAULT_COLORS: Color[][] = [
  [{ r: 0.4, g: 0.2, b: 0.9, a: 1 }, { r: 0.2, g: 0.5, b: 1.0, a: 1 }, { r: 0.1, g: 0.8, b: 0.9, a: 1 }],
  [{ r: 0.7, g: 0.1, b: 0.8, a: 1 }, { r: 0.9, g: 0.3, b: 0.5, a: 1 }, { r: 0.3, g: 0.6, b: 0.9, a: 1 }],
  [{ r: 0.9, g: 0.2, b: 0.4, a: 1 }, { r: 1.0, g: 0.5, b: 0.2, a: 1 }, { r: 0.8, g: 0.8, b: 0.3, a: 1 }],
]

const HANDLE_STRENGTH = 0.15

export function createDefaultGrid(rows: number, cols: number, width: number, height: number): MeshGrid {
  const points: MeshPoint[][] = []

  for (let r = 0; r < rows; r++) {
    const row: MeshPoint[] = []
    for (let c = 0; c < cols; c++) {
      const px = c / (cols - 1)
      const py = r / (rows - 1)

      const color = DEFAULT_COLORS[r % 3][c % 3]

      row.push({
        id: makeId(),
        position: { x: px, y: py },
        color: { ...color },
        handles: {
          left:  { x: -HANDLE_STRENGTH, y: 0 },
          right: { x:  HANDLE_STRENGTH, y: 0 },
          up:    { x: 0, y: -HANDLE_STRENGTH },
          down:  { x: 0, y:  HANDLE_STRENGTH },
          type: 'mirrorAngle',
        },
      })
    }
    points.push(row)
  }

  return { rows, cols, points, width, height }
}

export function lerpColor(a: Color, b: Color, t: number): Color {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
    a: a.a + (b.a - a.a) * t,
  }
}
