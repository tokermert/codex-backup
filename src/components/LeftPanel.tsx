import { useEffect, useState } from 'react'
import { store } from '../mesh/store'
import type { Color } from '../mesh/types'
import ColorPicker from './ColorPicker'

const panel: React.CSSProperties = {
  width: 268,
  minWidth: 268,
  background: '#1a1a1a',
  borderRight: '1px solid rgba(255,255,255,0.07)',
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

const actionBtn: React.CSSProperties = {
  flex: 1,
  padding: '6px 0',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 4,
  color: 'rgba(255,255,255,0.6)',
  fontSize: 11,
  cursor: 'pointer',
}

const dangerBtn: React.CSSProperties = {
  ...actionBtn,
  background: 'rgba(255,100,80,0.08)',
  border: '1px solid rgba(255,100,80,0.2)',
  color: 'rgba(255,140,120,0.8)',
}

const helperText: React.CSSProperties = {
  color: 'rgba(255,255,255,0.4)',
  fontSize: 11,
}

const c = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16)
  return { r: ((n >> 16) & 0xff) / 255, g: ((n >> 8) & 0xff) / 255, b: (n & 0xff) / 255, a: 1 }
}

const toHex = (color: Color) => {
  const to255 = (n: number) => Math.max(0, Math.min(255, Math.round(n * 255)))
  const hex = (n: number) => to255(n).toString(16).padStart(2, '0')
  return `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`
}

const PRESETS: { name: string; colors: ReturnType<typeof c>[][] }[] = [
  {
    name: 'Aurora',
    colors: [
      [c('#6c63ff'), c('#4fc3f7'), c('#00e5ff')],
      [c('#aa00ff'), c('#7c4dff'), c('#29b6f6')],
      [c('#f50057'), c('#e040fb'), c('#5c6bc0')],
    ],
  },
  {
    name: 'Sunset',
    colors: [
      [c('#ff6b6b'), c('#feca57'), c('#ff9f43')],
      [c('#ff4757'), c('#ff6348'), c('#eccc68')],
      [c('#c0392b'), c('#e55039'), c('#f39c12')],
    ],
  },
  {
    name: 'Ocean',
    colors: [
      [c('#0077b6'), c('#00b4d8'), c('#90e0ef')],
      [c('#023e8a'), c('#0096c7'), c('#48cae4')],
      [c('#03045e'), c('#0077b6'), c('#00b4d8')],
    ],
  },
  {
    name: 'Forest',
    colors: [
      [c('#2d6a4f'), c('#52b788'), c('#95d5b2')],
      [c('#1b4332'), c('#40916c'), c('#74c69d')],
      [c('#081c15'), c('#2d6a4f'), c('#52b788')],
    ],
  },
  {
    name: 'Cotton',
    colors: [
      [c('#ffadad'), c('#ffd6a5'), c('#fdffb6')],
      [c('#caffbf'), c('#9bf6ff'), c('#a0c4ff')],
      [c('#bdb2ff'), c('#ffc6ff'), c('#ffadad')],
    ],
  },
  {
    name: 'Neon',
    colors: [
      [c('#f72585'), c('#7209b7'), c('#3a0ca3')],
      [c('#b5179e'), c('#560bad'), c('#480ca8')],
      [c('#4361ee'), c('#4cc9f0'), c('#f72585')],
    ],
  },
]

const ARTBOARD_PRESETS = [
  { label: 'Landscape', width: 1600, height: 1000 },
  { label: 'Portrait', width: 1000, height: 1600 },
  { label: 'Square', width: 1200, height: 1200 },
]

export default function LeftPanel() {
  const [, setTick] = useState(0)

  useEffect(() => {
    const unsub = store.subscribe(() => setTick(n => n + 1))
    return () => unsub()
  }, [])

  const sel = store.state.selectedPoint
  const point = store.getSelectedPoint()
  const grid = store.state.grid
  const artboard = store.state.artboardSize
  const canvasBackground = store.state.canvasBackground
  const [customW, setCustomW] = useState(String(artboard.width))
  const [customH, setCustomH] = useState(String(artboard.height))

  useEffect(() => {
    setCustomW(String(artboard.width))
    setCustomH(String(artboard.height))
  }, [artboard.width, artboard.height])

  return (
    <div style={panel} data-scrollbar="panel">
      <div style={section}>
        <span style={sectionLabel}>Position</span>
        {sel && point ? (
          <div style={row}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', marginBottom: 3 }}>X</div>
              <input style={inputStyle} readOnly value={(point.position.x * grid.width).toFixed(1)} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', marginBottom: 3 }}>Y</div>
              <input style={inputStyle} readOnly value={(point.position.y * grid.height).toFixed(1)} />
            </div>
          </div>
        ) : (
          <div style={helperText}>Select a mesh point to inspect position.</div>
        )}
      </div>

      <div style={section}>
        <span style={sectionLabel}>Color</span>
        {sel && point ? (
          <>
            <ColorPicker
              color={point.color}
              onChange={color => store.setPointColor(sel.row, sel.col, color)}
            />
            <div style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.55)', marginBottom: 6 }}>
                <span>Point Opacity</span>
                <span>{Math.round(point.color.a * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={point.color.a}
                onChange={e => store.setPointOpacity(sel.row, sel.col, Number(e.target.value))}
                onPointerUp={() => store.commitSnapshot()}
                onKeyUp={() => store.commitSnapshot()}
                style={{ width: '100%', accentColor: '#6c63ff', cursor: 'pointer' }}
              />
            </div>
          </>
        ) : (
          <div style={helperText}>Select a mesh point to edit color and opacity.</div>
        )}
      </div>

      <div style={section}>
        <span style={sectionLabel}>Canvas Background</span>
        <div style={{ ...row, marginBottom: 10 }}>
          <input
            type="color"
            value={toHex(canvasBackground.color)}
            onChange={e => store.setCanvasBackgroundColor(c(e.target.value))}
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
          <input style={inputStyle} readOnly value={toHex(canvasBackground.color).toUpperCase()} />
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.55)', marginBottom: 6 }}>
            <span>Opacity</span>
            <span>{Math.round(canvasBackground.opacity * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={canvasBackground.opacity}
            onChange={e => store.setCanvasBackgroundOpacity(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#6c63ff', cursor: 'pointer' }}
          />
        </div>
      </div>

      <div style={section}>
        <span style={sectionLabel}>Canvas Size</span>
        <div style={{ ...row, marginBottom: 8 }}>
          {ARTBOARD_PRESETS.map(preset => (
            <button
              key={preset.label}
              style={modeBtn(artboard.width === preset.width && artboard.height === preset.height)}
              onClick={() => store.setArtboardSize(preset.width, preset.height)}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div style={{ ...row, marginBottom: 8 }}>
          <input
            style={inputStyle}
            type="number"
            min={128}
            max={8192}
            value={customW}
            onChange={e => setCustomW(e.target.value)}
            placeholder="W"
          />
          <input
            style={inputStyle}
            type="number"
            min={128}
            max={8192}
            value={customH}
            onChange={e => setCustomH(e.target.value)}
            placeholder="H"
          />
          <button
            style={{ ...actionBtn, flex: '0 0 auto', width: 52 }}
            onClick={() => {
              const w = Number(customW)
              const h = Number(customH)
              if (Number.isFinite(w) && Number.isFinite(h)) {
                store.setArtboardSize(w, h)
              }
            }}
          >
            Apply
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
          Active: {artboard.width} × {artboard.height}
        </div>
      </div>

      <div style={section}>
        <span style={sectionLabel}>Presets</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {PRESETS.map(preset => (
            <button
              key={preset.name}
              title={preset.name}
              onClick={() => store.applyPreset(preset.colors)}
              style={{
                padding: 0,
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 6,
                cursor: 'pointer',
                overflow: 'hidden',
                height: 36,
                background: `linear-gradient(135deg, rgb(${(preset.colors[0][0].r * 255) | 0},${(preset.colors[0][0].g * 255) | 0},${(preset.colors[0][0].b * 255) | 0}) 0%, rgb(${(preset.colors[0][2].r * 255) | 0},${(preset.colors[0][2].g * 255) | 0},${(preset.colors[0][2].b * 255) | 0}) 50%, rgb(${(preset.colors[2][2].r * 255) | 0},${(preset.colors[2][2].g * 255) | 0},${(preset.colors[2][2].b * 255) | 0}) 100%)`,
                position: 'relative',
                transition: 'transform 0.1s, box-shadow 0.1s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.transform = 'scale(1.05)'
                ;(e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.5)'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.transform = ''
                ;(e.currentTarget as HTMLElement).style.boxShadow = ''
              }}
            >
              <span style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'flex-end',
                padding: '2px 4px',
                background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 100%)',
                color: 'rgba(255,255,255,0.9)',
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: '0.04em',
              }}>
                {preset.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div style={section}>
        <span style={sectionLabel}>Grid Size</span>
        <div style={row}>
          {([3, 4, 5] as const).map(n => (
            <button key={n} style={modeBtn(grid.rows === n && grid.cols === n)} onClick={() => store.resetGrid(n, n)}>
              {n}×{n}
            </button>
          ))}
        </div>
      </div>

      <div style={{ ...section, borderBottom: 'none', paddingTop: 10 }}>
        <button
          style={{
            ...actionBtn,
            width: '100%',
            padding: '8px',
            marginBottom: 6,
            background: 'rgba(108,99,255,0.1)',
            border: '1px solid rgba(108,99,255,0.25)',
            color: 'rgba(180,175,255,0.9)',
            fontSize: 12,
          }}
          onClick={() => store.randomize()}
        >
          ✦ Randomize Colors
        </button>
        <button
          style={{ ...dangerBtn, width: '100%', padding: '7px', fontSize: 12 }}
          onClick={() => store.resetGrid(grid.rows, grid.cols)}
        >
          Reset Grid
        </button>
      </div>
    </div>
  )
}
