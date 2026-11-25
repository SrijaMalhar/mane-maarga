/* Bhashini on Vercel: lets the hosted demo speak and listen without a separate backend.
   Same two calls as backend/app/speech/bhashini.py: pipeline config, then ASR or TTS compute.
   Keys come from Vercel environment variables and never reach the browser. */
declare const process: { env: Record<string, string | undefined> }

const CONFIG_URL = 'https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline'
const MEITY_PIPELINE = '64392f96daac500b55c543cd'
export const LANGS = ['kn', 'en', 'te'] as const
export type Lang = (typeof LANGS)[number]

const env = (k: string) => process.env[`MANE_MAARGA_${k}`] ?? process.env[k]
export const configured = () => Boolean(env('BHASHINI_USER_ID') && env('BHASHINI_API_KEY'))

type Service = { url: string; authName: string; authValue: string; serviceId: string; voices: string[] }
const services = new Map<string, { at: number; svc: Service }>()
const ttsCache = new Map<string, string>()

export class SpeechError extends Error {
  constructor(public code: string, message: string, public status = 502) { super(message) }
}

async function post(url: string, headers: Record<string, string>, body: unknown) {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(25000) })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return await r.json()
    } catch (e) {
      if (attempt >= 1) throw new SpeechError('upstream_unavailable', `Bhashini did not respond: ${(e as Error).message}`)
    }
  }
}

async function service(task: 'asr' | 'tts', lang: Lang): Promise<Service> {
  const hit = services.get(`${task}:${lang}`)
  if (hit && Date.now() - hit.at < 3600_000) return hit.svc
  if (!configured()) throw new SpeechError('not_configured', 'Bhashini keys are not set', 503)
  const data = await post(CONFIG_URL, { userID: env('BHASHINI_USER_ID')!, ulcaApiKey: env('BHASHINI_API_KEY')! }, {
    pipelineTasks: [{ taskType: task, config: { language: { sourceLanguage: lang } } }],
    pipelineRequestConfig: { pipelineId: env('BHASHINI_PIPELINE_ID') || MEITY_PIPELINE },
  })
  try {
    const ep = data.pipelineInferenceAPIEndPoint
    const configs = data.pipelineResponseConfig.find((c: { taskType: string }) => c.taskType === task).config
    const cfg = configs.find((c: { language: { sourceLanguage: string } }) => c.language.sourceLanguage === lang) ?? configs[0]
    const svc = { url: ep.callbackUrl, authName: ep.inferenceApiKey.name, authValue: ep.inferenceApiKey.value, serviceId: cfg.serviceId, voices: cfg.supportedVoices ?? [] }
    services.set(`${task}:${lang}`, { at: Date.now(), svc })
    return svc
  } catch {
    throw new SpeechError('bad_config', `Bhashini has no ${task} service for ${lang}`)
  }
}

/** Text as a person would say it: no brackets, slashes or "(sample)", rupees read as a word. */
export function speakable(text: string, lang: Lang) {
  const rupee = lang === 'kn' ? 'ರೂಪಾಯಿ' : lang === 'te' ? 'రూపాయలు' : 'rupees'
  return text.replace(/\((sample|ಮಾದರಿ)\)/gi, '').replace(/₹\s?([\d,]+)/g, `$1 ${rupee}`)
    .replace(/\s*\/\s*/g, ', ').replace(/[()[\]'"“”‘’]/g, '').replace(/\s+/g, ' ').trim()
}

export async function tts(text: string, lang: Lang, gender: 'female' | 'male'): Promise<string> {
  const spoken = speakable(text, lang)
  const key = `${lang}|${gender}|${spoken}`
  const cached = ttsCache.get(key)
  if (cached) return cached
  const svc = await service('tts', lang)
  const voice = svc.voices.length && !svc.voices.includes(gender) ? svc.voices[0] : gender
  const data = await post(svc.url, { [svc.authName]: svc.authValue }, {
    pipelineTasks: [{ taskType: 'tts', config: { language: { sourceLanguage: lang }, serviceId: svc.serviceId, gender: voice, samplingRate: 22050 } }],
    inputData: { input: [{ source: spoken }] },
  })
  const audio = data?.pipelineResponse?.[0]?.audio?.[0]?.audioContent
  if (!audio) throw new SpeechError('bad_response', 'Bhashini returned no audio')
  if (ttsCache.size > 200) ttsCache.delete(ttsCache.keys().next().value as string)
  ttsCache.set(key, audio)
  return audio
}

export async function asr(wavBase64: string, lang: Lang): Promise<string> {
  const svc = await service('asr', lang)
  const data = await post(svc.url, { [svc.authName]: svc.authValue }, {
    pipelineTasks: [{ taskType: 'asr', config: { language: { sourceLanguage: lang }, serviceId: svc.serviceId, audioFormat: 'wav', samplingRate: 16000 } }],
    inputData: { audio: [{ audioContent: wavBase64 }] },
  })
  const text = data?.pipelineResponse?.[0]?.output?.[0]?.source
  if (typeof text !== 'string') throw new SpeechError('bad_response', 'Bhashini returned no transcript')
  return text.trim()
}

/* The demo is public, so these endpoints only serve our own pages and stay small. */
const hits = new Map<string, number[]>()
export function guard(request: Request): Response | null {
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  if (origin && host && new URL(origin).host !== host) return json({ error: 'forbidden_origin' }, 403)
  const ip = (request.headers.get('x-forwarded-for') ?? 'anon').split(',')[0].trim()
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter(t => now - t < 60_000)
  recent.push(now); hits.set(ip, recent)
  if (recent.length > 30) return json({ error: 'rate_limited', message: 'Too many voice requests; wait a minute.' }, 429)
  return null
}

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
export const fail = (e: unknown) => e instanceof SpeechError ? json({ error: e.code, message: e.message }, e.status) : json({ error: 'server_error' }, 500)
export const isLang = (l: unknown): l is Lang => typeof l === 'string' && (LANGS as readonly string[]).includes(l)
