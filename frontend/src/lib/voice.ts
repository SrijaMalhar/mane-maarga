/* Voice for intake, in order of how human it sounds:
   1. A real person's recording of the prompt (public/audio/<lang>/<key>.mp3, listed in prompts.json).
   2. Bhashini's Indian-language voices, synthesised on our server at 22.05 kHz.
   3. The browser's own voice, but only if it has a real voice for that language. Kannada read by an
      English voice is what sounds most machine-made, so in that case we stay silent and show the text. */
/** Who answers /api/speech/*: our API when signed in; the site's own Vercel function in the demo. */
export type SpeechFetch = (path: string, init?: RequestInit) => Promise<Response>
export const sameOrigin: SpeechFetch = (path, init) => fetch(path, init)
export const viaApi = (raw: (p: string, i?: RequestInit) => Promise<Response>): SpeechFetch => raw

export type Lang = 'kn' | 'en' | 'te'
export type Gender = 'female' | 'male'
type Manifest = { recorded: Record<Lang, string[]>; prompts: Record<Lang, Record<string, string>> }

let manifest: Promise<Manifest | null> | null = null
const loadManifest = () => (manifest ??= fetch('/audio/prompts.json').then(r => (r.ok ? r.json() : null)).catch(() => null))
const bcp = (l: Lang) => (l === 'kn' ? 'kn-IN' : l === 'te' ? 'te-IN' : 'en-IN')
let current: HTMLAudioElement | null = null

export function stopSpeaking() {
  current?.pause(); current = null
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
}

function play(src: string): Promise<void> {
  stopSpeaking()
  const a = new Audio(src)
  a.playbackRate = 0.94 // a touch slower reads as calmer and more natural
  a.preservesPitch = true
  current = a
  return new Promise((resolve, reject) => { a.onended = () => resolve(); a.onerror = () => reject(new Error('audio failed')); a.play().catch(reject) })
}

function browserVoice(lang: Lang, gender: Gender): SpeechSynthesisVoice | null {
  if (!('speechSynthesis' in window)) return null
  const voices = window.speechSynthesis.getVoices().filter(v => v.lang.replace('_', '-').toLowerCase().startsWith(bcp(lang).slice(0, 2)))
  const want = gender === 'female' ? /female|woman|heera|sangeeta|veena|swara/i : /male|man|ravi|hemant|prabhat/i
  return voices.find(v => want.test(v.name)) ?? voices.find(v => !v.localService) ?? voices[0] ?? null
}

export type VoiceSource = 'recorded' | 'bhashini' | 'browser' | 'none'

/** Speak one assistant message. Returns which voice was used ('none' means show the text only). */
export async function speak(text: string, lang: Lang, opts: { fetcher: SpeechFetch; bhashini: boolean; gender: Gender }): Promise<VoiceSource> {
  const m = await loadManifest()
  if (m) {
    const key = Object.entries(m.prompts[lang] ?? {}).find(([, t]) => t === text)?.[0]
    if (key && m.recorded[lang]?.includes(key)) {
      try { await play(`/audio/${lang}/${key}.mp3`); return 'recorded' } catch { /* fall through */ }
    }
  }
  if (opts.bhashini) {
    try {
      const r = await opts.fetcher('/api/speech/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, language: lang, gender: opts.gender }) })
      if (r.ok) { const url = URL.createObjectURL(await r.blob()); void play(url).finally(() => URL.revokeObjectURL(url)); return 'bhashini' }
    } catch { /* fall through */ }
  }
  const v = browserVoice(lang, opts.gender)
  if (!v) return 'none'
  stopSpeaking()
  const u = new SpeechSynthesisUtterance(text.replace(/\((sample|ಮಾದರಿ)\)/gi, '').replace(/\s*\/\s*/g, ', ').replace(/[()]/g, ''))
  u.voice = v; u.lang = v.lang; u.rate = 0.9; u.pitch = 1
  window.speechSynthesis.speak(u)
  return 'browser'
}

/* ---- Recording: microphone → 16 kHz mono 16-bit WAV, the format Bhashini ASR expects. ---- */

function encodeWav(samples: Float32Array, rate: number): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(buf)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true)
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, samples.length * 2, true)
  samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true))
  return buf
}

export type Recording = { stop: () => Promise<string> }

/** Start recording; `stop()` resolves to base64 WAV. Stops on its own after `maxSeconds`. */
export async function startRecording(maxSeconds = 30): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, noiseSuppression: true, echoCancellation: true } })
  const rec = new MediaRecorder(stream)
  const chunks: Blob[] = []
  rec.ondataavailable = e => chunks.push(e.data)
  rec.start()
  const timer = window.setTimeout(() => rec.state === 'recording' && rec.stop(), maxSeconds * 1000)
  const done = new Promise<string>((resolve, reject) => {
    rec.onstop = async () => {
      window.clearTimeout(timer); stream.getTracks().forEach(t => t.stop())
      try {
        const decoded = await new AudioContext().decodeAudioData(await new Blob(chunks).arrayBuffer())
        const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000)
        const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start()
        const wav = encodeWav((await off.startRendering()).getChannelData(0), 16000)
        let bin = ''; new Uint8Array(wav).forEach(b => { bin += String.fromCharCode(b) })
        resolve(btoa(bin))
      } catch (e) { reject(e) }
    }
  })
  return { stop: () => { if (rec.state === 'recording') rec.stop(); return done } }
}
