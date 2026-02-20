import * as THREE from 'three'
import { tessellate } from './math'
import type {
  MeshGrid,
  AnimationSettings,
  CanvasBackgroundSettings,
  EffectSettings,
  NoiseSettings,
} from './types'

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
  uniform float uEffectType;
  uniform vec3 uEffectColor;
  uniform vec3 uEffectLineColor;
  uniform float uEffectOpacity;
  uniform float uEffectScale;
  uniform float uEffectRotate;
  uniform vec2 uViewportSize;
  uniform float uNoiseAnimated;
  uniform float uNoiseIntensity;
  uniform float uNoiseScale;
  uniform float uNoiseSpeed;

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

  vec2 rotateAround(vec2 p, vec2 center, float rad) {
    float s = sin(rad);
    float c = cos(rad);
    vec2 d = p - center;
    return vec2(d.x * c - d.y * s, d.x * s + d.y * c) + center;
  }

  float cssLinearT(vec2 px, vec2 tile, float angleDeg, vec2 offsetPx) {
    vec2 p = fract((px - offsetPx) / tile) * tile;
    float rad = radians(angleDeg);
    vec2 dir = vec2(sin(rad), -cos(rad)); // CSS angle convention
    vec2 center = tile * 0.5;
    float l = 0.5 * (abs(dir.x) * tile.x + abs(dir.y) * tile.y);
    return (dot(p - center, dir) + l) / (2.0 * max(0.00001, l));
  }

  vec3 over(vec3 under, vec3 src, float alpha) {
    return mix(under, src, clamp(alpha, 0.0, 1.0));
  }

  vec3 overlayBlend(vec3 base, vec3 blend) {
    vec3 low  = 2.0 * base * blend;
    vec3 high = 1.0 - 2.0 * (1.0 - base) * (1.0 - blend);
    return mix(low, high, step(vec3(0.5), base));
  }

  float cssLinearMask(vec2 px, float cell, float angleDeg, vec2 offsetPx, float stopT) {
    float t = cssLinearT(px, vec2(cell), angleDeg, offsetPx);
    return 1.0 - step(stopT, t);
  }

  float cssLinearEdgeMask(vec2 px, vec2 tile, float angleDeg, vec2 offsetPx, float startT, float endT) {
    float t = cssLinearT(px, tile, angleDeg, offsetPx);
    float low = 1.0 - step(startT, t);
    float high = step(endT, t);
    return clamp(low + high, 0.0, 1.0);
  }

  float cssLinearEdgeMaskStops(
    vec2 px,
    vec2 tile,
    float angleDeg,
    vec2 offsetPx,
    float startSolidEnd,
    float startFadeEnd,
    float endFadeStart,
    float endSolidStart
  ) {
    float t = cssLinearT(px, tile, angleDeg, offsetPx);
    float left  = 1.0 - clamp((t - startSolidEnd) / max(0.00001, (startFadeEnd - startSolidEnd)), 0.0, 1.0);
    float right = clamp((t - endFadeStart) / max(0.00001, (endSolidStart - endFadeStart)), 0.0, 1.0);
    return clamp(left + right, 0.0, 1.0);
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

    if (uEffectType > 0.5) {
      vec2 uv = vec2((vPos.x + 1.0) * 0.5, (1.0 - vPos.y) * 0.5);
      vec2 px = uv * max(uViewportSize, vec2(1.0));
      vec3 base = uEffectColor;
      vec3 line = uEffectLineColor;
      float scalePx = max(2.0, uEffectScale);
      vec3 pattern = base;

      if (uEffectType > 0.5 && uEffectType < 1.5) {
        // Wavy
        float radialT = fract(length(px) / scalePx);
        float lineAlpha = mix(0.333, 1.0, clamp(uv.y, 0.0, 1.0));
        vec3 linearLayer = mix(base, line, lineAlpha);
        pattern = mix(linearLayer, base, radialT);
      } else if (uEffectType >= 1.5 && uEffectType < 2.5) {
        // Zigzag
        float cell = scalePx;
        float m1 = cssLinearMask(px, cell, 135.0, vec2(cell * 0.5, 0.0), 0.25);
        float m2 = cssLinearMask(px, cell, 225.0, vec2(cell * 0.5, 0.0), 0.25);
        float m3 = cssLinearMask(px, cell, 45.0,  vec2(0.0), 0.25);
        float m4 = cssLinearMask(px, cell, 315.0, vec2(0.0), 0.25);
        float mask = max(max(m1, m2), max(m3, m4));
        pattern = mix(base, line, mask);
      } else if (uEffectType >= 2.5 && uEffectType < 3.5) {
        // Zigzag 3D
        float cell = scalePx;
        float m1 = cssLinearMask(px, cell, 135.0, vec2(-cell * 0.5, 0.0), 0.25); // 55%
        float m2 = cssLinearMask(px, cell, 225.0, vec2(-cell * 0.5, 0.0), 0.25); // 100%
        float m3 = cssLinearMask(px, cell, 315.0, vec2(0.0), 0.25);               // 55%
        float m4 = cssLinearMask(px, cell, 45.0,  vec2(0.0), 0.25);               // 100%, base fallback
        pattern = mix(base, line, m4);
        pattern = mix(pattern, line, 0.333 * m3);
        pattern = mix(pattern, line, m2);
        pattern = mix(pattern, line, 0.333 * m1);
      } else if (uEffectType >= 3.5 && uEffectType < 4.5) {
        // Circle
        vec2 center = uViewportSize * 0.5;
        float dist = length(px - center);
        float maxDist = max(1.0, length(center));

        // layer A: radial-gradient(circle at center center, line, base)
        float gradT = clamp(dist / maxDist, 0.0, 1.0);
        vec3 layerA = mix(line, base, gradT);

        // layer B: repeating-radial-gradient(
        //   circle at center center,
        //   line, line, 10px, transparent 20px, transparent 10px
        // )
        // CSS stop behavior here yields: solid line until "scale", then fade to transparent until "2*scale".
        float band = max(1.0, scalePx);
        float cycle = band * 2.0;
        float ringPos = mod(dist, cycle);
        // Start fade a bit earlier to get a thicker soft transition band.
        float fadeStart = band * 0.75;
        float layerBAlpha = 1.0 - smoothstep(fadeStart, cycle, ringPos);
        vec3 layerB = mix(vec3(1.0), line, layerBAlpha);

        // background-blend-mode: multiply
        pattern = layerA * layerB;
      } else if (uEffectType >= 4.5 && uEffectType < 5.5) {
        // Isometric
        vec2 tile = vec2(scalePx, scalePx * 1.75);               // 20 x 35 reference ratio
        vec2 offA = vec2(0.0, 0.0);
        vec2 offB = vec2(tile.x * 0.5, tile.y * 0.5142857);     // 10px,18px on 20x35

        // CSS layer order (top to bottom):
        // 1) 30 offA, 2)150 offA, 3)30 offB, 4)150 offB, 5)60 offA (47%), 6)60 offB (47%)
        float l1 = cssLinearEdgeMaskStops(px, tile, 30.0,  offA, 0.12, 0.125, 0.87, 0.875);
        float l2 = cssLinearEdgeMaskStops(px, tile, 150.0, offA, 0.12, 0.125, 0.87, 0.875);
        float l3 = cssLinearEdgeMaskStops(px, tile, 30.0,  offB, 0.12, 0.125, 0.87, 0.875);
        float l4 = cssLinearEdgeMaskStops(px, tile, 150.0, offB, 0.12, 0.125, 0.87, 0.875);
        float l5 = cssLinearEdgeMaskStops(px, tile, 60.0,  offA, 0.25, 0.255, 0.75, 0.755);
        float l6 = cssLinearEdgeMaskStops(px, tile, 60.0,  offB, 0.25, 0.255, 0.75, 0.755);

        pattern = base;
        pattern = over(pattern, line, l6 * 0.47);
        pattern = over(pattern, line, l5 * 0.47);
        pattern = over(pattern, line, l4);
        pattern = over(pattern, line, l3);
        pattern = over(pattern, line, l2);
        pattern = over(pattern, line, l1);
      } else if (uEffectType >= 5.5 && uEffectType < 6.5) {
        // Polka (rotatable)
        vec2 center = uViewportSize * 0.5;
        vec2 rp = rotateAround(px, center, radians(uEffectRotate));
        float cell = scalePx;
        vec2 local = fract(rp / cell) - 0.5;
        float radius = max(0.25, 0.5 * (cell / 10.0));
        float mask = step(length(local * cell), radius);
        pattern = mix(base, line, mask);
      } else if (uEffectType >= 6.5 && uEffectType < 7.5) {
        // Lines (rotatable)
        vec2 center = uViewportSize * 0.5;
        vec2 rp = rotateAround(px, center, radians(uEffectRotate));
        float stripe = step(fract(rp.y / scalePx), 0.5);
        pattern = mix(base, line, stripe);
      } else if (uEffectType >= 7.5 && uEffectType < 8.5) {
        // Boxes
        float cell = scalePx;
        float w = 1.0;
        vec2 f = fract(px / cell);
        float lx = step(f.x, w / cell) + step(1.0 - w / cell, f.x);
        float ly = step(f.y, w / cell) + step(1.0 - w / cell, f.y);
        float mask = clamp(lx + ly, 0.0, 1.0);
        pattern = mix(base, line, mask);
      } else if (uEffectType >= 8.5 && uEffectType < 9.5) {
        // Triangle
        vec2 n = fract(px / scalePx);
        float mask = step(n.x + n.y, 1.0);
        pattern = mix(base, line, mask);
      } else if (uEffectType >= 9.5 && uEffectType < 10.5) {
        // Rhombus
        // Rotated checker grid -> contiguous diamond tiles (matches rhombus reference look).
        float unit = max(4.0, scalePx) * 1.35;
        vec2 q = vec2(px.x + px.y, px.y - px.x) / (unit * 1.41421356);
        vec2 cellId = floor(q);
        float checker = mod(cellId.x + cellId.y + 4096.0, 2.0);
        pattern = mix(base, line, checker);
      }

      col = mix(col, pattern, clamp(uEffectOpacity, 0.0, 1.0));
    }

    if (uNoiseIntensity > 0.0001) {
      vec2 uv = vec2((vPos.x + 1.0) * 0.5, (1.0 - vPos.y) * 0.5);
      vec2 pxCoord = floor(uv * max(uViewportSize, vec2(1.0)));

      // Film grain (reference behavior): random per block, refreshed per frame, overlay composite.
      float grainCell = max(1.0, uNoiseScale);
      vec2 samplePx = floor(pxCoord / grainCell);
      float frame = (uNoiseAnimated > 0.5) ? floor(uTime * uNoiseSpeed * 60.0) : 0.0;

      float idx = dot(samplePx, vec2(1.0, 1733.0)) + frame * 12345.0;
      float r = fract(sin(idx * 127.1 + frame) * 43758.5453);

      float grain = (r - 0.5) * uNoiseIntensity;
      float gray = clamp(0.5 + grain, 0.0, 1.0);
      float alpha = clamp(abs(grain) * 2.8, 0.0, 1.0);

      vec3 blended = overlayBlend(col, vec3(gray));
      col = mix(col, blended, alpha);
    }

    vec3 linear = srgbToLinear(col);
    gl_FragColor = vec4(linearToSrgb(linear), vColor.a);
  }
`

// ─── Renderer ─────────────────────────────────────────────────────────────────

export class MeshRenderer {
  renderer:   THREE.WebGLRenderer
  scene:      THREE.Scene
  camera:     THREE.OrthographicCamera
  mesh:       THREE.Mesh | null = null
  geometry:   THREE.BufferGeometry | null = null
  material:   THREE.ShaderMaterial
  subdivision = 20

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.setClearColor(0x111111, 1)
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace

    this.scene  = new THREE.Scene()
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1)

    // ── Mesh material ────────────────────────────────────────────────────
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uAnimStyle: { value: 0 },
        uAnimSpeed: { value: 1 },
        uAnimStrength: { value: 0.5 },
        uEffectType: { value: 0 },
        uEffectColor: { value: new THREE.Color(0xe5e5f7) },
        uEffectLineColor: { value: new THREE.Color(0x000000) },
        uEffectOpacity: { value: 0.3 },
        uEffectScale: { value: 30 },
        uEffectRotate: { value: 0 },
        uViewportSize: { value: new THREE.Vector2(1, 1) },
        uNoiseAnimated: { value: 1 },
        uNoiseIntensity: { value: 0 },
        uNoiseScale: { value: 1 },
        uNoiseSpeed: { value: 1 },
      },
      // Custom shader reads `attribute vec4 color` directly.
      vertexColors: false,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    })
  }

  setSize(width: number, height: number) {
    this.renderer.setSize(width, height, false)
    this.material.uniforms.uViewportSize.value.set(width, height)
  }

  setBackground(background: CanvasBackgroundSettings) {
    const { r, g, b } = background.color
    this.renderer.setClearColor(new THREE.Color(r, g, b), background.opacity)
  }

  update(grid: MeshGrid) {
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

  setEffect(effect: EffectSettings) {
    const u = this.material.uniforms
    const styleMap: Record<EffectSettings['type'], number> = {
      none: 0,
      wavy: 1,
      zigzag: 2,
      zigzag3d: 3,
      circle: 4,
      isometric: 5,
      polka: 6,
      lines: 7,
      boxes: 8,
      triangle: 9,
      rhombus: 10,
      glass: 0,
    }
    u.uEffectType.value = styleMap[effect.type]
    u.uEffectColor.value.setRGB(effect.color.r, effect.color.g, effect.color.b)
    u.uEffectLineColor.value.setRGB(effect.lineColor.r, effect.lineColor.g, effect.lineColor.b)
    u.uEffectOpacity.value = effect.opacity
    u.uEffectScale.value = effect.scale
    u.uEffectRotate.value = effect.rotate
  }

  setNoise(noise: NoiseSettings) {
    const u = this.material.uniforms
    u.uNoiseAnimated.value = noise.animated ? 1 : 0
    u.uNoiseIntensity.value = noise.intensity
    u.uNoiseScale.value = noise.size
    u.uNoiseSpeed.value = noise.speed
  }

  toDataURL(type = 'image/png'): string {
    this.renderer.render(this.scene, this.camera)
    return this.renderer.domElement.toDataURL(type)
  }

  dispose() {
    this.geometry?.dispose()
    this.material.dispose()
    this.renderer.dispose()
  }
}
