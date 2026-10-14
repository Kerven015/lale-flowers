// Turns a photo file into a small data URL for the shop's browser storage.
// Reports progress: reading the file (0-60%), decoding (60-80%), compressing (80-100%).
const MAX_SIDE = 1000
const QUALITY = 0.8

let webpOk = null
function canEncodeWebp() {
  if (webpOk === null) {
    try {
      const c = document.createElement('canvas')
      c.width = c.height = 1
      webpOk = c.toDataURL('image/webp').startsWith('data:image/webp')
    } catch {
      webpOk = false
    }
  }
  return webpOk
}

function readAsDataUrl(file, onProgress) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onprogress = (e) => { if (e.lengthComputable) onProgress((e.loaded / e.total) * 0.6) }
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(r.error || new Error('read failed'))
    r.readAsDataURL(file)
  })
}

function decode(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('not an image'))
    img.src = src
  })
}

export async function processPhoto(file, onProgress = () => {}) {
  if (!file || !String(file.type).startsWith('image/')) throw new Error('not an image')
  onProgress(0.02)
  const raw = await readAsDataUrl(file, onProgress)
  onProgress(0.65)
  const img = await decode(raw)
  onProgress(0.8)
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff' // transparent PNGs get a white background, like the gallery
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  // Give the browser a frame so the progress bar can paint before encoding.
  await new Promise((r) => requestAnimationFrame(() => r()))
  const out = canEncodeWebp() ? canvas.toDataURL('image/webp', QUALITY) : canvas.toDataURL('image/jpeg', QUALITY)
  onProgress(1)
  return out
}

// Image files from a drop / paste / file-input event.
export function imageFilesFrom(list) {
  return [...(list || [])].filter((f) => f && String(f.type).startsWith('image/'))
}
