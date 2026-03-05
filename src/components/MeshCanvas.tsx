import { useEffect, useRef, useCallback, useState } from 'react'
import { MeshRenderer } from '../mesh/renderer'
import type {
  CaptureImageOptions,
  CaptureImageResult,
  RecordVideoOptions,
  RecordVideoResult,
} from '../mesh/exportApi'
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

interface GlassCaptureState {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D | null
}

interface GlassGLResources {
  canvas: HTMLCanvasElement
  gl: WebGLRenderingContext
  program: WebGLProgram
  texture: WebGLTexture
  uniforms: {
    tDiffuse: WebGLUniformLocation | null
    resolution: WebGLUniformLocation | null
    uShape: WebGLUniformLocation | null
    uCells: WebGLUniformLocation | null
    uDistortion: WebGLUniformLocation | null
    uAngle: WebGLUniformLocation | null
    uAberration: WebGLUniformLocation | null
    uEdge: WebGLUniformLocation | null
    uIOR: WebGLUniformLocation | null
    uFresnel: WebGLUniformLocation | null
    uFrost: WebGLUniformLocation | null
    uBevel: WebGLUniformLocation | null
    uCornerRadius: WebGLUniformLocation | null
    uRingThickness: WebGLUniformLocation | null
  }
}

const GLASS_VERTEX_SHADER = `
  attribute vec2 a_pos;
  varying vec2 v_uv;
  void main() {
    v_uv = a_pos * 0.5 + 0.5;
    gl_Position = vec4(a_pos, 0.0, 1.0);
  }
`

const GLASS_FRAGMENT_SHADER = `
  precision highp float;
  varying vec2 v_uv;
  uniform sampler2D tDiffuse;
  uniform vec2 resolution;
  uniform int uShape;
  uniform float uCells;
  uniform float uDistortion;
  uniform float uAngle;
  uniform float uAberration;
  uniform float uEdge;
  uniform float uIOR;
  uniform float uFresnel;
  uniform float uFrost;
  uniform float uBevel;
  uniform float uCornerRadius;
  uniform float uRingThickness;

  #define PI 3.14159265359

  vec2 rotate(vec2 v, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  vec4 patternStrips(vec2 uv, float cells) {
    float stripPos = uv.x * cells;
    float localX = fract(stripPos);
    float t = (localX - 0.5) * 2.0;
    float normalX = sin(t * PI * 0.5);
    float normalY = 0.0;
    float edgeDist = cos(t * PI * 0.5);
    vec2 cellId = vec2(floor(stripPos), 0.0);
    float variation = hash(cellId) * 0.2 + 0.9;
    return vec4(normalX, normalY, edgeDist, variation);
  }

  vec4 patternGrid(vec2 uv, float cells, float bevelWidth, float cornerRadius) {
    vec2 cellPos = uv * cells;
    vec2 local = fract(cellPos) - 0.5;
    float dist;
    vec2 normal2D = vec2(0.0);
    vec2 absLocal = abs(local);

    if (cornerRadius > 0.001) {
      float k = 1.0 / (cornerRadius * 2.0 + 0.01);
      float smoothMaxVal = log(exp(k * absLocal.x) + exp(k * absLocal.y)) / k;
      dist = 0.5 - smoothMaxVal;
      float eps = 0.005;
      vec2 dxLocal = absLocal + vec2(eps, 0.0);
      vec2 dyLocal = absLocal + vec2(0.0, eps);
      float dxSmooth = log(exp(k * dxLocal.x) + exp(k * dxLocal.y)) / k;
      float dySmooth = log(exp(k * dyLocal.x) + exp(k * dyLocal.y)) / k;
      vec2 grad = vec2(dxSmooth - smoothMaxVal, dySmooth - smoothMaxVal) / eps;
      if (length(grad) > 0.01) {
        normal2D = normalize(grad) * sign(local);
      }
    } else {
      float boxD = max(absLocal.x, absLocal.y);
      dist = 0.5 - boxD;
      if (absLocal.x > absLocal.y) {
        normal2D = vec2(sign(local.x), 0.0);
      } else {
        normal2D = vec2(0.0, sign(local.y));
      }
    }

    if (dist < 0.0) return vec4(0.0, 0.0, 0.0, 1.0);

    if (bevelWidth > 0.001) {
      float refractionStrength = 1.0 - smoothstep(0.0, bevelWidth, dist);
      normal2D *= refractionStrength;
    } else {
      normal2D = vec2(0.0);
    }

    float edgeDist = bevelWidth > 0.001 ? smoothstep(0.0, bevelWidth, dist) : 1.0;
    edgeDist = clamp(edgeDist, 0.0, 1.0);
    vec2 cellId = floor(cellPos);
    float variation = hash(cellId) * 0.2 + 0.9;
    return vec4(normal2D.x, normal2D.y, edgeDist, variation);
  }

  vec4 patternCircle(vec2 uv, float cells, float ringThickness) {
    // Global concentric rings from canvas center (not per-cell circles).
    float r = length(uv);
    float ringPos = r * max(1.0, cells);
    float local = fract(ringPos);
    float t = (local - 0.5) * 2.0;
    float k = mix(2.8, 0.8, clamp(ringThickness, 0.05, 1.0));
    float tt = t * k;

    vec2 dir = r > 0.0001 ? normalize(uv) : vec2(1.0, 0.0);
    float edgeDist = clamp(cos(tt * PI * 0.5), 0.0, 1.0);
    float normalMag = sin(tt * PI * 0.5) * edgeDist;
    vec2 normal2D = dir * normalMag;

    float ringId = floor(ringPos);
    float variation = hash(vec2(ringId, 0.0)) * 0.2 + 0.9;
    return vec4(normal2D.x, normal2D.y, edgeDist, variation);
  }

  vec4 getPattern(vec2 uv, float cells, int shape, float bevelWidth, float cornerRadius, float ringThickness) {
    if (shape == 0) return patternStrips(uv, cells);
    if (shape == 1) return patternGrid(uv, cells, bevelWidth, cornerRadius);
    if (shape == 2) return patternCircle(uv, cells, ringThickness);
    return patternStrips(uv, cells);
  }

  vec2 refract2D(vec2 incident, vec2 normal, float eta) {
    float cosI = -dot(incident, normal);
    float sinT2 = eta * eta * (1.0 - cosI * cosI);
    if (sinT2 > 1.0) return reflect(incident, normal);
    float cosT = sqrt(1.0 - sinT2);
    return eta * incident + (eta * cosI - cosT) * normal;
  }

  float fresnelSchlick(float cosTheta, float ior) {
    float r0 = pow((1.0 - ior) / (1.0 + ior), 2.0);
    return r0 + (1.0 - r0) * pow(1.0 - cosTheta, 5.0);
  }

  vec3 kawaseBlur(vec2 uv, vec2 pixelSize, float radius) {
    vec3 c = vec3(0.0);
    vec2 o = pixelSize * radius;
    c += texture2D(tDiffuse, clamp(uv, vec2(0.0), vec2(1.0))).rgb * 0.4;
    c += texture2D(tDiffuse, clamp(uv + vec2(-o.x, 0.0), vec2(0.0), vec2(1.0))).rgb * 0.15;
    c += texture2D(tDiffuse, clamp(uv + vec2( o.x, 0.0), vec2(0.0), vec2(1.0))).rgb * 0.15;
    c += texture2D(tDiffuse, clamp(uv + vec2(0.0, -o.y), vec2(0.0), vec2(1.0))).rgb * 0.15;
    c += texture2D(tDiffuse, clamp(uv + vec2(0.0,  o.y), vec2(0.0), vec2(1.0))).rgb * 0.15;
    return c;
  }

  vec3 frostBlur(vec2 uv, vec2 pixelSize, float frostAmount) {
    if (frostAmount < 0.01) return texture2D(tDiffuse, clamp(uv, vec2(0.0), vec2(1.0))).rgb;
    float maxRadius = 20.0;
    float baseRadius = frostAmount * maxRadius;
    vec3 c = vec3(0.0);
    if (frostAmount < 1.0) {
      c += kawaseBlur(uv, pixelSize, baseRadius * 0.3) * 0.2;
      c += kawaseBlur(uv, pixelSize, baseRadius * 0.6) * 0.3;
      c += kawaseBlur(uv, pixelSize, baseRadius * 1.0) * 0.5;
    } else {
      c += kawaseBlur(uv, pixelSize, baseRadius * 0.25) * 0.1;
      c += kawaseBlur(uv, pixelSize, baseRadius * 0.5)  * 0.2;
      c += kawaseBlur(uv, pixelSize, baseRadius * 0.75) * 0.3;
      c += kawaseBlur(uv, pixelSize, baseRadius * 1.0)  * 0.4;
    }
    return c;
  }

  vec3 sampleWithFrost(vec2 uv, vec2 pixelSize, float frostAmount) {
    if (frostAmount < 0.01) return texture2D(tDiffuse, clamp(uv, vec2(0.0), vec2(1.0))).rgb;
    return frostBlur(uv, pixelSize, frostAmount);
  }

  vec3 sampleWithAberration(vec2 baseUV, vec2 refractOffset, float aberration, vec2 pixelSize, float frostAmount) {
    if (aberration < 0.01) return sampleWithFrost(baseUV + refractOffset, pixelSize, frostAmount);
    float dispersionStrength = aberration * 0.5;
    vec3 color = vec3(0.0);
    vec3 weights = vec3(0.0);
    int samples = 24;
    if (frostAmount > 0.01) samples = frostAmount < 1.0 ? 12 : 8;
    for (int i = 0; i < 24; i++) {
      if (i >= samples) break;
      float t = float(i) / float(samples - 1);
      float scale = 1.0 + (t - 0.5) * 2.0 * dispersionStrength;
      vec2 sampleUV = baseUV + refractOffset * scale;
      vec3 texSample = sampleWithFrost(sampleUV, pixelSize, frostAmount);
      float rWeight = exp(-4.0 * t * t);
      float gWeight = exp(-4.0 * (t - 0.5) * (t - 0.5));
      float bWeight = exp(-4.0 * (t - 1.0) * (t - 1.0));
      color.r += texSample.r * rWeight;
      color.g += texSample.g * gWeight;
      color.b += texSample.b * bWeight;
      weights += vec3(rWeight, gWeight, bWeight);
    }
    return color / max(weights, vec3(0.001));
  }

  void main() {
    vec2 uv = v_uv;
    vec2 pixelSize = 1.0 / resolution;
    float aspect = resolution.x / resolution.y;
    vec2 centeredUV = uv - 0.5;
    vec2 aspectCorrectedUV = vec2(centeredUV.x * aspect, centeredUV.y);
    vec2 rotatedUV = rotate(aspectCorrectedUV, uAngle);

    vec4 pattern = getPattern(rotatedUV, uCells, uShape, uBevel, uCornerRadius, uRingThickness);
    vec2 surfaceNormal = pattern.xy;
    float edgeDist = pattern.z;
    float cellVariation = pattern.w;

    surfaceNormal = rotate(surfaceNormal, -uAngle);
    surfaceNormal.x /= aspect;
    surfaceNormal *= cellVariation;

    float cosTheta = max(edgeDist, 0.1);
    float eta = 1.0 / uIOR;
    vec2 incident = vec2(0.0, -1.0);
    vec2 refracted = refract2D(incident, surfaceNormal, eta);
    float edgeBoost = 1.0 + (1.0 - edgeDist) * 0.3;
    vec2 refractOffset = (refracted - incident) * pixelSize * uDistortion * 0.5 * edgeBoost;

    vec3 color = sampleWithAberration(uv, refractOffset, uAberration, pixelSize, uFrost);
    float fresnelFactor = fresnelSchlick(cosTheta, uIOR);
    if (uFresnel > 0.01) {
      color = mix(color, color * 1.3 + vec3(0.1), fresnelFactor * uFresnel * 0.5);
    }
    gl_FragColor = vec4(color, 1.0);
  }
`

export default function MeshCanvas() {
  const glCanvasRef  = useRef<HTMLCanvasElement>(null)
  const pixelationCanvasRef = useRef<HTMLCanvasElement>(null)
  const hexagonCanvasRef = useRef<HTMLCanvasElement>(null)
  const squaresCanvasRef = useRef<HTMLCanvasElement>(null)
  const glassCanvasRef = useRef<HTMLCanvasElement>(null)
  const noiseCanvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef   = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef  = useRef<MeshRenderer | null>(null)
  const dragRef      = useRef<DragState | null>(null)
  const reducedMotionRef = useRef(false)
  const noiseScratchRef = useRef<{
    canvas: HTMLCanvasElement
    ctx: CanvasRenderingContext2D | null
    imageData: ImageData | null
    w: number
    h: number
  } | null>(null)
  const pixelationScratchRef = useRef<{
    canvas: HTMLCanvasElement
    ctx: CanvasRenderingContext2D | null
    cols: number
    rows: number
  } | null>(null)
  const hexagonDrawKeyRef = useRef('')
  const squaresDrawKeyRef = useRef('')
  const glassCaptureRef = useRef<GlassCaptureState | null>(null)
  const glassGLRef = useRef<GlassGLResources | null>(null)
  const exportRenderLockRef = useRef(false)
  const exportScaleRef = useRef<1 | 2 | 3>(1)
  const [cursor, setCursor] = useState<'crosshair' | 'grab' | 'grabbing'>('crosshair')

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { reducedMotionRef.current = mql.matches }
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [])

  const initGlassGL = useCallback(() => {
    if (glassGLRef.current) return glassGLRef.current

    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl', { premultipliedAlpha: false })
    if (!gl) return null

    const compileShader = (type: number, source: string) => {
      const shader = gl.createShader(type)
      if (!shader) return null
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Glass shader compile error:', gl.getShaderInfoLog(shader))
        gl.deleteShader(shader)
        return null
      }
      return shader
    }

    const vs = compileShader(gl.VERTEX_SHADER, GLASS_VERTEX_SHADER)
    const fs = compileShader(gl.FRAGMENT_SHADER, GLASS_FRAGMENT_SHADER)
    if (!vs || !fs) return null

    const program = gl.createProgram()
    if (!program) return null
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Glass program link error:', gl.getProgramInfoLog(program))
      gl.deleteProgram(program)
      return null
    }

    const buf = gl.createBuffer()
    if (!buf) {
      gl.deleteProgram(program)
      return null
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const posLoc = gl.getAttribLocation(program, 'a_pos')
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    const texture = gl.createTexture()
    if (!texture) {
      gl.deleteBuffer(buf)
      gl.deleteProgram(program)
      return null
    }
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

    const uniforms = {
      tDiffuse: gl.getUniformLocation(program, 'tDiffuse'),
      resolution: gl.getUniformLocation(program, 'resolution'),
      uShape: gl.getUniformLocation(program, 'uShape'),
      uCells: gl.getUniformLocation(program, 'uCells'),
      uDistortion: gl.getUniformLocation(program, 'uDistortion'),
      uAngle: gl.getUniformLocation(program, 'uAngle'),
      uAberration: gl.getUniformLocation(program, 'uAberration'),
      uEdge: gl.getUniformLocation(program, 'uEdge'),
      uIOR: gl.getUniformLocation(program, 'uIOR'),
      uFresnel: gl.getUniformLocation(program, 'uFresnel'),
      uFrost: gl.getUniformLocation(program, 'uFrost'),
      uBevel: gl.getUniformLocation(program, 'uBevel'),
      uCornerRadius: gl.getUniformLocation(program, 'uCornerRadius'),
      uRingThickness: gl.getUniformLocation(program, 'uRingThickness'),
    }

    glassGLRef.current = { canvas, gl, program, texture, uniforms }
    return glassGLRef.current
  }, [])

  const drawGlassOverlay = useCallback(() => {
    const canvas = glassCanvasRef.current
    const sourceCanvas = glCanvasRef.current
    if (!canvas || !sourceCanvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { effect, glass, canvasBackground } = store.state
    const exportScale = exportScaleRef.current
    const W = canvas.width
    const H = canvas.height
    if (W <= 0 || H <= 0) return

    if (effect.type !== 'glass') {
      ctx.clearRect(0, 0, W, H)
      return
    }

    const resources = initGlassGL()
    if (!resources) {
      ctx.clearRect(0, 0, W, H)
      return
    }

    let capture = glassCaptureRef.current
    if (!capture) {
      const capCanvas = document.createElement('canvas')
      capture = { canvas: capCanvas, ctx: capCanvas.getContext('2d') }
      glassCaptureRef.current = capture
    }
    if (capture.canvas.width !== W || capture.canvas.height !== H) {
      capture.canvas.width = W
      capture.canvas.height = H
    }
    capture.ctx?.clearRect(0, 0, W, H)
    if (capture.ctx) {
      const bg = canvasBackground.color
      const bgOpacity = Math.max(0, Math.min(1, canvasBackground.opacity))
      const br = Math.round(Math.max(0, Math.min(1, bg.r)) * 255)
      const bgc = Math.round(Math.max(0, Math.min(1, bg.g)) * 255)
      const bb = Math.round(Math.max(0, Math.min(1, bg.b)) * 255)

      // Match viewport behavior: when background is translucent, keep checkerboard in the refraction source.
      if (bgOpacity < 0.999) {
        const tile = 20
        const half = tile / 2
        capture.ctx.fillStyle = '#d9d9d9'
        capture.ctx.fillRect(0, 0, W, H)
        capture.ctx.fillStyle = 'rgba(255,255,255,0.55)'
        for (let y = 0; y < H; y += tile) {
          for (let x = 0; x < W; x += tile) {
            capture.ctx.fillRect(x, y, half, half)
            capture.ctx.fillRect(x + half, y + half, half, half)
          }
        }
      }

      capture.ctx.fillStyle = `rgba(${br}, ${bgc}, ${bb}, ${bgOpacity})`
      capture.ctx.fillRect(0, 0, W, H)
      capture.ctx.drawImage(sourceCanvas, 0, 0, W, H)
    }

    const { gl, program, texture, uniforms } = resources
    resources.canvas.width = W
    resources.canvas.height = H
    gl.viewport(0, 0, W, H)
    gl.useProgram(program)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, capture.canvas)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0)

    if (uniforms.tDiffuse) gl.uniform1i(uniforms.tDiffuse, 0)
    if (uniforms.resolution) gl.uniform2f(uniforms.resolution, W, H)
    if (uniforms.uCells) gl.uniform1f(uniforms.uCells, glass.cells)
    if (uniforms.uDistortion) gl.uniform1f(uniforms.uDistortion, glass.distortion * exportScale)
    if (uniforms.uFrost) gl.uniform1f(uniforms.uFrost, glass.frost * exportScale)
    if (uniforms.uIOR) gl.uniform1f(uniforms.uIOR, glass.ior)
    if (uniforms.uFresnel) gl.uniform1f(uniforms.uFresnel, glass.fresnel)
    if (uniforms.uBevel) gl.uniform1f(uniforms.uBevel, glass.shape === 'grid' ? glass.bevel : 0)
    if (uniforms.uCornerRadius) gl.uniform1f(uniforms.uCornerRadius, glass.shape === 'grid' ? glass.corner : 0)
    if (uniforms.uRingThickness) gl.uniform1f(uniforms.uRingThickness, glass.ringThickness)
    if (uniforms.uAberration) gl.uniform1f(uniforms.uAberration, glass.aberration)
    if (uniforms.uAngle) gl.uniform1f(uniforms.uAngle, glass.shape === 'circle' ? 0 : ((glass.angle * Math.PI) / 180))
    if (uniforms.uEdge) gl.uniform1f(uniforms.uEdge, 0.5)
    if (uniforms.uShape) {
      const shapeId = glass.shape === 'strips' ? 0 : (glass.shape === 'grid' ? 1 : 2)
      gl.uniform1i(uniforms.uShape, shapeId)
    }

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    ctx.clearRect(0, 0, W, H)
    ctx.drawImage(resources.canvas, 0, 0)
  }, [initGlassGL])

  const drawHexagonOverlay = useCallback(() => {
    const canvas = hexagonCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { effect, hexagon } = store.state
    const exportScale = exportScaleRef.current
    const W = canvas.width
    const H = canvas.height
    if (W <= 0 || H <= 0) return

    if (effect.type !== 'hexagon') {
      if (hexagonDrawKeyRef.current !== '') {
        ctx.clearRect(0, 0, W, H)
        hexagonDrawKeyRef.current = ''
      }
      return
    }

    const key = [
      W,
      H,
      hexagon.color.r.toFixed(4),
      hexagon.color.g.toFixed(4),
      hexagon.color.b.toFixed(4),
      hexagon.opacity.toFixed(4),
      hexagon.size.toFixed(4),
      hexagon.density.toFixed(4),
      hexagon.strokeWidth.toFixed(4),
      hexagon.strokeOpacity.toFixed(4),
      hexagon.randomOpacity.toFixed(4),
    ].join('|')
    if (key === hexagonDrawKeyRef.current) return
    hexagonDrawKeyRef.current = key

    const fillBaseAlpha = Math.max(0, Math.min(1, hexagon.opacity / 100))
    const size = Math.max(20, Math.min(150, hexagon.size)) * exportScale
    const density = Math.max(0.1, Math.min(1, hexagon.density))
    const strokeWidth = Math.max(0.5, Math.min(5, hexagon.strokeWidth)) * exportScale
    const strokeOpacity = Math.max(0, Math.min(1, hexagon.strokeOpacity))
    const randomOpacity = Math.max(0, Math.min(1, hexagon.randomOpacity))

    const cr = Math.round(Math.max(0, Math.min(1, hexagon.color.r)) * 255)
    const cg = Math.round(Math.max(0, Math.min(1, hexagon.color.g)) * 255)
    const cb = Math.round(Math.max(0, Math.min(1, hexagon.color.b)) * 255)
    const rgba = (a: number) => `rgba(${cr},${cg},${cb},${Math.max(0, Math.min(1, a))})`

    const width = size
    const height = size * 0.8660254037844386
    const xOffset = width * 0.75
    const yOffset = height
    const cols = Math.ceil(W / xOffset) + 2
    const rows = Math.ceil(H / yOffset) + 2

    const hash2 = (x: number, y: number, salt: number) => {
      const n = Math.sin((x + salt) * 127.1 + (y + salt) * 311.7) * 43758.5453123
      return n - Math.floor(n)
    }

    ctx.clearRect(0, 0, W, H)
    ctx.lineJoin = 'miter'
    ctx.lineCap = 'butt'
    ctx.lineWidth = strokeWidth
    ctx.strokeStyle = rgba(strokeOpacity)

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (hash2(col, row, 11) > density) continue

        const x = col * xOffset
        const y = row * yOffset + (col % 2 === 1 ? yOffset / 2 : 0)
        const opacityNoise = Math.max(0, Math.min(1, 1 - randomOpacity + hash2(col, row, 47) * randomOpacity))
        const fillOpacity = fillBaseAlpha * opacityNoise

        ctx.beginPath()
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i
          const hx = x + (size / 2) * Math.cos(angle)
          const hy = y + (size / 2) * Math.sin(angle)
          if (i === 0) ctx.moveTo(hx, hy)
          else ctx.lineTo(hx, hy)
        }
        ctx.closePath()
        ctx.fillStyle = rgba(fillOpacity)
        ctx.fill()
        if (strokeOpacity > 0 && strokeWidth > 0) ctx.stroke()
      }
    }
  }, [])

  const drawSquaresOverlay = useCallback(() => {
    const canvas = squaresCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { effect, squares } = store.state
    const exportScale = exportScaleRef.current
    const W = canvas.width
    const H = canvas.height
    if (W <= 0 || H <= 0) return

    if (effect.type !== 'squares') {
      if (squaresDrawKeyRef.current !== '') {
        ctx.clearRect(0, 0, W, H)
        squaresDrawKeyRef.current = ''
      }
      return
    }

    const key = [
      W,
      H,
      squares.color.r.toFixed(4),
      squares.color.g.toFixed(4),
      squares.color.b.toFixed(4),
      squares.opacity.toFixed(4),
      squares.size.toFixed(4),
      squares.density.toFixed(4),
      squares.strokeWidth.toFixed(4),
      squares.strokeOpacity.toFixed(4),
      squares.randomOpacity.toFixed(4),
    ].join('|')
    if (key === squaresDrawKeyRef.current) return
    squaresDrawKeyRef.current = key

    const fillBaseAlpha = Math.max(0, Math.min(1, squares.opacity / 100))
    const size = Math.max(20, Math.min(150, squares.size)) * exportScale
    const density = Math.max(0.1, Math.min(1, squares.density))
    const strokeWidth = Math.max(1, Math.min(8, squares.strokeWidth)) * exportScale
    const strokeOpacity = Math.max(0, Math.min(1, squares.strokeOpacity))
    const randomOpacity = Math.max(0, Math.min(1, squares.randomOpacity))

    const cr = Math.round(Math.max(0, Math.min(1, squares.color.r)) * 255)
    const cg = Math.round(Math.max(0, Math.min(1, squares.color.g)) * 255)
    const cb = Math.round(Math.max(0, Math.min(1, squares.color.b)) * 255)
    const rgba = (a: number) => `rgba(${cr},${cg},${cb},${Math.max(0, Math.min(1, a))})`

    const cols = Math.ceil(W / size) + 1
    const rows = Math.ceil(H / size) + 1

    const hash2 = (x: number, y: number, salt: number) => {
      const n = Math.sin((x + salt) * 127.1 + (y + salt) * 311.7) * 43758.5453123
      return n - Math.floor(n)
    }

    ctx.clearRect(0, 0, W, H)
    ctx.lineWidth = strokeWidth
    ctx.strokeStyle = rgba(strokeOpacity)

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (hash2(col, row, 17) > density) continue

        const x = col * size
        const y = row * size
        const opacityNoise = Math.max(0, Math.min(1, 1 - randomOpacity + hash2(col, row, 59) * randomOpacity))
        const fillOpacity = fillBaseAlpha * opacityNoise

        ctx.fillStyle = rgba(fillOpacity)
        ctx.fillRect(x, y, size, size)
        if (strokeOpacity > 0 && strokeWidth > 0) ctx.strokeRect(x, y, size, size)
      }
    }
  }, [])

  // ── Pixelation post-fx (ported from pixelation-effect.html) ───────────────
  const drawPixelationOverlay = useCallback(() => {
    const canvas = pixelationCanvasRef.current
    const sourceCanvas = glCanvasRef.current
    if (!canvas || !sourceCanvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { effect, pixelation } = store.state
    const exportScale = exportScaleRef.current
    const W = canvas.width
    const H = canvas.height
    if (W <= 0 || H <= 0) return

    if (effect.type !== 'pixelation') {
      ctx.clearRect(0, 0, W, H)
      return
    }

    const pixelSize = Math.max(2, Math.round((pixelation.pixelSize || 12) * exportScale))
    const density = Math.max(0.1, Math.min(1, pixelation.density))
    const cols = Math.ceil(W / pixelSize)
    const rows = Math.ceil(H / pixelSize)

    let scratch = pixelationScratchRef.current
    if (!scratch) {
      const tiny = document.createElement('canvas')
      scratch = {
        canvas: tiny,
        ctx: tiny.getContext('2d'),
        cols: 0,
        rows: 0,
      }
      pixelationScratchRef.current = scratch
    }

    if (scratch.cols !== cols || scratch.rows !== rows) {
      scratch.canvas.width = cols
      scratch.canvas.height = rows
      scratch.cols = cols
      scratch.rows = rows
    }

    const tc = scratch.ctx
    if (!tc) return
    tc.imageSmoothingEnabled = true
    tc.clearRect(0, 0, cols, rows)
    tc.drawImage(sourceCanvas, 0, 0, cols, rows)
    const pixels = tc.getImageData(0, 0, cols, rows).data

    ctx.clearRect(0, 0, W, H)
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const idx = (row * cols + col) * 4
        const r = pixels[idx]
        const g = pixels[idx + 1]
        const b = pixels[idx + 2]

        const px = col * pixelSize
        const py = row * pixelSize
        const blockW = Math.max(1, Math.floor(pixelSize * density))
        const blockH = Math.max(1, Math.floor(pixelSize * density))
        const marginX = Math.floor((pixelSize - blockW) / 2)
        const marginY = Math.floor((pixelSize - blockH) / 2)

        ctx.fillStyle = `rgb(${r},${g},${b})`
        ctx.fillRect(px + marginX, py + marginY, blockW, blockH)
      }
    }
  }, [])

  // ── Film grain overlay (reference technique: per-frame ImageData noise) ───
  const drawNoiseOverlay = useCallback((tSec: number) => {
    const canvas = noiseCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { noise } = store.state
    const exportScale = exportScaleRef.current
    const W = canvas.width
    const H = canvas.height
    if (W <= 0 || H <= 0) return

    if (!noise.enabled || noise.intensity <= 0.0001) {
      ctx.clearRect(0, 0, W, H)
      return
    }

    const intensity = noise.intensity
    const size = Math.max(0.5, noise.size * exportScale)
    const speed = Math.max(0, noise.speed)
    const tintR = Math.max(0, Math.min(1, noise.color.r))
    const tintG = Math.max(0, Math.min(1, noise.color.g))
    const tintB = Math.max(0, Math.min(1, noise.color.b))
    const downW = Math.max(1, Math.floor(W / size))
    const downH = Math.max(1, Math.floor(H / size))
    const frameFloat = noise.animated ? (tSec * speed * 60) : 0
    const seed0 = Math.floor(frameFloat)
    const seed1 = seed0 + 1
    const t = frameFloat - seed0
    const blend = t * t * (3 - 2 * t)

    let scratch = noiseScratchRef.current
    if (!scratch) {
      const off = document.createElement('canvas')
      scratch = {
        canvas: off,
        ctx: off.getContext('2d'),
        imageData: null,
        w: 0,
        h: 0,
      }
      noiseScratchRef.current = scratch
    }

    if (scratch.w !== downW || scratch.h !== downH || !scratch.imageData) {
      scratch.canvas.width = downW
      scratch.canvas.height = downH
      scratch.imageData = ctx.createImageData(downW, downH)
      scratch.w = downW
      scratch.h = downH
    }

    const img = scratch.imageData
    const data = img.data

    for (let i = 0; i < data.length; i += 4) {
      const p = i / 4
      const idx0 = p + seed0 * 12345
      const idx1 = p + seed1 * 12345
      const rr0 = Math.sin(idx0 * 127.1 + seed0) * 43758.5453
      const rr1 = Math.sin(idx1 * 127.1 + seed1) * 43758.5453
      const r0 = rr0 - Math.floor(rr0)
      const r1 = rr1 - Math.floor(rr1)
      const r = noise.animated ? (r0 * (1 - blend) + r1 * blend) : r0
      const grain = (r - 0.5) * 255 * intensity
      const mag = Math.abs(grain)
      // Stronger tint response: selected color pushes grain highlights/shadows per channel.
      const tr = tintR * 2 - 1
      const tg = tintG * 2 - 1
      const tb = tintB * 2 - 1
      data[i] = Math.max(0, Math.min(255, 128 + grain + tr * mag * 1.45))
      data[i + 1] = Math.max(0, Math.min(255, 128 + grain + tg * mag * 1.45))
      data[i + 2] = Math.max(0, Math.min(255, 128 + grain + tb * mag * 1.45))
      data[i + 3] = Math.min(255, Math.abs(grain) * 2.2)
    }

    scratch.ctx?.putImageData(img, 0, 0)

    ctx.clearRect(0, 0, W, H)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(scratch.canvas, 0, 0, W, H)
  }, [])

  // ── Draw overlay (mesh lines + points + handles) ──────────────────────────
  const drawOverlay = useCallback(() => {
    const canvas = overlayRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (!store.state.showMeshOverlay) return
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

  const renderAllLayersAtTime = useCallback((tSec: number, refreshGeometry = false) => {
    const renderer = rendererRef.current
    if (!renderer) throw new Error('Renderer hazir degil')

    const { grid, subdivision, canvasBackground, effect } = store.state
    const exportScale = exportScaleRef.current
    renderer.subdivision = subdivision
    renderer.setBackground(canvasBackground)
    const effectForRender = exportScale > 1
      ? { ...effect, scale: effect.scale * exportScale }
      : effect
    renderer.setEffect(effectForRender)
    if (refreshGeometry) renderer.update(grid)

    const anim = store.state.animation
    const effectiveAnimation: AnimationSettings = reducedMotionRef.current
      ? { ...anim, style: 'static', strength: 0 }
      : anim
    renderer.setAnimation(effectiveAnimation, tSec)
    renderer.render()
    drawPixelationOverlay()
    drawHexagonOverlay()
    drawSquaresOverlay()
    drawGlassOverlay()
    drawNoiseOverlay(tSec)
  }, [drawGlassOverlay, drawHexagonOverlay, drawNoiseOverlay, drawPixelationOverlay, drawSquaresOverlay])

  const beginExportRender = useCallback((scale: 1 | 2 | 3) => {
    const renderer = rendererRef.current
    const gl = glCanvasRef.current
    const pixelation = pixelationCanvasRef.current
    const hexagon = hexagonCanvasRef.current
    const squares = squaresCanvasRef.current
    const glass = glassCanvasRef.current
    const noise = noiseCanvasRef.current
    if (!renderer || !gl || !pixelation || !hexagon || !squares || !glass || !noise) {
      throw new Error('Export katmanlari hazir degil')
    }

    const baseW = Math.max(1, Math.round(store.state.artboardSize.width || store.state.canvasSize.width))
    const baseH = Math.max(1, Math.round(store.state.artboardSize.height || store.state.canvasSize.height))
    const outW = baseW * scale
    const outH = baseH * scale

    const layers = [pixelation, hexagon, squares, glass, noise]
    const prevViewport = {
      w: Math.max(1, Math.round(store.state.canvasSize.width)),
      h: Math.max(1, Math.round(store.state.canvasSize.height)),
    }
    const prevPixelRatio = renderer.renderer.getPixelRatio()
    const prevLayers = layers.map(layer => ({ layer, w: layer.width, h: layer.height }))
    let restored = false

    exportRenderLockRef.current = true
    exportScaleRef.current = scale
    // Export at exact target pixels. Avoid multiplying with device DPR,
    // which can exceed GPU texture limits and cause black edge artifacts.
    renderer.renderer.setPixelRatio(1)
    renderer.setSize(outW, outH)
    for (const layer of layers) {
      layer.width = outW
      layer.height = outH
    }

    const restore = () => {
      if (restored) return
      restored = true
      renderer.renderer.setPixelRatio(prevPixelRatio)
      renderer.setSize(prevViewport.w, prevViewport.h)
      for (const item of prevLayers) {
        item.layer.width = item.w
        item.layer.height = item.h
      }
      exportRenderLockRef.current = false
      exportScaleRef.current = 1
      try {
        renderAllLayersAtTime(performance.now() / 1000, true)
      } catch {
        // no-op: app loop will recover on next frame
      }
    }

    return { width: outW, height: outH, restore }
  }, [renderAllLayersAtTime])

  const composeLayersToCanvas = useCallback((target: HTMLCanvasElement, scale: 1 | 2 | 3) => {
    const gl = glCanvasRef.current
    if (!gl) throw new Error('Canvas hazir degil')
    const baseW = Math.max(1, Math.round(store.state.artboardSize.width || store.state.canvasSize.width))
    const baseH = Math.max(1, Math.round(store.state.artboardSize.height || store.state.canvasSize.height))
    const outW = baseW * scale
    const outH = baseH * scale

    if (target.width !== outW) target.width = outW
    if (target.height !== outH) target.height = outH
    const ctx = target.getContext('2d')
    if (!ctx) throw new Error('2D context alinamadi')

    ctx.clearRect(0, 0, outW, outH)
    ctx.imageSmoothingEnabled = true

    const layers: Array<{ canvas: HTMLCanvasElement | null; blend: GlobalCompositeOperation }> = [
      { canvas: glCanvasRef.current, blend: 'source-over' },
      { canvas: pixelationCanvasRef.current, blend: 'source-over' },
      { canvas: hexagonCanvasRef.current, blend: 'source-over' },
      { canvas: squaresCanvasRef.current, blend: 'source-over' },
      { canvas: glassCanvasRef.current, blend: 'source-over' },
      // Preview uses CSS mix-blend-mode: overlay for grain; mirror that in export.
      { canvas: noiseCanvasRef.current, blend: 'overlay' },
    ]

    for (const layer of layers) {
      if (!layer.canvas) continue
      const lw = layer.canvas.width
      const lh = layer.canvas.height
      if (lw <= 0 || lh <= 0) continue
      ctx.save()
      ctx.globalCompositeOperation = layer.blend
      ctx.drawImage(layer.canvas, 0, 0, lw, lh, 0, 0, outW, outH)
      ctx.restore()
    }

    return { width: outW, height: outH }
  }, [])

  const canvasToBlob = useCallback((canvas: HTMLCanvasElement, type: string, quality?: number) => {
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => {
        if (!blob) {
          reject(new Error('Blob uretilmedi'))
          return
        }
        resolve(blob)
      }, type, quality)
    })
  }, [])

  const captureImage = useCallback(async (options: CaptureImageOptions): Promise<CaptureImageResult> => {
    const exportSession = beginExportRender(options.scale)
    const composed = document.createElement('canvas')
    let width = exportSession.width
    let height = exportSession.height

    try {
      renderAllLayersAtTime(performance.now() / 1000, true)
      const composedSize = composeLayersToCanvas(composed, options.scale)
      width = composedSize.width
      height = composedSize.height

      if (options.format === 'png') {
        const blob = await canvasToBlob(composed, 'image/png')
        return { blob, ext: 'png', mime: 'image/png', width, height }
      }

      if (options.format === 'jpeg') {
        const opaque = document.createElement('canvas')
        opaque.width = width
        opaque.height = height
        const ctx = opaque.getContext('2d')
        if (!ctx) throw new Error('JPEG surface olusturulamadi')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(composed, 0, 0)
        const blob = await canvasToBlob(opaque, 'image/jpeg', 1)
        return { blob, ext: 'jpg', mime: 'image/jpeg', width, height }
      }

      // SVG wrapper (raster embedded) to support full effect stack.
      const pngDataUrl = composed.toDataURL('image/png')
      const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <image href="${pngDataUrl}" width="${width}" height="${height}" />
</svg>`
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
      return { blob, ext: 'svg', mime: 'image/svg+xml', width, height }
    } finally {
      exportSession.restore()
    }
  }, [beginExportRender, canvasToBlob, composeLayersToCanvas, renderAllLayersAtTime])

  const recordVideo = useCallback(async (options: RecordVideoOptions): Promise<RecordVideoResult> => {
    if (!('MediaRecorder' in window)) {
      throw new Error('Bu tarayicida video export desteklenmiyor')
    }

    const exportSession = beginExportRender(options.scale)
    const captureCanvas = document.createElement('canvas')
    const { width, height } = composeLayersToCanvas(captureCanvas, options.scale)
    if (!captureCanvas.captureStream) {
      exportSession.restore()
      throw new Error('captureStream desteklenmiyor')
    }

    const pickMime = (format: 'webm' | 'mp4') => {
      const mp4 = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4']
      const webm = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
      const preferred = format === 'mp4' ? mp4 : webm
      const fallback = format === 'mp4' ? webm : []
      for (const mime of [...preferred, ...fallback]) {
        if (MediaRecorder.isTypeSupported(mime)) {
          const ext = mime.includes('mp4') ? 'mp4' : 'webm'
          return { mime, ext: ext as 'mp4' | 'webm' }
        }
      }
      throw new Error('Uygun video codec bulunamadi')
    }

    let mime: string
    let ext: 'webm' | 'mp4'
    let stream: MediaStream
    let recorder: MediaRecorder
    try {
      const picked = pickMime(options.format)
      mime = picked.mime
      ext = picked.ext
      stream = captureCanvas.captureStream(options.fps)
      recorder = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: 10_000_000,
      })
    } catch (err) {
      exportSession.restore()
      throw err
    }
    const usedFallback = options.format === 'mp4' && ext !== 'mp4'

    const chunks: BlobPart[] = []
    recorder.ondataavailable = e => {
      if (e.data && e.data.size > 0) chunks.push(e.data)
    }

    const startMs = performance.now()
    renderAllLayersAtTime(startMs / 1000, true)
    composeLayersToCanvas(captureCanvas, options.scale)

    const draw = () => {
      const tSec = (startMs + (performance.now() - startMs)) / 1000
      renderAllLayersAtTime(tSec, false)
      composeLayersToCanvas(captureCanvas, options.scale)
    }

    return new Promise<RecordVideoResult>((resolve, reject) => {
      let intervalId = 0
      let timeoutId = 0
      const cleanup = () => {
        if (intervalId) window.clearInterval(intervalId)
        if (timeoutId) window.clearTimeout(timeoutId)
        stream.getTracks().forEach(track => track.stop())
        exportSession.restore()
      }

      recorder.onerror = () => {
        cleanup()
        reject(new Error('MediaRecorder hatasi'))
      }

      recorder.onstop = () => {
        cleanup()
        if (chunks.length === 0) {
          reject(new Error('Video kaydi bos cikti'))
          return
        }
        const blob = new Blob(chunks, { type: mime })
        resolve({ blob, ext, mime, width, height, usedFallback })
      }

      try {
        draw()
        recorder.start()
        intervalId = window.setInterval(draw, 1000 / options.fps)
        timeoutId = window.setTimeout(() => {
          if (recorder.state !== 'inactive') recorder.stop()
        }, Math.max(1, options.durationSec) * 1000)
      } catch (err) {
        cleanup()
        reject(err instanceof Error ? err : new Error('Video kaydi baslatilamadi'))
      }
    })
  }, [beginExportRender, composeLayersToCanvas, renderAllLayersAtTime])

  useEffect(() => {
    window.__meshExportApi = { captureImage, recordVideo }
    return () => {
      delete window.__meshExportApi
    }
  }, [captureImage, recordVideo])

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
      if (!exportRenderLockRef.current) {
        const anim = store.state.animation
        const effectiveAnimation: AnimationSettings = reducedMotionRef.current
          ? { ...anim, style: 'static', strength: 0 }
          : anim
        renderer.setAnimation(effectiveAnimation, now / 1000)
        renderer.render()
        drawPixelationOverlay()
        drawHexagonOverlay()
        drawSquaresOverlay()
        drawGlassOverlay()
        drawNoiseOverlay(now / 1000)
      }
      rafId = requestAnimationFrame(frame)
    }
    rafId = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(rafId)
      unsub()
      renderer.dispose()
      const glass = glassGLRef.current
      if (glass) {
        glass.gl.deleteTexture(glass.texture)
        glass.gl.deleteProgram(glass.program)
        glassGLRef.current = null
      }
    }
  }, [drawOverlay, drawGlassOverlay, drawHexagonOverlay, drawNoiseOverlay, drawPixelationOverlay, drawSquaresOverlay])

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

      const noiseCanvas = noiseCanvasRef.current
      if (noiseCanvas) {
        noiseCanvas.width = w
        noiseCanvas.height = h
      }

      const pixelationCanvas = pixelationCanvasRef.current
      if (pixelationCanvas) {
        pixelationCanvas.width = w
        pixelationCanvas.height = h
      }

      const hexagonCanvas = hexagonCanvasRef.current
      if (hexagonCanvas) {
        hexagonCanvas.width = w
        hexagonCanvas.height = h
      }

      const squaresCanvas = squaresCanvasRef.current
      if (squaresCanvas) {
        squaresCanvas.width = w
        squaresCanvas.height = h
      }

      const glassCanvas = glassCanvasRef.current
      if (glassCanvas) {
        glassCanvas.width = w
        glassCanvas.height = h
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

      {/* Pixelation post-fx overlay */}
      <canvas
        ref={pixelationCanvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          borderRadius: VIEWPORT_RADIUS,
          imageRendering: 'pixelated',
        }}
      />

      {/* Hexagon effect overlay */}
      <canvas
        ref={hexagonCanvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          borderRadius: VIEWPORT_RADIUS,
        }}
      />

      {/* Squares effect overlay */}
      <canvas
        ref={squaresCanvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          borderRadius: VIEWPORT_RADIUS,
        }}
      />

      {/* Glass distortion overlay */}
      <canvas
        ref={glassCanvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          borderRadius: VIEWPORT_RADIUS,
        }}
      />

      {/* Film grain noise overlay */}
      <canvas
        ref={noiseCanvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          borderRadius: VIEWPORT_RADIUS,
          mixBlendMode: 'overlay',
          opacity: 1,
        }}
      />

      {/* 2D overlay: mesh lines + points */}
      <canvas
        ref={overlayRef}
        style={{
          position: 'absolute',
          left: -OVERLAY_PAD,
          top: -OVERLAY_PAD,
          pointerEvents: store.state.showMeshOverlay ? 'auto' : 'none',
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
