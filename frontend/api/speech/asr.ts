import { asr, fail, guard, isLang, json } from '../_bhashini'

const MAX_B64 = Math.ceil((2 * 1024 * 1024 * 4) / 3)

export async function POST(request: Request) {
  const blocked = guard(request)
  if (blocked) return blocked
  const body = await request.json().catch(() => null)
  const audio = typeof body?.audio_base64 === 'string' ? body.audio_base64 : ''
  if (audio.length < 16 || audio.length > MAX_B64 || !isLang(body?.language)) return json({ error: 'invalid_request' }, 422)
  if (!atob(audio.slice(0, 16)).startsWith('RIFF')) return json({ error: 'not_wav', message: 'Audio must be 16 kHz mono WAV' }, 415)
  try {
    return json({ text: await asr(audio, body.language), language: body.language, engine: 'bhashini' })
  } catch (e) {
    return fail(e)
  }
}
