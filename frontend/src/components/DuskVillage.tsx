/**
 * "Every lit window is a family home." A village at dusk: finished homes glow,
 * homes still being built stand in scaffold outline, and a trail of oil lamps —
 * the maarga — winds from the foreground to each door.
 */
const homes: Array<{ x: number; y: number; s: number; lit: boolean }> = [
  { x: 92, y: 300, s: .62, lit: true }, { x: 196, y: 286, s: .5, lit: false }, { x: 300, y: 296, s: .56, lit: true },
  { x: 412, y: 282, s: .48, lit: true }, { x: 500, y: 302, s: .58, lit: false }, { x: 248, y: 352, s: .78, lit: true },
  { x: 446, y: 360, s: .74, lit: true },
]
const lamps = [[300, 512], [292, 492], [278, 474], [262, 458], [254, 440], [262, 424], [280, 412], [300, 404], [330, 400], [362, 398], [394, 396], [424, 392], [452, 386], [472, 376]]

function Home({ x, y, s, lit }: { x: number; y: number; s: number; lit: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {lit ? (
        <>
          <ellipse cx="0" cy="18" rx="70" ry="30" fill="url(#dv-glow)" />
          <rect x="-44" y="-30" width="88" height="56" fill="#26332B" />
          <path d="M-58 -28 L0 -72 L58 -28 Z" fill="#3A2A22" />
          <path d="M-58 -28 H58" stroke="#C9A03A" strokeWidth="2" opacity=".7" />
          <rect x="-32" y="-14" width="16" height="14" fill="#F4C766" />
          <rect x="16" y="-14" width="16" height="14" fill="#F4C766" />
          <path d="M-8 26 v-26 h16 v26 z" fill="#F7D98C" />
        </>
      ) : (
        <g fill="none" stroke="#9FB59F" strokeWidth="2" opacity=".75">
          <rect x="-44" y="-30" width="88" height="56" strokeDasharray="5 5" />
          <path d="M-58 -28 L0 -72 L58 -28" strokeDasharray="5 5" />
          <path d="M-52 26 V-46 M52 26 V-46 M-52 -10 H52 M-52 10 H52" strokeWidth="1.4" opacity=".7" />
        </g>
      )}
    </g>
  )
}

export default function DuskVillage({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 600 520" role="img" aria-label="A village at dusk. Finished homes glow with lit windows, homes under construction stand in scaffold outline, and a trail of oil lamps winds toward them.">
      <defs>
        <linearGradient id="dv-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#10221A" /><stop offset=".55" stopColor="#1F3D2F" /><stop offset=".8" stopColor="#5B4A2E" /><stop offset="1" stopColor="#8A5A34" />
        </linearGradient>
        <radialGradient id="dv-glow"><stop offset="0" stopColor="#F4C766" stopOpacity=".45" /><stop offset="1" stopColor="#F4C766" stopOpacity="0" /></radialGradient>
        <radialGradient id="dv-lamp"><stop offset="0" stopColor="#FFE3A0" /><stop offset=".35" stopColor="#F4B44A" stopOpacity=".8" /><stop offset="1" stopColor="#F4B44A" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="600" height="520" fill="url(#dv-sky)" />
      {/* stars */}
      <g fill="#F6F1E7">
        {[[40, 40, 1.4], [120, 70, 1], [180, 30, 1.6], [260, 90, 1], [330, 44, 1.2], [420, 80, 1], [470, 30, 1.5], [540, 64, 1], [90, 130, .9], [380, 140, .9], [560, 150, 1.1], [220, 150, .8]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} opacity={.5 + (i % 3) * .15} />)}
      </g>
      {/* crescent moon */}
      <circle cx="484" cy="112" r="26" fill="#F1E3B8" />
      <circle cx="496" cy="104" r="24" fill="#1A3428" />
      {/* hills */}
      <path d="M0 300 C90 250 170 262 250 276 S420 236 600 262 V520 H0 Z" fill="#1A3026" />
      <path d="M0 340 C120 312 240 332 330 336 S520 312 600 326 V520 H0 Z" fill="#15281F" />
      {/* palms */}
      {[[40, 330, .9], [560, 320, 1], [150, 360, .7]].map(([x, y, s]) => (
        <g key={x} transform={`translate(${x} ${y}) scale(${s})`} fill="#0D1B14" stroke="#0D1B14">
          <path d="M0 0 C4 -50 -4 -100 6 -140" strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d="M6 -140 C-26 -144 -50 -130 -64 -110 C-40 -122 -20 -126 6 -134 Z" />
          <path d="M6 -140 C34 -146 60 -134 72 -114 C48 -124 28 -128 6 -134 Z" />
          <path d="M6 -140 C-8 -162 -30 -170 -50 -168 C-28 -160 -14 -150 4 -136 Z" />
          <path d="M6 -140 C20 -164 42 -170 60 -166 C40 -158 26 -150 8 -136 Z" />
        </g>
      ))}
      {homes.map((h, i) => <Home key={i} {...h} />)}
      {/* the maarga: a trail of diyas */}
      {lamps.map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`} className="diya" style={{ animationDelay: `${i * 140}ms` }}>
          <circle r={9 - i * .35} fill="url(#dv-lamp)" />
          <path d="M-3.4 1.2 h6.8 l-1.2 2.6 h-4.4 z" fill="#8A5A34" />
          <path d="M0 -3.6 q-1.8 2.4 0 4.4 q1.8 -2 0 -4.4 z" fill="#FFE9B0" />
        </g>
      ))}
      {/* ground */}
      <path d="M0 470 C150 456 300 470 600 452 V520 H0 Z" fill="#0F1F17" />
    </svg>
  )
}
