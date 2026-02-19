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

        <div style={{ ...row, marginBottom: 10 }}>
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

        {effect.type === 'wavy' && (
          <>
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

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.55)', marginBottom: 6 }}>
                <span>Scale</span>
                <span>{effect.scale}</span>
              </div>
              <input
                type="range"
                min={4}
                max={64}
                step={1}
                value={effect.scale}
                onChange={e => store.setEffectScale(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#6c63ff', cursor: 'pointer' }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
