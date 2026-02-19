import * as THREE from 'three'
import { tessellate } from './math'
import type { MeshGrid, AnimationSettings } from './types'

// ─── Shaders (mesh patches) ───────────────────────────────────────────────────

const vertexShader = /* glsl */`
  attribute vec4 color;
  varying vec4 vColor;
  varying vec2 vPos;
  void main() {
    vColor = color;
    vPos = position.xy;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const fragmentShader = /* glsl */`
  precision highp float;
  varying vec4 vColor;
  varying vec2 vPos;
  uniform float uTime;
  uniform float uAnimStyle;
  uniform float uAnimSpeed;
  uniform float uAnimStrength;

  vec3 srgbToLinear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
  }
  vec3 linearToSrgb(vec3 c) {
    c = clamp(c, 0.0, 1.0);
    return mix(c * 12.92, 1.055 * pow(c, vec3(0.41666)) - 0.055, step(0.0031308, c));
  }

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }

  float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);

    float a = hash21(i + vec2(0.0, 0.0));
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));

    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
    for (int i = 0; i < 4; i++) {
      v += a * noise2(p);
      p = m * p;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 col = clamp(vColor.rgb, 0.0, 1.0);
    if (uAnimStyle > 0.5 && uAnimStyle < 1.5) {
      float t = uTime * uAnimSpeed;
      vec2 uv = vPos * 1.7;

      // Domain warp for smooth, organic motion with low visual repetition.
      vec2 warp = vec2(
        fbm(uv + vec2(0.0,  t * 0.42)),
        fbm(uv + vec2(5.2, -t * 0.36))
      );
      vec2 flowUv = uv + (warp - 0.5) * 2.0;

      float n1 = fbm(flowUv + vec2(0.0,  t * 0.25));
      float n2 = fbm(flowUv + vec2(2.7, -t * 0.21));
      float n3 = fbm(flowUv + vec2(-3.1, t * 0.18));

      vec3 drift = (vec3(n1, n2, n3) - 0.5) * (0.24 * uAnimStrength);
      float breathe = 1.0 + (n1 - 0.5) * (0.18 * uAnimStrength);
      col = clamp((col + drift) * breathe, 0.0, 1.0);
    } else if (uAnimStyle >= 1.5 && uAnimStyle < 2.5) {
      // Smooth mode: low-frequency sine flow for soft, calm movement.
      float t = uTime * uAnimSpeed;
      float s1 = sin(vPos.x * 3.2 + t * 0.82);
      float s2 = sin(vPos.y * 2.8 - t * 0.74);
      float s3 = sin((vPos.x + vPos.y) * 2.1 + t * 0.48);
      vec3 drift = vec3(
        (s1 * 0.58 + s3 * 0.42),
        (s2 * 0.62 + s1 * 0.38),
        (-s2 * 0.54 + s3 * 0.46)
      ) * (0.075 * uAnimStrength);
      float lift = 1.0 + s3 * (0.10 * uAnimStrength);
      col = clamp((col + drift) * lift, 0.0, 1.0);
    } else if (uAnimStyle >= 2.5 && uAnimStyle < 3.5) {
      float t = uTime * uAnimSpeed;
      float radial = length(vPos);
      float pulse = 0.5 + 0.5 * sin(t * 2.0 - radial * 8.0);
      float boost = mix(1.0, 1.0 + 0.22 * uAnimStrength, pulse);
      col = clamp(col * boost, 0.0, 1.0);
    } else if (uAnimStyle >= 3.5 && uAnimStyle < 4.5) {
      float t = uTime * uAnimSpeed;
      float w = sin(vPos.x * 9.0 + t * 2.1) * cos(vPos.y * 6.0 - t * 1.7);
      vec3 waveShift = vec3(w, w * 0.7, -w * 0.85) * (0.09 * uAnimStrength);
      col = clamp(col + waveShift, 0.0, 1.0);
    }

    vec3 linear = srgbToLinear(col);
    gl_FragColor = vec4(linearToSrgb(linear), vColor.a);
  }
`

// ─── Background shader (bilinear corner fill) ─────────────────────────────────
// Covers the entire [-1,1] quad and interpolates the 4 corner colours.
// This prevents black gaps when mesh patches don't fully cover the canvas.

const bgVertexShader = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;   // [0,1]
    // NDC depth: -1 = near, +1 = far. Put background at far plane.
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`

const bgFragmentShader = /* glsl */`
  precision highp float;
  uniform vec4 uTL; // top-left  colour
  uniform vec4 uTR;
  uniform vec4 uBL;
  uniform vec4 uBR;
  varying vec2 vUv; // (0,0)=bottom-left … (1,1)=top-right  (WebGL Y-up)

  vec3 srgbToLinear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
  }
  vec3 linearToSrgb(vec3 c) {
    c = clamp(c, 0.0, 1.0);
    return mix(c * 12.92, 1.055 * pow(c, vec3(0.41666)) - 0.055, step(0.0031308, c));
  }

  void main() {
    float u = vUv.x;
    float v = vUv.y;  // 0 = bottom, 1 = top

    // bilinear: bottom edge = BL..BR, top edge = TL..TR
    vec4 bottom = mix(uBL, uBR, u);
    vec4 top    = mix(uTL, uTR, u);
    vec4 col    = mix(bottom, top, v);

    vec3 linear = srgbToLinear(clamp(col.rgb, 0.0, 1.0));
    gl_FragColor = vec4(linearToSrgb(linear), col.a);
  }
`

// ─── Renderer ─────────────────────────────────────────────────────────────────

export class MeshRenderer {
  renderer:   THREE.WebGLRenderer
  scene:      THREE.Scene
  camera:     THREE.OrthographicCamera
  mesh:       THREE.Mesh | null = null
  bgMesh:     THREE.Mesh
  geometry:   THREE.BufferGeometry | null = null
  material:   THREE.ShaderMaterial
  bgMaterial: THREE.ShaderMaterial
  subdivision = 20

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.setClearColor(0x111111, 1)
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace
    // We render in a fixed full-screen pass order (bg -> mesh).
    this.renderer.sortObjects = true

    this.scene  = new THREE.Scene()
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1)

    // ── Background full-screen quad ──────────────────────────────────────
    this.bgMaterial = new THREE.ShaderMaterial({
      vertexShader:   bgVertexShader,
      fragmentShader: bgFragmentShader,
      uniforms: {
        uTL: { value: new THREE.Vector4(0, 0, 0, 1) },
        uTR: { value: new THREE.Vector4(0, 0, 0, 1) },
        uBL: { value: new THREE.Vector4(0, 0, 0, 1) },
        uBR: { value: new THREE.Vector4(0, 0, 0, 1) },
      },
      depthTest: false,
      depthWrite: false,
    })
    const bgGeo = new THREE.PlaneGeometry(2, 2)
    this.bgMesh = new THREE.Mesh(bgGeo, this.bgMaterial)
    this.bgMesh.renderOrder = 0
    this.scene.add(this.bgMesh)

    // ── Mesh material ────────────────────────────────────────────────────
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uAnimStyle: { value: 0 },
        uAnimSpeed: { value: 1 },
        uAnimStrength: { value: 0.5 },
      },
      // Custom shader reads `attribute vec4 color` directly.
      vertexColors: false,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    })
  }

  setSize(width: number, height: number) {
    this.renderer.setSize(width, height, false)
  }

  update(grid: MeshGrid) {
    // ── Update background corner colours ─────────────────────────────────
    const pts = grid.points
    const rows = grid.rows
    const cols = grid.cols
    const c2v = (r: number, c: number) => {
      const { r: cr, g, b, a } = pts[r][c].color
      return new THREE.Vector4(cr, g, b, a)
    }
    this.bgMaterial.uniforms.uTL.value = c2v(0,       0)
    this.bgMaterial.uniforms.uTR.value = c2v(0,       cols - 1)
    this.bgMaterial.uniforms.uBL.value = c2v(rows - 1, 0)
    this.bgMaterial.uniforms.uBR.value = c2v(rows - 1, cols - 1)

    // ── Tessellate mesh patches ──────────────────────────────────────────
    const { positions, colors, indices } = tessellate(grid, this.subdivision)

    if (this.mesh) {
      this.scene.remove(this.mesh)
      this.geometry?.dispose()
    }

    this.geometry = new THREE.BufferGeometry()
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    this.geometry.setAttribute('color',    new THREE.BufferAttribute(colors, 4))
    this.geometry.setIndex(new THREE.BufferAttribute(indices, 1))

    this.mesh = new THREE.Mesh(this.geometry, this.material)
    this.mesh.renderOrder = 1
    this.scene.add(this.mesh)
  }

  render() {
    this.renderer.render(this.scene, this.camera)
  }

  setAnimation(animation: AnimationSettings, timeSec: number) {
    const u = this.material.uniforms
    u.uTime.value = timeSec
    const styleMap: Record<AnimationSettings['style'], number> = {
      static: 0,
      fluid: 1,
      smooth: 2,
      pulse: 3,
      wave: 4,
    }
    u.uAnimStyle.value = styleMap[animation.style]
    u.uAnimSpeed.value = animation.speed
    u.uAnimStrength.value = animation.strength
  }

  toDataURL(type = 'image/png'): string {
    this.renderer.render(this.scene, this.camera)
    return this.renderer.domElement.toDataURL(type)
  }

  dispose() {
    this.geometry?.dispose()
    this.material.dispose()
    this.bgMaterial.dispose()
    this.renderer.dispose()
  }
}
