// A short two-tone chime for new orders (made in the browser, no sound file).
let ctx = null

// Browsers only allow sound after the user has clicked something on the page;
// call this from a click (e.g. the admin login button).
export function unlockSound() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume()
  } catch {}
}

export function playChime() {
  try {
    unlockSound()
    if (!ctx) return
    const now = ctx.currentTime
    for (const [i, freq] of [880, 1318.5].entries()) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const t0 = now + i * 0.18
      gain.gain.setValueAtTime(0.0001, t0)
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t0)
      osc.stop(t0 + 0.5)
    }
  } catch {}
}
