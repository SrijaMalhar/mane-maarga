import { useState } from 'react'

/**
 * Editorial hero artwork: a Karnataka village home at dusk, drawn over a construction blueprint.
 * If a licensed photograph exists at /images/<photo>, it is shown instead; the drawing is the fallback.
 */
export function Photo({ src, srcSet, sizes, alt, className, credit, children }: { src: string; srcSet?: string; sizes?: string; alt: string; className?: string; credit?: JSX.Element; children: JSX.Element }) {
  const [failed, setFailed] = useState(false)
  if (failed) return children
  return (
    <>
      <img className={className} src={src} srcSet={srcSet} sizes={sizes} alt={alt} decoding="async" fetchPriority="high" onError={() => setFailed(true)} />
      {credit && <small className="photo-credit">{credit}</small>}
    </>
  )
}

/**
 * Hero photograph: "An old Malenadu house with a tiled roof", by Manjunath M M.
 * CC0 (public domain) from the WordPress Photo Directory: https://wordpress.org/photos/photo/106825910b/
 * Served resized through the WordPress image CDN. If it can't load, the drawing is shown instead.
 */
const HERO = 'https://pd.w.org/2025/05/106825910b713b69.64290229.jpg'
const cdn = (w: number) => `https://i0.wp.com/${HERO.replace('https://', '')}?w=${w}&quality=82&strip=all`
export const heroPhoto = {
  src: cdn(1200),
  srcSet: [700, 1000, 1400, 1800].map(w => `${cdn(w)} ${w}w`).join(', '),
  sizes: '(max-width: 960px) 92vw, 46vw',
  page: 'https://wordpress.org/photos/photo/106825910b/',
}

export default function VillageScene({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 640 480" role="img" aria-label="Illustration of a tiled-roof village house among coconut palms, drawn over a construction blueprint" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="vs-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F1E3B8" /><stop offset=".65" stopColor="#F3E7CF" /><stop offset="1" stopColor="#EAD9B8" />
        </linearGradient>
        <pattern id="vs-grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M24 0H0V24" fill="none" stroke="#1F3D2F" strokeOpacity=".07" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="640" height="480" fill="url(#vs-sky)" />
      <rect width="640" height="480" fill="url(#vs-grid)" />
      {/* sun */}
      <circle cx="470" cy="150" r="54" fill="#E9B95A" opacity=".55" />
      {/* hills */}
      <path d="M0 300 C120 250 220 270 320 285 S520 240 640 270 V480 H0 Z" fill="#9FB08A" />
      <path d="M0 330 C140 300 260 320 360 330 S560 300 640 320 V480 H0 Z" fill="#6E8A62" />
      {/* field rows */}
      <g stroke="#5C7752" strokeWidth="2" opacity=".5">
        {[360, 382, 404, 426, 448].map((y, i) => <path key={y} d={`M${-20 + i * 10} ${y} Q320 ${y - 18} ${660 - i * 10} ${y}`} fill="none" />)}
      </g>
      {/* palms */}
      {[[96, 332, 1], [560, 318, .85], [612, 340, .7]].map(([x, y, s]) => (
        <g key={x} transform={`translate(${x} ${y}) scale(${s})`}>
          <path d="M0 0 C4 -60 -6 -120 6 -170" stroke="#4A3426" strokeWidth="7" fill="none" strokeLinecap="round" />
          <g fill="#2E5641">
            <path d="M6 -170 C-30 -175 -60 -160 -78 -136 C-48 -150 -24 -156 6 -164 Z" />
            <path d="M6 -170 C40 -178 72 -164 86 -140 C58 -152 32 -158 6 -164 Z" />
            <path d="M6 -170 C-10 -196 -36 -206 -60 -204 C-34 -194 -16 -184 4 -166 Z" />
            <path d="M6 -170 C24 -198 50 -206 72 -200 C48 -192 30 -182 8 -166 Z" />
            <path d="M6 -170 C2 -150 -6 -130 -18 -112 C-6 -134 0 -150 4 -168 Z" />
          </g>
        </g>
      ))}
      {/* the house */}
      <g transform="translate(232 214)">
        <rect x="6" y="138" width="196" height="14" fill="#8C7B64" />
        <rect x="16" y="66" width="176" height="74" fill="#EADBBD" />
        <rect x="16" y="66" width="176" height="74" fill="none" stroke="#4A3426" strokeWidth="1.5" />
        <rect x="16" y="60" width="176" height="7" fill="#8C7B64" />
        <rect x="34" y="86" width="30" height="28" fill="#2E5641" /><path d="M49 86 v28 M34 100 h30" stroke="#EADBBD" strokeWidth="2" />
        <rect x="144" y="86" width="30" height="28" fill="#2E5641" /><path d="M159 86 v28 M144 100 h30" stroke="#EADBBD" strokeWidth="2" />
        <path d="M90 140 v-44 h30 v44 z" fill="#1F3D2F" /><circle cx="114" cy="120" r="2.5" fill="#C9A03A" />
        {/* verandah pillars */}
        <rect x="74" y="66" width="5" height="74" fill="#B5A07E" /><rect x="130" y="66" width="5" height="74" fill="#B5A07E" />
        {/* Mangalore tile roof */}
        <path d="M-8 66 L104 0 L216 66 Z" fill="#B5573A" />
        <g stroke="#8E3F27" strokeWidth="1.6" opacity=".7">
          {[14, 34, 54].map(o => <path key={o} d={`M${-8 + o * 1.3} ${66 - o * 0.2} L${104} ${o * 0.35}`} />)}
          {[0, 1, 2, 3, 4, 5].map(i => <path key={i} d={`M${10 + i * 34} 66 L${104 + (i - 2.5) * 8} ${20 + Math.abs(i - 2.5) * 8}`} />)}
        </g>
        <path d="M-8 66 H216" stroke="#C9A03A" strokeWidth="3" />
        {/* tulasi katte */}
        <g transform="translate(-34 112)"><rect x="0" y="12" width="22" height="28" fill="#D9C9A8" /><path d="M11 12 v-12" stroke="#2E5641" strokeWidth="2" /><circle cx="7" cy="2" r="4" fill="#4F8A5B" /><circle cx="15" cy="-2" r="4" fill="#4F8A5B" /></g>
      </g>
      {/* blueprint overlay: dimension lines over the house */}
      <g stroke="#1F3D2F" strokeWidth="1.2" opacity=".55" fill="none">
        <path d="M248 388 H424" /><path d="M248 382 v12 M424 382 v12" />
        <path d="M444 280 V352" /><path d="M438 280 h12 M438 352 h12" />
      </g>
      <g fontFamily="Manrope Variable, sans-serif" fontSize="11" fill="#1F3D2F" opacity=".75">
        <text x="380" y="404">6.0 m</text>
        <text x="452" y="320">2.9 m</text>
      </g>
      {/* path leading to the door */}
      <path d="M200 480 C240 440 300 420 336 368" stroke="#E9DCC0" strokeWidth="18" fill="none" strokeLinecap="round" />
      <path d="M200 480 C240 440 300 420 336 368" stroke="#C9A03A" strokeWidth="2" strokeDasharray="2 9" fill="none" strokeLinecap="round" />
    </svg>
  )
}
