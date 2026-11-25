import { fail, guard, isLang, json, tts } from '../_bhashini'

export async function POST(request: Request) {
  const blocked = guard(request)
  if (blocked) return blocked
  const body = await request.json().catch(() => null)
  const text = typeof body?.text === 'string' ? body.text : ''
  if (!text.trim() || text.length > 600 || !isLang(body?.language)) return json({ error: 'invalid_request' }, 422)
  try {
    const b64 = await tts(text, body.language, body.gender === 'male' ? 'male' : 'female')
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    return new Response(bytes, { headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'private, max-age=86400' } })
  } catch (e) {
    return fail(e)
  }
}
