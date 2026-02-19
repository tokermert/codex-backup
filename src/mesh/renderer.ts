import * as THREE from 'three'
import { tessellate } from './math'
import type { MeshGrid } from './types'

// ─── Shaders (mesh patches) ───────────────────────────────────────────────────

const vertexShader = /* glsl */`
  attribute vec4 color;
  varying vec4 vColor;
  void main() {
    vColor = color;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const fragmentShader = /* glsl */`
  precision highp float;
  varying vec4 vColor;

  vec3 srgbToLinear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
  }
  vec3 linearToSrgb(vec3 c) {
    c = clamp(c, 0.0, 1.0);
    return mix(c * 12.92, 1.055 * pow(c, vec3(0.41666)) - 0.055, step(0.0031308, c));
  }

  void main() {
    vec3 linear = srgbToLinear(clamp(vColor.rgb, 0.0, 1.0));
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
