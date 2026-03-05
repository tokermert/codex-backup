export type ExportImageFormat = 'png' | 'jpeg' | 'svg'
export type ExportVideoFormat = 'webm' | 'mp4'

export interface CaptureImageOptions {
  format: ExportImageFormat
  scale: 1 | 2 | 3
}

export interface CaptureImageResult {
  blob: Blob
  ext: 'png' | 'jpg' | 'svg'
  mime: string
  width: number
  height: number
}

export interface RecordVideoOptions {
  format: ExportVideoFormat
  durationSec: number
  fps: 24 | 30 | 60
  scale: 1 | 2 | 3
}

export interface RecordVideoResult {
  blob: Blob
  ext: 'webm' | 'mp4'
  mime: string
  width: number
  height: number
  usedFallback: boolean
}

export interface MeshExportApi {
  captureImage: (options: CaptureImageOptions) => Promise<CaptureImageResult>
  recordVideo: (options: RecordVideoOptions) => Promise<RecordVideoResult>
}

declare global {
  interface Window {
    __meshExportApi?: MeshExportApi
  }
}

export function getMeshExportApi() {
  return window.__meshExportApi
}

