/**
 * Illustrations for the guided tour: one scene per step of a family's journey to a finished house.
 * Flat drawings in the app's own palette; every scene is 480 x 320 and decorative (aria-hidden),
 * because the step's text carries the meaning.
 */
import type { ReactNode } from 'react'

const C = {
  sky: '#E9E2D2', paper: '#F4EFE4', ink: '#22211E', ink2: '#5B574F', laterite: '#A5442B', brick: '#B65C3E',
  neem: '#1F3D2F', leaf: '#4E7A4A', stamp: '#3A3F8C', red: '#C23A2B', gold: '#C98F1A', soil: '#B7774F',
  wall: '#E8D7B4', skin: '#8A5A3C', skin2: '#6E4630', sari: '#B0433A', sari2: '#2F6B5A', shirt: '#EDE6D6', grey: '#9C978C',
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 480 320" className="tour-art" aria-hidden focusable="false">
      <rect width="480" height="320" fill={C.sky} />
      <path d="M0 236 C 80 222 140 230 220 226 S 380 220 480 230 V320 H0Z" fill="#D9C7A2" />
      <rect y="248" width="480" height="72" fill={C.soil} opacity=".55" />
      {children}
    </svg>
  )
}

const Palm = ({ x, s = 1 }: { x: number; s?: number }) => (
  <g transform={`translate(${x} 248) scale(${s})`}>
    <path d="M0 0 C 3 -40 -2 -80 6 -118" stroke="#7A5C40" strokeWidth="6" fill="none" />
    {[-60, -25, 15, 50, 95].map(a => <path key={a} d={`M6 -118 q ${Math.cos((a * Math.PI) / 180) * 30} ${-20 + Math.abs(a) / 6} ${Math.cos((a * Math.PI) / 180) * 52} ${8 + Math.abs(a) / 3}`} stroke={C.leaf} strokeWidth="6" fill="none" strokeLinecap="round" />)}
  </g>
)

/** A person: x at the feet, h total height. kind sets clothes. */
function Person({ x, y = 248, h = 120, kind = 'woman', flip = false, children }: { x: number; y?: number; h?: number; kind?: 'woman' | 'officer' | 'child' | 'elder'; flip?: boolean; children?: ReactNode }) {
  const s = h / 120
  const body = kind === 'officer' ? C.shirt : kind === 'child' ? C.gold : kind === 'elder' ? C.sari2 : C.sari
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      {kind === 'officer' ? <>
        <rect x="-11" y="-58" width="9" height="58" rx="3" fill={C.ink2} /><rect x="2" y="-58" width="9" height="58" rx="3" fill={C.ink2} />
        <path d="M-17 -100 h34 l3 44 h-40z" fill={body} stroke="#CFC6B2" />
        <path d="M-4 -100 v20 M4 -100 v20" stroke="#CFC6B2" />
      </> : <>
        <path d={`M-18 0 C -20 -40 -16 -80 -14 -100 H14 C 18 -80 22 -40 20 0Z`} fill={body} />
        <path d="M-14 -100 C 0 -84 10 -60 20 -18" stroke={kind === 'elder' ? '#D8C27A' : C.gold} strokeWidth="5" fill="none" />
      </>}
      <rect x="-4" y="-108" width="8" height="10" fill={C.skin} />
      <circle cx="0" cy="-116" r="12" fill={C.skin} />
      {kind === 'officer' ? <path d="M-12 -120 q12 -14 24 0 v-4 q-12 -12 -24 0z" fill={C.ink} />
        : <path d="M-12 -114 q-2 -18 12 -16 q14 -2 12 16 q-2 -10 -12 -10 q-10 0 -12 10z" fill={kind === 'elder' ? '#BDB6A8' : C.ink} />}
      {kind !== 'officer' && kind !== 'child' && <circle cx="0" cy="-127" r="4" fill={kind === 'elder' ? '#BDB6A8' : C.ink} />}
      {children}
    </g>
  )
}

const Hut = ({ x }: { x: number }) => (
  <g transform={`translate(${x} 248)`}>
    <rect x="0" y="-70" width="120" height="70" fill="#C9A77E" />
    <path d="M-12 -66 L60 -112 L132 -66Z" fill="#8C7A55" />
    {[0, 1, 2, 3, 4, 5].map(i => <path key={i} d={`M${-6 + i * 24} -66 l${8 + i * 2} -28`} stroke="#6F603F" strokeWidth="2" />)}
    <rect x="46" y="-46" width="28" height="46" fill="#4A3826" />
    <path d="M10 -40 h22 M88 -30 h20 M14 -20 h18" stroke="#A88458" strokeWidth="3" />
  </g>
)

function House({ x, stage, w = 150 }: { x: number; stage: 0 | 1 | 2 | 3 | 4; w?: number }) {
  const s = w / 150
  return (
    <g transform={`translate(${x} 248) scale(${s})`}>
      {stage >= 1 && <rect x="-6" y="-14" width="162" height="14" fill="#8F877A" />}
      {stage === 1 && [14, 52, 98, 136].map(rx => <path key={rx} d={`M${rx} -14 v-46 M${rx + 5} -14 v-46`} stroke="#4E4842" strokeWidth="2.5" />)}
      {stage >= 2 && <>
        <rect x="0" y="-96" width="150" height="82" fill={stage >= 4 ? C.wall : C.brick} />
        {stage < 4 && Array.from({ length: 6 }, (_, r) => <path key={r} d={`M0 ${-24 - r * 13} H150`} stroke="#D8B79C" strokeWidth="1.5" />)}
        <rect x="62" y="-62" width="26" height="48" fill={stage >= 4 ? C.neem : '#4A3826'} />
        <rect x="16" y="-70" width="28" height="22" fill={stage >= 4 ? C.neem : '#4A3826'} />
        <rect x="106" y="-70" width="28" height="22" fill={stage >= 4 ? C.neem : '#4A3826'} />
        <rect x="-2" y="-80" width="154" height="6" fill="#B9B2A4" />
      </>}
      {stage === 2 && <><path d="M-16 0 V-110 M166 0 V-110 M-16 -60 H166" stroke="#9A7444" strokeWidth="4" /></>}
      {stage >= 3 && <><rect x="-6" y="-104" width="162" height="10" fill="#B9B2A4" /><path d="M-14 -102 L75 -150 L164 -102Z" fill={C.laterite} /><path d="M10 -112 L140 -112 M30 -124 L120 -124 M50 -136 L100 -136" stroke="#8E3A24" strokeWidth="2" /></>}
      {stage >= 4 && <><path d="M60 -64 q15 10 30 0" stroke={C.leaf} strokeWidth="4" fill="none" /><rect x="58" y="-90" width="34" height="10" fill="#FFF8EC" stroke={C.ink2} strokeWidth=".8" /></>}
    </g>
  )
}

const Bubble = ({ x, y, w, children, tail = 'left', tone = C.paper }: { x: number; y: number; w: number; children: ReactNode; tail?: 'left' | 'right'; tone?: string }) => (
  <g transform={`translate(${x} ${y})`}>
    <rect width={w} height="44" rx="10" fill={tone} stroke={C.ink} strokeWidth="1.5" />
    <path d={tail === 'left' ? 'M18 44 l-6 14 l18 -14' : `M${w - 30} 44 l18 14 l-6 -14`} fill={tone} stroke={C.ink} strokeWidth="1.5" strokeLinejoin="round" />
    <rect x={tail === 'left' ? 13 : w - 31} y="41" width="18" height="5" fill={tone} />
    {children}
  </g>
)

function Phone({ x, y, w = 92, children, tilt = 0 }: { x: number; y: number; w?: number; children?: ReactNode; tilt?: number }) {
  const h = w * 1.9
  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt})`}>
      <rect width={w} height={h} rx="12" fill={C.ink} />
      <rect x="6" y="14" width={w - 12} height={h - 28} rx="4" fill="#FBF8F1" />
      <rect x={w / 2 - 10} y="5" width="20" height="4" rx="2" fill="#4A4740" />
      <g transform="translate(6 14)">{children}</g>
    </g>
  )
}

const K = ({ x, y, children, size = 13, fill = C.ink, anchor = 'start', weight = 600 }: { x: number; y: number; children: ReactNode; size?: number; fill?: string; anchor?: 'start' | 'middle' | 'end'; weight?: number }) => (
  <text x={x} y={y} fontFamily="Anek Kannada, Anek Latin, sans-serif" fontSize={size} fontWeight={weight} fill={fill} textAnchor={anchor}>{children}</text>
)
const M = ({ x, y, children, size = 11, fill = C.ink, anchor = 'start' }: { x: number; y: number; children: ReactNode; size?: number; fill?: string; anchor?: 'start' | 'middle' | 'end' }) => (
  <text x={x} y={y} fontFamily="IBM Plex Mono, monospace" fontSize={size} fill={fill} textAnchor={anchor}>{children}</text>
)

/* ---------- the nine scenes ---------- */

function Problem() {
  return (
    <Frame>
      <Palm x={30} s={0.8} /><Palm x={455} s={0.9} />
      <House x={22} stage={1} w={92} /><House x={128} stage={2} w={92} /><House x={234} stage={1} w={92} /><House x={340} stage={4} w={92} />
      <path d="M22 252 h92 M128 252 h92 M234 252 h92" stroke={C.red} strokeWidth="3" strokeDasharray="6 5" />
      <M x={68} y={272} anchor="middle" fill={C.red}>waiting</M><M x={174} y={272} anchor="middle" fill={C.red}>waiting</M><M x={280} y={272} anchor="middle" fill={C.red}>waiting</M>
      <M x={386} y={272} anchor="middle" fill={C.neem}>keys</M>
      <rect x="22" y="290" width="410" height="10" fill="#E2D6BE" /><rect x="22" y="290" width={410 * 0.304} height="10" fill={C.neem} />
      <M x={22} y={314} size={10} fill={C.ink2}>30.4% of sanctioned houses finished in Karnataka (7 Aug 2025)</M>
    </Frame>
  )
}

function Voice() {
  return (
    <Frame>
      <Palm x={448} />
      <Hut x={250} />
      <Person x={322} kind="elder" h={116} flip />
      <Person x={118} kind="officer" h={128}>
        <rect x="14" y="-92" width="14" height="24" rx="2" fill={C.ink} transform="rotate(-12)" />
        <path d="M14 -96 q14 4 16 22" stroke={C.skin} strokeWidth="7" fill="none" strokeLinecap="round" />
      </Person>
      <Bubble x={32} y={46} w={196}><K x={14} y={28} size={15}>ನಿಮ್ಮ ಮನೆಯಲ್ಲಿ ಎಷ್ಟು ಜನ?</K></Bubble>
      <Bubble x={264} y={64} w={150} tail="right" tone="#FFF7E2"><K x={14} y={28} size={15}>ಐದು ಜನ</K>{[0, 1, 2, 3, 4, 5, 6].map(i => <rect key={i} x={86 + i * 8} y={22 - (i % 3) * 4} width="4" height={8 + (i % 3) * 8} rx="2" fill={C.laterite} />)}</Bubble>
      <M x={32} y={308} size={10} fill={C.ink2}>8 questions, asked aloud in Kannada; answers typed in for the officer</M>
    </Frame>
  )
}

function Consent() {
  return (
    <Frame>
      <Hut x={330} />
      <Person x={250} kind="woman" h={118} flip />
      <Person x={64} kind="officer" h={124} />
      <Phone x={128} y={40} w={98}>
        <rect width="86" height="20" fill={C.neem} /><K x={8} y={14} size={10} fill="#fff">ಒಪ್ಪಿಗೆ · Consent</K>
        {[30, 40, 50, 60, 70, 80].map(y => <rect key={y} x="8" y={y} width={y % 20 ? 62 : 70} height="4" rx="2" fill="#D9D1C1" />)}
        <rect x="8" y="96" width="14" height="14" rx="2" fill={C.neem} /><path d="M11 103 l3 3 l6 -7" stroke="#fff" strokeWidth="2" fill="none" />
        <K x={28} y={107} size={9}>ನಾನು ಒಪ್ಪುತ್ತೇನೆ</K>
        <rect x="8" y="122" width="70" height="20" rx="4" fill={C.neem} /><K x={43} y={136} size={10} fill="#fff" anchor="middle">Record</K>
      </Phone>
      <M x={24} y={308} size={10} fill={C.ink2}>No consent, no next step: the case cannot move forward without it</M>
    </Frame>
  )
}

function Papers() {
  return (
    <Frame>
      <g transform="translate(40 30) rotate(-4)">
        <rect width="210" height="250" fill="#FFFDF6" stroke={C.ink2} />
        <rect x="0" y="0" width="210" height="28" fill="#EDE4CF" /><K x={12} y={19} size={12}>ಪಹಣಿ · RTC land record</K>
        {[['Owner', 'Saroja B'], ['Village', 'Kudur'], ['Survey no.', '112/3'], ['Extent', '0-04']].map(([a, b], i) => (
          <g key={a} transform={`translate(12 ${56 + i * 40})`}><M x={0} y={0} size={10} fill={C.ink2}>{a}</M><K x={0} y={20} size={15}>{b}</K></g>
        ))}
        <path d="M8 130 h70" stroke={C.red} strokeWidth="2.5" /><path d="M4 120 q40 -10 84 2" stroke={C.red} strokeWidth="2" fill="none" />
        <circle cx="160" cy="210" r="26" fill="none" stroke={C.stamp} strokeWidth="2.5" /><M x={160} y={214} anchor="middle" size={9} fill={C.stamp}>TALUK</M>
      </g>
      <g transform="translate(272 44)">
        <rect width="170" height="200" rx="4" fill="#F3E3B8" stroke="#BFA46A" /><rect x="0" y="-10" width="70" height="14" rx="3" fill="#F3E3B8" stroke="#BFA46A" />
        <K x={12} y={26} size={12}>Case file #7</K>
        {[['Owner', 'Saroja B', true], ['Village', 'Bidadi', false], ['Survey no.', '112/3', true]].map(([a, b, ok], i) => (
          <g key={String(a)} transform={`translate(12 ${58 + i * 44})`}>
            <M x={0} y={0} size={10} fill={C.ink2}>{a}</M><K x={0} y={20} size={15}>{b}</K>
            <circle cx="138" cy="12" r="11" fill={ok ? C.neem : C.red} />
            <path d={ok ? 'M132 12 l4 4 l8 -9' : 'M133 7 l10 10 M143 7 l-10 10'} stroke="#fff" strokeWidth="2.5" fill="none" />
          </g>
        ))}
      </g>
      <path d="M300 268 l30 -30" stroke={C.red} strokeWidth="6" strokeLinecap="round" /><path d="M296 272 l4 -4" stroke={C.ink} strokeWidth="6" strokeLinecap="round" />
      <M x={272} y={292} size={10} fill={C.red}>Village differs: Kudur vs Bidadi</M>
    </Frame>
  )
}

function Money() {
  const rungs = [['Plinth', 85, 30], ['Lintel', 102, 42], ['Roof', 102, 30], ['Finishing', 51, 18]] as const
  return (
    <Frame>
      <path d="M44 290 L74 26 M124 290 L154 26" stroke="#7A5C40" strokeWidth="7" strokeLinecap="round" />
      {rungs.map(([l], i) => <g key={l}><path d={`M${50 + i * 7} ${246 - i * 62} H${130 + i * 7}`} stroke="#7A5C40" strokeWidth="6" strokeLinecap="round" /><K x={176} y={251 - i * 62} size={13}>{l}</K></g>)}
      {rungs.map(([l, cost, inst], i) => (
        <g key={`${l}b`} transform={`translate(252 ${222 - i * 62})`}>
          <rect width={cost * 1.2} height="16" fill={C.laterite} opacity=".85" /><rect y="18" width={inst * 1.2} height="10" fill={C.neem} /><M x={inst * 1.2 + 6} y={27} size={9} fill={C.neem}>₹{(inst * 1000).toLocaleString('en-IN')}</M>
          <M x={cost * 1.2 + 6} y={13} size={10}>₹{(cost * 1000).toLocaleString('en-IN')}</M>
        </g>
      ))}
      <circle cx="70" cy="120" r="10" fill={C.gold} /><circle cx="82" cy="112" r="10" fill={C.gold} stroke="#A9781A" /><M x={82} y={116} size={9} anchor="middle">₹</M>
      <M x={24} y={308} size={10} fill={C.ink2}>red: stage cost · green: its instalment · gap paid first</M>
    </Frame>
  )
}

function Approve() {
  return (
    <Frame>
      <Hut x={20} />
      <Person x={210} kind="woman" h={122}>
        <path d="M14 -94 q16 6 20 26" stroke={C.skin} strokeWidth="7" fill="none" strokeLinecap="round" />
      </Person>
      <Phone x={262} y={18} w={128}>
        <rect width="116" height="24" fill={C.laterite} /><K x={8} y={16} size={11} fill="#fff">ಸಾಲಕ್ಕೆ ನಿಮ್ಮ ಒಪ್ಪಿಗೆ</K>
        <K x={8} y={42} size={11}>₹70,000 ಸಾಲ</K>
        <K x={8} y={58} size={9} fill={C.ink2} weight={450}>3 ಅಂಶ ಕಡಿಮೆ ಬಡ್ಡಿ</K>
        {[4, 8, 2, 9, 1, 6].map((d, i) => <g key={i}><rect x={8 + i * 17} y="78" width="14" height="22" rx="3" fill="#fff" stroke={C.ink} /><M x={15 + i * 17} y={94} anchor="middle" size={12}>{d}</M></g>)}
        <rect x="8" y="112" width="100" height="24" rx="5" fill={C.neem} /><K x={58} y={128} size={11} fill="#fff" anchor="middle">ಒಪ್ಪುತ್ತೇನೆ · I agree</K>
        <rect x="8" y="142" width="100" height="24" rx="5" fill="none" stroke={C.ink2} /><K x={58} y={158} size={11} anchor="middle">ಬೇಡ · No</K>
        <M x={8} y={186} size={8} fill={C.ink2}>valid 5 min · 3 tries</M>
      </Phone>
      <M x={24} y={308} size={10} fill={C.ink2}>Nothing with money happens until the family says yes</M>
    </Frame>
  )
}

function Photo() {
  return (
    <Frame>
      <Palm x={40} s={0.9} />
      <House x={120} stage={2} w={170} />
      <g transform="translate(205 226)">
        <circle r="70" fill="none" stroke={C.neem} strokeWidth="2" strokeDasharray="5 5" />
        <path d="M0 -30 c-12 0 -20 9 -20 20 c0 16 20 34 20 34 s20 -18 20 -34 c0 -11 -8 -20 -20 -20z" fill={C.laterite} /><circle cy="-10" r="7" fill="#fff" />
      </g>
      <Person x={392} kind="officer" h={120} flip>
        <path d="M-14 -96 q-18 6 -24 22" stroke={C.skin} strokeWidth="7" fill="none" strokeLinecap="round" />
      </Person>
      <g transform="translate(330 70)"><rect width="34" height="54" rx="5" fill={C.ink} /><rect x="3" y="6" width="28" height="40" fill="#9CB8CF" /></g>
      <g transform="translate(330 20)">
        <rect width="132" height="46" rx="6" fill={C.paper} stroke={C.ink} />
        <M x={8} y={16} size={10}>25 m from plot</M><M x={8} y={30} size={10}>taken 2 h ago</M><M x={8} y={42} size={10} fill={C.neem}>not seen before</M>
        <circle cx="118" cy="14" r="7" fill={C.neem} /><circle cx="118" cy="28" r="7" fill={C.neem} /><circle cx="118" cy="40" r="5" fill={C.neem} />
      </g>
      <M x={24} y={308} size={10} fill={C.ink2}>GPS, capture time and a fingerprint checked; a person decides</M>
    </Frame>
  )
}

function Recorder() {
  const blocks = ['PLAN', 'ACT', 'ACT', 'ACT', 'CHECK', 'DONE']
  const col = (p: string) => (p === 'PLAN' ? C.stamp : p === 'ACT' ? C.neem : p === 'CHECK' ? C.gold : C.ink)
  return (
    <Frame>
      <rect x="18" y="76" width="444" height="120" fill="#FBF8F1" stroke={C.ink} strokeWidth="2" />
      {blocks.map((b, i) => (
        <g key={i} transform={`translate(${26 + i * 73} 84)`}>
          <rect width="64" height="104" fill={i === 3 ? '#fff' : C.paper} stroke="#CFC6B2" />
          <rect width="64" height="6" fill={col(b)} />
          <M x={6} y={22} size={10} fill={col(b)}>{b}</M>
          {[36, 46, 56].map(y => <rect key={y} x="6" y={y} width={y === 46 ? 40 : 50} height="4" rx="2" fill="#DDD5C5" />)}
          <M x={6} y={92} size={8} fill={C.ink2}>{['9c41e0', '3f8a12', 'a07d5b', '51e2c9', '0b6f3d', 'e48a07'][i]}</M>
          {i > 0 && <g transform="translate(-9 52)"><circle r="8" fill={C.paper} stroke={C.ink2} /><path d="M-4 0 h8" stroke={C.ink2} strokeWidth="2" /></g>}
        </g>
      ))}
      <path d="M18 212 H462" stroke="#DDD5C5" strokeWidth="4" /><path d="M18 212 H300" stroke={C.ink} strokeWidth="4" />
      <g transform="translate(250 236)"><circle r="18" fill="none" stroke={C.ink} strokeWidth="4" /><path d="M13 13 l16 16" stroke={C.ink} strokeWidth="6" strokeLinecap="round" /></g>
      <M x={24} y={58} size={11}>each seal = sha256(previous seal + step)</M>
      <M x={24} y={308} size={10} fill={C.ink2}>Change one stored number and the chain breaks at that step</M>
    </Frame>
  )
}

function Keys() {
  return (
    <Frame>
      <Palm x={34} /><Palm x={452} s={0.85} />
      <House x={96} stage={4} w={200} />
      <Person x={340} kind="woman" h={122}>
        <path d="M-14 -94 q-16 10 -18 30" stroke={C.skin} strokeWidth="7" fill="none" strokeLinecap="round" />
        <g transform="translate(-36 -58)"><circle r="7" fill="none" stroke={C.gold} strokeWidth="3" /><path d="M0 7 v18 h6 M0 18 h5" stroke={C.gold} strokeWidth="3" fill="none" /></g>
      </Person>
      <Person x={384} kind="child" h={78} />
      <M x={96} y={276} size={10} fill={C.ink2}>at least 25 sq m, with a toilet (₹12,000, SBM-G)</M>
      <M x={24} y={308} size={10} fill={C.ink2}>Every stage verified against an accepted photo</M>
    </Frame>
  )
}

export const TOUR_ART = { problem: Problem, voice: Voice, consent: Consent, papers: Papers, money: Money, approve: Approve, photo: Photo, recorder: Recorder, keys: Keys }
export type TourArtKey = keyof typeof TOUR_ART
