import { useEffect, useState } from 'react'
import { store } from '../mesh/store'
import type { AnimationStyle, Color, EffectType } from '../mesh/types'

const panel: React.CSSProperties = {
  width: 268,
  minWidth: 268,
  background: '#1a1a1a',
  borderLeft: '1px solid rgba(255,255,255,0.07)',
  display: 'flex',
  flexDirection: 'column',
  overflowY: 'auto',
  overflowX: 'hidden',
}

const section: React.CSSProperties = {
  padding: '14px 16px',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
}

const sectionLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: 'rgba(255,255,255,0.35)',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  marginBottom: 10,
  display: 'block',
}

const row: React.CSSProperties = { display: 'flex', gap: 6, alignItems: 'center' }

const modeBtn = (active: boolean): React.CSSProperties => ({
  flex: 1,
  padding: '5px 0',
  background: active ? 'rgba(108,99,255,0.3)' : 'rgba(255,255,255,0.04)',
  border: `1px solid ${active ? 'rgba(108,99,255,0.6)' : 'rgba(255,255,255,0.09)'}`,
  borderRadius: 4,
  color: active ? '#c5c2ff' : 'rgba(255,255,255,0.45)',
  fontSize: 11,
  cursor: 'pointer',
  transition: 'all 0.1s',
})

const inputStyle: React.CSSProperties = {
  flex: 1,
  width: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 4,
  color: '#fff',
  padding: '5px 8px',
  fontSize: 12,
  outline: 'none',
  fontVariantNumeric: 'tabular-nums',
}

const valuePill: React.CSSProperties = {
  minWidth: 56,
  padding: '3px 8px',
  borderRadius: 6,
  textAlign: 'right',
  background: 'rgba(255, 70, 120, 0.16)',
  border: '1px solid rgba(255, 120, 170, 0.12)',
  color: 'rgba(255, 136, 186, 0.95)',
  fontSize: 11,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  fontVariantNumeric: 'tabular-nums',
}

const ANIM_STYLES: { key: AnimationStyle; label: string }[] = [
  { key: 'static', label: 'Static' },
  { key: 'fluid', label: 'Fluid' },
  { key: 'smooth', label: 'Smooth' },
  { key: 'pulse', label: 'Pulse' },
  { key: 'wave', label: 'Wave' },
]

const ANIM_PRESETS = [
  { label: 'Calm', speed: 0.55, strength: 0.28 },
  { label: 'Hero', speed: 1.0, strength: 0.52 },
  { label: 'Energetic', speed: 1.8, strength: 0.78 },
]

const SMOOTH_PRESETS = [
  { label: 'Calm', speed: 2.2, strength: 0.6 },
  { label: 'Hero', speed: 3.4, strength: 1.1 },
  { label: 'Energetic', speed: 5.0, strength: 1.7 },
]

const EFFECT_TYPES: { key: EffectType; label: string }[] = [
  { key: 'none', label: 'None' },
  { key: 'wavy', label: 'Wavy' },
  { key: 'zigzag', label: 'Zigzag' },
  { key: 'zigzag3d', label: 'Zigzag 3D' },
  { key: 'circle', label: 'Circle' },
  { key: 'isometric', label: 'Isometric' },
  { key: 'polka', label: 'Polka' },
  { key: 'lines', label: 'Lines' },
  { key: 'boxes', label: 'Boxes' },
  { key: 'triangle', label: 'Triangle' },
  { key: 'rhombus', label: 'Rhombus' },
]

const c = (hex: string): Color => {
  const n = parseInt(hex.replace('#', ''), 16)
  return { r: ((n >> 16) & 0xff) / 255, g: ((n >> 8) & 0xff) / 255, b: (n & 0xff) / 255, a: 1 }
}

const toHex = (color: Color) => {
  const to255 = (n: number) => Math.max(0, Math.min(255, Math.round(n * 255)))
  const hex = (n: number) => to255(n).toString(16).padStart(2, '0')
  return `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`
}

const EFFECT_CONTROL_CONFIG: Record<EffectType, {
  showColor: boolean
  showLine: boolean
  showOpacity: boolean
  showScale: boolean
  showRotate: boolean
  scaleMin: number
  scaleMax: number
}> = {
  none:     { showColor: false, showLine: false, showOpacity: false, showScale: false, showRotate: false, scaleMin: 4,  scaleMax: 64 },
  wavy:     { showColor: true,  showLine: true,  showOpacity: true,  showScale: true,  showRotate: false, scaleMin: 4,  scaleMax: 96 },
  zigzag:   { showColor: true,  showLine: true,  showOpacity: true,  showScale: true,  showRotate: false, scaleMin: 6,  scaleMax: 80 },
  zigzag3d: { showColor: true,  showLine: true,  showOpacity: true,  showScale: true,  showRotate: false, scaleMin: 6,  scaleMax: 80 },
  circle:   { showColor: true,  showLine: true,  showOpacity: true,  showScale: true,  showRotate: false, scaleMin: 6,  scaleMax: 96 },
  isometric:{ showColor: true,  showLine: true,  showOpacity: true,  showScale: true,  showRotate: false, scaleMin: 8,  scaleMax: 96 },
  polka:    { showColor: true,  showLine: true,  showOpacity: true,  showScale: true,  showRotate: true,  scaleMin: 6,  scaleMax: 64 },
  lines:    { showColor: true,  showLine: true,  showOpacity: true,  showScale: true,  showRotate: true,  scaleMin: 4,  scaleMax: 64 },
  boxes:    { showColor: true,  showLine: true,  showOpacity: true,  showScale: true,  showRotate: false, scaleMin: 6,  scaleMax: 96 },
  triangle: { showColor: true,  showLine: true,  showOpacity: true,  showScale: true,  showRotate: false, scaleMin: 4,  scaleMax: 64 },
  rhombus:  { showColor: true,  showLine: true,  showOpacity: true,  showScale: true,  showRotate: false, scaleMin: 4,  scaleMax: 64 },
}

export default function RightPanel() {
  const [, setTick] = useState(0)

  useEffect(() => {
    const unsub = store.subscribe(() => setTick(n => n + 1))
    return () => unsub()
  }, [])

  const animation = store.state.animation
  const isStatic = animation.style === 'static'
  const isSmooth = animation.style === 'smooth'
  const presets = isSmooth ? SMOOTH_PRESETS : ANIM_PRESETS
  const speedMin = isSmooth ? 2 : 0.1
  const speedMax = isSmooth ? 6 : 4
  const strengthMin = isSmooth ? 0.5 : 0
  const strengthMax = isSmooth ? 2 : 1
  const effect = store.state.effect
  const effectCfg = EFFECT_CONTROL_CONFIG[effect.type]
  const noise = store.state.noise

  return (
    <div style={panel} data-scrollbar="panel">
      <div style={{ ...section, borderBottom: 'none', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <span style={sectionLabel}>Animation</span>
        <div style={{ ...row, marginBottom: 8 }}>
          {ANIM_STYLES.filter(item => item.key === 'static').map(item => (
            <button
              key={item.key}
              style={modeBtn(animation.style === item.key)}
              onClick={() => store.setAnimationStyle(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: isStatic ? 0 : 12 }}>
          {ANIM_STYLES.filter(item => item.key !== 'static').map(item => (
            <button
              key={item.key}
              style={modeBtn(animation.style === item.key)}
              onClick={() => store.setAnimationStyle(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {!isStatic && (
          <>
            <div style={{ ...row, marginBottom: 12 }}>
              {presets.map(preset => (
                <button
                  key={preset.label}
                  style={{
                    ...modeBtn(
                      Math.abs(animation.speed - preset.speed) < 0.02 &&
                      Math.abs(animation.strength - preset.strength) < 0.02,
                    ),
                    padding: '4px 0',
                  }}
                  onClick={() => {
                    store.setAnimationSpeed(preset.speed)
                    store.setAnimationStrength(preset.strength)
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.55)', marginBottom: 6 }}>
                <span>Speed</span>
                <span>{animation.speed.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min={speedMin}
                max={speedMax}
                step={0.05}
                value={animation.speed}
                onChange={e => store.setAnimationSpeed(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#6c63ff', cursor: 'pointer' }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.55)', marginBottom: 6 }}>
                <span>Strength</span>
                <span>{animation.strength.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={strengthMin}
                max={strengthMax}
                step={0.01}
                value={animation.strength}
                onChange={e => store.setAnimationStrength(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#6c63ff', cursor: 'pointer' }}
              />
            </div>
          </>
        )}
      </div>

      <div style={{ ...section, borderBottom: 'none', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <span style={sectionLabel}>Effects</span>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, marginBottom: 10 }}>
          {EFFECT_TYPES.map(item => (
            <button
              key={item.key}
              style={modeBtn(effect.type === item.key)}
              onClick={() => store.setEffectType(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {effect.type !== 'none' && (
          <>
            {effectCfg.showColor && (
              <div style={{ ...row, marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', minWidth: 42 }}>Color</span>
                <input
                  type="color"
                  value={toHex(effect.color)}
                  onChange={e => store.setEffectColor(c(e.target.value))}
                  style={{
                    width: 44,
                    height: 28,
                    padding: 0,
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 5,
                    background: 'transparent',
                    cursor: 'pointer',
                  }}
                />
                <input style={inputStyle} readOnly value={toHex(effect.color).toUpperCase()} />
              </div>
            )}

            {effectCfg.showLine && (
              <div style={{ ...row, marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', minWidth: 42 }}>Line</span>
                <input
                  type="color"
                  value={toHex(effect.lineColor)}
                  onChange={e => store.setEffectLineColor(c(e.target.value))}
                  style={{
                    width: 44,
                    height: 28,
                    padding: 0,
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 5,
                    background: 'transparent',
                    cursor: 'pointer',
                  }}
                />
                <input style={inputStyle} readOnly value={toHex(effect.lineColor).toUpperCase()} />
              </div>
            )}

            {effectCfg.showOpacity && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.55)', marginBottom: 6 }}>
                  <span>Opacity</span>
                  <span>{effect.opacity.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={effect.opacity}
                  onChange={e => store.setEffectOpacity(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#6c63ff', cursor: 'pointer' }}
                />
              </div>
            )}

            {effectCfg.showScale && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.55)', marginBottom: 6 }}>
                  <span>Scale</span>
                  <span>{effect.scale}</span>
                </div>
                <input
                  type="range"
                  min={effectCfg.scaleMin}
                  max={effectCfg.scaleMax}
                  step={1}
                  value={effect.scale}
                  onChange={e => store.setEffectScale(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#6c63ff', cursor: 'pointer' }}
                />
              </div>
            )}

            {effectCfg.showRotate && (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.55)', marginBottom: 6 }}>
                  <span>Rotate</span>
                  <span>{Math.round(effect.rotate)}°</span>
                </div>
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={1}
                  value={effect.rotate}
                  onChange={e => store.setEffectRotate(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#6c63ff', cursor: 'pointer' }}
                />
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ ...section, borderBottom: 'none', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ ...row, justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ ...sectionLabel, marginBottom: 0 }}>Noise</span>
          <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, lineHeight: 1 }}>▼</span>
        </div>

        <div style={{ ...row, justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>Noise</span>
          <button
            onClick={() => store.setNoiseEnabled(!noise.enabled)}
            style={{
              width: 42,
              height: 24,
              borderRadius: 999,
              border: `1px solid ${noise.enabled ? 'rgba(108,99,255,0.7)' : 'rgba(255,255,255,0.16)'}`,
              background: noise.enabled ? 'rgba(108,99,255,0.95)' : 'rgba(255,255,255,0.12)',
              position: 'relative',
              cursor: 'pointer',
              padding: 0,
            }}
            aria-label="Toggle noise"
          >
            <span
              style={{
                position: 'absolute',
                top: 2,
                left: noise.enabled ? 20 : 2,
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: '#f0efff',
                transition: 'left 0.12s ease',
              }}
            />
          </button>
        </div>

        {noise.enabled ? (
          <>
            <div style={{ ...row, justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>Animated Noise</span>
              <button
                onClick={() => store.setNoiseAnimated(!noise.animated)}
                style={{
                  width: 42,
                  height: 24,
                  borderRadius: 999,
                  border: `1px solid ${noise.animated ? 'rgba(108,99,255,0.7)' : 'rgba(255,255,255,0.16)'}`,
                  background: noise.animated ? 'rgba(108,99,255,0.95)' : 'rgba(255,255,255,0.12)',
                  position: 'relative',
                  cursor: 'pointer',
                  padding: 0,
                }}
                aria-label="Toggle animated noise"
              >
                <span
                  style={{
                    position: 'absolute',
                    top: 2,
                    left: noise.animated ? 20 : 2,
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: '#f0efff',
                    transition: 'left 0.12s ease',
                  }}
                />
              </button>
            </div>

            <div style={{ ...row, marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', minWidth: 42 }}>Color</span>
              <input
                type="color"
                value={toHex(noise.color)}
                onChange={e => store.setNoiseColor(c(e.target.value))}
                style={{
                  width: 44,
                  height: 28,
                  padding: 0,
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 5,
                  background: 'transparent',
                  cursor: 'pointer',
                }}
              />
              <input style={inputStyle} readOnly value={toHex(noise.color).toUpperCase()} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ ...row, justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.78)' }}>Intensity</span>
                <span style={valuePill}>{noise.intensity.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={noise.intensity}
                onChange={e => store.setNoiseIntensity(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#6c63ff', cursor: 'pointer' }}
              />
            </div>

            <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', marginBottom: 12 }} />

            <div style={{ marginBottom: 12 }}>
              <div style={{ ...row, justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.78)' }}>Size</span>
                <span style={valuePill}>{noise.size.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0.1}
                max={4}
                step={0.01}
                value={noise.size}
                onChange={e => store.setNoiseSize(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#6c63ff', cursor: 'pointer' }}
              />
            </div>

            <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', marginBottom: 12 }} />

            <div>
              <div style={{ ...row, justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.78)' }}>Speed</span>
                <span style={valuePill}>{noise.speed.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={1.5}
                step={0.01}
                value={noise.speed}
                onChange={e => store.setNoiseSpeed(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#6c63ff', cursor: 'pointer' }}
              />
            </div>
          </>
        ) : (
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
            Noise kapalı. Açınca animasyon ve ayarlar aktif olur.
          </div>
        )}
      </div>
    </div>
  )
}
