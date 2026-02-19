import { useRef, useCallback, useEffect, useState } from 'react'
import type { Color } from '../mesh/types'

interface Props {
  color: Color
  onChange: (color: Color) => void
}

function colorToHex(c: Color): string {
  const r = Math.round(c.r * 255).toString(16).padStart(2, '0')
  const g = Math.round(c.g * 255).toString(16).padStart(2, '0')
  const b = Math.round(c.b * 255).toString(16).padStart(2, '0')
  return `#${r}${g}${b}`
}

function hexToColor(hex: string, a = 1): Color {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return { r, g, b, a }
}

// Convert RGB to HSV
function rgbToHsv(r: number, g: number, b: number) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  const s = max === 0 ? 0 : d / max
  const v = max

  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  return { h, s, v }
}

// Convert HSV to RGB
function hsvToRgb(h: number, s: number, v: number) {
  const i = Math.floor(h * 6)
  const f = h * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)
  switch (i % 6) {
    case 0: return { r: v, g: t, b: p }
    case 1: return { r: q, g: v, b: p }
    case 2: return { r: p, g: v, b: t }
    case 3: return { r: p, g: q, b: v }
    case 4: return { r: t, g: p, b: v }
    case 5: return { r: v, g: p, b: q }
    default: return { r: 0, g: 0, b: 0 }
  }
}

export default function ColorPicker({ color, onChange }: Props) {
  const svRef = useRef<HTMLCanvasElement>(null)
  const hueRef = useRef<HTMLCanvasElement>(null)
  const hsv = rgbToHsv(color.r, color.g, color.b)
  const [hex, setHex] = useState(colorToHex(color))

  useEffect(() => {
    setHex(colorToHex(color))
  }, [color])

  // Draw saturation-value square
  useEffect(() => {
    const canvas = svRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const w = canvas.width, h = canvas.height

    // Base: hue
    const hueColor = hsvToRgb(hsv.h, 1, 1)
    ctx.fillStyle = `rgb(${hueColor.r * 255},${hueColor.g * 255},${hueColor.b * 255})`
    ctx.fillRect(0, 0, w, h)

    // White gradient left→right
    const wGrad = ctx.createLinearGradient(0, 0, w, 0)
    wGrad.addColorStop(0, 'rgba(255,255,255,1)')
    wGrad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = wGrad
    ctx.fillRect(0, 0, w, h)

    // Black gradient top→bottom
    const bGrad = ctx.createLinearGradient(0, 0, 0, h)
    bGrad.addColorStop(0, 'rgba(0,0,0,0)')
    bGrad.addColorStop(1, 'rgba(0,0,0,1)')
    ctx.fillStyle = bGrad
    ctx.fillRect(0, 0, w, h)

    // Cursor
    const cx = hsv.s * w
    const cy = (1 - hsv.v) * h
    ctx.beginPath()
    ctx.arc(cx, cy, 7, 0, Math.PI * 2)
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy, 6, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'
    ctx.lineWidth = 1
    ctx.stroke()
  }, [hsv.h, hsv.s, hsv.v])

  // Draw hue bar
  useEffect(() => {
    const canvas = hueRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const w = canvas.width, h = canvas.height
    const grad = ctx.createLinearGradient(0, 0, w, 0)
    for (let i = 0; i <= 6; i++) {
      const rgb = hsvToRgb(i / 6, 1, 1)
      grad.addColorStop(i / 6, `rgb(${rgb.r * 255},${rgb.g * 255},${rgb.b * 255})`)
    }
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)

    // Cursor
    const cx = hsv.h * w
    ctx.beginPath()
    ctx.rect(cx - 3, 0, 6, h)
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.stroke()
  }, [hsv.h])

  const handleSVClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const s = (e.clientX - rect.left) / rect.width
    const v = 1 - (e.clientY - rect.top) / rect.height
    const rgb = hsvToRgb(hsv.h, Math.max(0, Math.min(1, s)), Math.max(0, Math.min(1, v)))
    onChange({ ...rgb, a: color.a })
  }, [hsv.h, color.a, onChange])

  const handleSVDrag = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.buttons !== 1) return
    handleSVClick(e as unknown as React.MouseEvent<HTMLCanvasElement>)
  }, [handleSVClick])

  const handleHueClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const h = (e.clientX - rect.left) / rect.width
    const rgb = hsvToRgb(Math.max(0, Math.min(1, h)), hsv.s, hsv.v)
    onChange({ ...rgb, a: color.a })
  }, [hsv.s, hsv.v, color.a, onChange])

  const handleHueDrag = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.buttons !== 1) return
    handleHueClick(e as unknown as React.MouseEvent<HTMLCanvasElement>)
  }, [handleHueClick])

  const handleHexInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setHex(val)
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      onChange(hexToColor(val, color.a))
    }
  }, [color.a, onChange])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* SV square */}
      <canvas
        ref={svRef}
        width={220}
        height={160}
        style={{ width: '100%', height: 160, borderRadius: 6, cursor: 'crosshair', display: 'block' }}
        onClick={handleSVClick}
        onPointerMove={handleSVDrag}
      />
      {/* Hue bar */}
      <canvas
        ref={hueRef}
        width={220}
        height={14}
        style={{ width: '100%', height: 14, borderRadius: 4, cursor: 'ew-resize', display: 'block' }}
        onClick={handleHueClick}
        onPointerMove={handleHueDrag}
      />
      {/* Hex input + preview */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{
          width: 28, height: 28, borderRadius: 4, flexShrink: 0,
          background: colorToHex(color),
          border: '1px solid rgba(255,255,255,0.15)',
        }} />
        <input
          value={hex}
          onChange={handleHexInput}
          style={{
            flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 4, color: '#fff', padding: '4px 8px', fontSize: 12,
            fontFamily: 'monospace', outline: 'none',
          }}
          spellCheck={false}
        />
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>
          {Math.round(color.a * 100)}
        </span>
      </div>
    </div>
  )
}
