/**
 * Mane Mitra (ಮನೆ ಮಿತ್ರ) — the friend who guides families toward a home.
 * One drawing, three moods. The silhouette (peaked tile roof, rounded walls,
 * sprout on the ridge) is the brand mark and must not change between screens.
 */
type Mood = 'calm' | 'happy' | 'guide'

export default function Mascot({ size = 96, mood = 'calm', title = 'Mane Mitra', className }: { size?: number; mood?: Mood; title?: string; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 240 240" role="img" aria-label={title}>
      <title>{title}</title>
      {/* ground */}
      <ellipse cx="120" cy="222" rx="78" ry="6" fill="#4A3426" opacity=".12" />
      {/* plinth step */}
      <rect x="58" y="204" width="124" height="14" rx="4" fill="#D9C9A8" />
      {/* walls */}
      <rect x="54" y="106" width="132" height="104" rx="18" fill="#F6EEDC" />
      <path d="M150 106 H168 a18 18 0 0 1 18 18 V192 a18 18 0 0 1 -18 18 H150 z" fill="#EBDDC0" opacity=".7" />
      {/* windows as eyes */}
      {mood === 'happy' ? (
        <g stroke="#23221F" strokeWidth="5" strokeLinecap="round" fill="none">
          <path d="M80 140 q9 -9 18 0" />
          <path d="M142 140 q9 -9 18 0" />
        </g>
      ) : (
        <g>
          <rect x="78" y="128" width="22" height="22" rx="5" fill="#2E5641" />
          <rect x="140" y="128" width="22" height="22" rx="5" fill="#2E5641" />
          <circle cx="92" cy="137" r="4" fill="#F6EEDC" />
          <circle cx="154" cy="137" r="4" fill="#F6EEDC" />
        </g>
      )}
      {/* lintel smile */}
      <path d="M104 160 q16 10 32 0" stroke="#B5573A" strokeWidth="4" strokeLinecap="round" fill="none" />
      {/* green door */}
      <path d="M106 210 v-30 a14 14 0 0 1 28 0 v30 z" fill="#1F3D2F" />
      <circle cx="128" cy="196" r="2.4" fill="#C9A03A" />
      {/* Mangalore tile roof */}
      <path d="M36 112 L114 46 q6 -5 12 0 L204 112 q4 6 -3 9 H39 q-7 -3 -3 -9 z" fill="#B5573A" />
      <g stroke="#8E3F27" strokeWidth="2.4" strokeLinecap="round" opacity=".55">
        <path d="M62 104 L120 56" /><path d="M86 112 L126 76" /><path d="M120 112 L144 90" />
        <path d="M150 112 L164 100" />
      </g>
      <path d="M44 116 H196" stroke="#C9A03A" strokeWidth="3" strokeLinecap="round" />
      {/* sprout on the ridge: hope */}
      <path d="M120 48 v-16" stroke="#2E5641" strokeWidth="4" strokeLinecap="round" />
      <path d="M120 36 q-14 -2 -18 -14 q14 0 18 14 z" fill="#4F8A5B" />
      <path d="M120 32 q12 -4 16 -16 q-14 2 -16 16 z" fill="#2E5641" />
      {mood === 'guide' && (
        <g>
          {/* a small lamp held at the doorstep: guidance */}
          <path d="M186 168 q18 -6 22 -24" stroke="#4A3426" strokeWidth="4" strokeLinecap="round" fill="none" />
          <rect x="199" y="128" width="18" height="20" rx="4" fill="#C9A03A" />
          <path d="M208 132 q-4 6 0 11 q4 -5 0 -11 z" fill="#FBF3DA" />
          <path d="M202 126 h12" stroke="#4A3426" strokeWidth="3" strokeLinecap="round" />
        </g>
      )}
    </svg>
  )
}
