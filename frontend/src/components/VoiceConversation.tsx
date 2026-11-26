/* The intake conversation, as a family hears it: the eight recorded Kannada questions in order, each
   followed by an example answer. The waveform is drawn live from the audio being played. */
import { useEffect, useRef, useState } from 'react'
import { Pause, Play, RotateCcw, Volume2 } from 'lucide-react'

const LINES: Array<{ key: string; kn: string; en: string; reply: string; replyEn: string }> = [
  { key: 'start', kn: 'ನಮಸ್ಕಾರ. ನಿಮ್ಮ ಮನೆ ಕೆಲಸಕ್ಕೆ ಸಹಾಯ ಮಾಡೋಕೆ ಕೆಲವು ವಿಷಯ ಕೇಳ್ತೀನಿ. ಮೊದಲು, ನಿಮ್ಮ ಹೆಸರು ಹೇಳಿ.', en: 'Namaskara. I will ask a few things so we can help with your house. First, tell me your name.', reply: 'ಲಕ್ಷ್ಮಮ್ಮ', replyEn: 'Lakshmamma' },
  { key: 'beneficiary_name', kn: 'ಸರಿ. ನಿಮ್ಮ ಊರು ಯಾವುದು?', en: 'All right. Which is your village?', reply: 'ಹೊಸಹಳ್ಳಿ', replyEn: 'Hosahalli' },
  { key: 'village', kn: 'ಆ ಊರು ಯಾವ ತಾಲ್ಲೂಕಿಗೆ ಸೇರುತ್ತೆ?', en: 'Which taluk is that village in?', reply: 'ಮಾಗಡಿ', replyEn: 'Magadi' },
  { key: 'taluk', kn: 'ಮನೆ ಕಟ್ಟೋಕೆ ನಿಮ್ಮದೇ ಜಾಗ ಇದೆಯಾ? ಹೌದು, ಇಲ್ಲ, ಅಥವಾ ಗೊತ್ತಿಲ್ಲ ಅಂತ ಹೇಳಿ.', en: 'Do you have your own land to build on? Say yes, no, or not sure.', reply: 'ಹೌದು', replyEn: 'Yes' },
  { key: 'land_status', kn: 'ಮನೆಯಲ್ಲಿ ಒಟ್ಟು ಎಷ್ಟು ಜನ ಇದ್ದೀರಿ?', en: 'How many people live in the house?', reply: 'ನಾಲ್ಕು ಜನ', replyEn: 'Four' },
  { key: 'household_size', kn: 'ಈಗ ಮೊದಲು ಯಾವ ಸಹಾಯ ಬೇಕು? ದಾಖಲೆ ಕೆಲಸ, ಯೋಜನೆಯ ಮಾಹಿತಿ, ಖರ್ಚಿನ ಅಂದಾಜು, ಅಥವಾ ಕಟ್ಟಡದ ಹಂತಗಳು?', en: 'What help do you need first: documents, scheme information, a cost estimate, or construction stages?', reply: 'ಖರ್ಚಿನ ಅಂದಾಜು', replyEn: 'A cost estimate' },
  { key: 'housing_need', kn: 'ನಿಮಗೆ ಇಷ್ಟ ಇದ್ದರೆ ಮಾತ್ರ, ಫೋನ್ ನಂಬರಿನ ಕೊನೆಯ ನಾಲ್ಕು ಅಂಕಿ ಹೇಳಿ. ಬೇಡ ಅಂದರೆ, ಬೇಡ ಅನ್ನಿ.', en: 'Only if you wish, tell me the last four digits of your phone number. If not, just say no.', reply: 'ಏಳು ಮೂರು ಒಂದು ಸೊನ್ನೆ', replyEn: 'Seven three one zero' },
  { key: 'phone_last4', kn: 'ತುಂಬಾ ಧನ್ಯವಾದ. ನಮ್ಮ ಸಿಬ್ಬಂದಿ ಈ ವಿವರ ನೋಡಿ ನಿಮ್ಮ ಕಡತ ತೆರೆಯುತ್ತಾರೆ. ಇನ್ನೂ ಯಾವ ಸರ್ಕಾರಿ ಅರ್ಜಿಯನ್ನೂ ಹಾಕಿಲ್ಲ.', en: 'Thank you very much. Our staff will review this and open your file. No government application has been made yet.', reply: '', replyEn: '' },
]
const BARS = 28

export default function VoiceConversation() {
  const [at, setAt] = useState(-1) // line being spoken; -1 before start
  const [playing, setPlaying] = useState(false)
  const [shown, setShown] = useState(0) // how many lines are visible
  const [progress, setProgress] = useState(0)
  const audio = useRef<HTMLAudioElement | null>(null)
  const ctx = useRef<{ ac: AudioContext; an: AnalyserNode } | null>(null)
  const bars = useRef<HTMLSpanElement[]>([])
  const raf = useRef(0)
  const timer = useRef(0)
  const list = useRef<HTMLOListElement | null>(null)
  const silent = useRef(0)
  const [fallback, setFallback] = useState(false)
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  useEffect(() => () => { audio.current?.pause(); cancelAnimationFrame(raf.current); window.clearTimeout(timer.current); void ctx.current?.ac.close() }, [])
  useEffect(() => {
    // Scroll only the conversation box, never the page under the reader.
    const box = list.current
    const line = box?.querySelector<HTMLElement>('.vc-line.now')
    if (!box || !line) return
    const top = line.offsetTop - 16
    const bottom = top + line.offsetHeight + 32
    if (top < box.scrollTop || bottom > box.scrollTop + box.clientHeight) box.scrollTo({ top: Math.max(0, bottom - box.clientHeight), behavior: reduced ? 'auto' : 'smooth' })
  }, [at, shown, reduced])

  function draw() {
    const an = ctx.current?.an, a = audio.current
    if (an && a) {
      const data = new Uint8Array(an.frequencyBinCount)
      an.getByteFrequencyData(data)
      // Some browsers hide audio levels (or play silently); after a moment, show a gentle pulse instead.
      if (!a.paused && data.every(v => v === 0)) { if (++silent.current === 45) setFallback(true) } else if (data.some(v => v > 0)) { silent.current = 0; setFallback(false) }
      bars.current.forEach((el, i) => { if (el) el.style.transform = `scaleY(${Math.max(0.08, (data[2 + i * 2] ?? 0) / 255)})` })
      if (a.duration) setProgress(a.currentTime / a.duration)
    }
    raf.current = requestAnimationFrame(draw)
  }

  function ensureAudio() {
    if (audio.current) return audio.current
    const a = new Audio(); a.preload = 'auto'; a.crossOrigin = 'anonymous'
    audio.current = a
    try {
      const ac = new AudioContext(); const an = ac.createAnalyser(); an.fftSize = 128; an.smoothingTimeConstant = 0.75
      ac.createMediaElementSource(a).connect(an); an.connect(ac.destination)
      ctx.current = { ac, an }
    } catch { /* no Web Audio: play without the waveform */ }
    return a
  }

  function speak(i: number) {
    if (i >= LINES.length) { setPlaying(false); setAt(-1); setProgress(0); cancelAnimationFrame(raf.current); bars.current.forEach(el => el && (el.style.transform = 'scaleY(.08)')); return }
    const a = ensureAudio()
    setAt(i); setShown(s => Math.max(s, i + 1)); setProgress(0)
    a.src = `/audio/kn/${LINES[i].key}.mp3`
    a.onended = () => {
      setProgress(1)
      // the family's answer appears, then the next question
      timer.current = window.setTimeout(() => speak(i + 1), LINES[i].reply ? 1300 : 300)
    }
    void ctx.current?.ac.resume()
    void a.play().catch(() => setPlaying(false))
  }

  function toggle() {
    if (playing) { audio.current?.pause(); window.clearTimeout(timer.current); cancelAnimationFrame(raf.current); setPlaying(false); return }
    setPlaying(true); cancelAnimationFrame(raf.current); draw()
    if (at >= 0 && audio.current && !audio.current.ended && audio.current.currentTime > 0) { void ctx.current?.ac.resume(); void audio.current.play() } else speak(at >= 0 ? at : 0)
  }
  function restart() { audio.current?.pause(); window.clearTimeout(timer.current); setShown(0); setAt(-1); setPlaying(true); cancelAnimationFrame(raf.current); draw(); speak(0) }

  return (
    <section className="l-voice" id="voice" aria-labelledby="voice-title">
      <div className="vc-intro">
        <p className="eyebrow">Hear it in Kannada</p>
        <h2 id="voice-title" className="display-2">A conversation, not a form.</h2>
        <p>Families answer by talking. The questions are written the way people speak in a village and recorded in a warm voice, so the first contact feels like a neighbour asking, not an office.</p>
        <div className="vc-controls">
          <button className="vc-play" onClick={toggle} aria-pressed={playing}>
            {playing ? <Pause size={22} /> : <Play size={22} />}
            <span>{playing ? 'Pause' : at >= 0 ? 'Resume' : 'Play the conversation'}<small>{LINES.length} questions · about a minute</small></span>
          </button>
          {shown > 0 && <button className="vc-restart" onClick={restart} aria-label="Start again"><RotateCcw size={18} /></button>}
        </div>
        <div className={`vc-wave${playing ? ' on' : ''}${fallback || !ctx.current ? ' pulse' : ''}`} aria-hidden>{Array.from({ length: BARS }, (_, i) => <span key={i} ref={el => { if (el) bars.current[i] = el }} />)}</div>
        <p className="vc-credit"><Volume2 size={14} /> Voice: Indic Parler-TTS (AI4Bharat), speaker Anu. Answers can be spoken back; Bhashini turns them into text.</p>
      </div>
      <ol className="vc-chat" ref={list} aria-live="polite">
        {LINES.slice(0, Math.max(shown, 1)).map((l, i) => (
          <li key={l.key} className={`vc-line${i === at ? ' now' : ''}${shown === 0 ? ' ghost' : ''}`}>
            <div className="vc-q">
              <p lang="kn">{l.kn}</p>
              <p className="vc-en">{l.en}</p>
              {i === at && <span className="vc-progress" aria-hidden><i style={{ width: `${progress * 100}%` }} /></span>}
            </div>
            {l.reply && (i < at || (i === at && progress >= 1) || (!playing && i < shown - 1)) && (
              <div className="vc-a"><p lang="kn">{l.reply}</p><p className="vc-en">{l.replyEn}</p></div>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
