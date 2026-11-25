import { configured, json, LANGS } from '../_bhashini'

export function GET() {
  return json({ bhashini: configured(), languages: LANGS, voices: ['female', 'male'], via: 'vercel' })
}
