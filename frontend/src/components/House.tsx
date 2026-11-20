/**
 * A blueprint house that is drawn in as it gets built.
 * level 0 = site marked, 1 = plinth, 2 = walls, 3 = lintel/windows, 4 = roof, 5 = finished and lived in.
 * Unbuilt parts stay as dashed blueprint lines, so the drawing always shows the whole plan.
 */
export default function House({ level, size = 160, label }: { level: number; size?: number; label?: string }) {
  const done = (n: number) => level >= n
  const ink = '#23221F'
  const plan = { stroke: '#8A8378', strokeDasharray: '4 4', fill: 'none', strokeWidth: 1.4 }
  return (
    <svg width={size} height={size * 0.8} viewBox="0 0 200 160" role="img" aria-label={label ?? `Construction level ${level} of 5`} className="house-svg">
      {/* ground line + site pegs */}
      <path d="M8 146 H192" stroke={ink} strokeWidth="1.4" opacity=".5" />
      <g stroke="#B5573A" strokeWidth="2">
        <path d="M34 146 v8" /><path d="M166 146 v8" />
      </g>
      {/* plinth */}
      {done(1) ? <rect x="34" y="136" width="132" height="10" fill="#8C7B64" /> : <rect x="34" y="136" width="132" height="10" {...plan} />}
      {/* walls */}
      {done(2) ? <rect x="42" y="78" width="116" height="58" fill="#E9D9B9" stroke={ink} strokeWidth="1.4" /> : <rect x="42" y="78" width="116" height="58" {...plan} />}
      {done(2) && (
        <g stroke="#C9B48E" strokeWidth="1">
          {[90, 102, 114, 126].map(y => <path key={y} d={`M42 ${y} H158`} />)}
        </g>
      )}
      {/* lintel band, windows and door */}
      {done(3) ? (
        <g>
          <rect x="42" y="74" width="116" height="6" fill="#8C7B64" />
          <rect x="56" y="94" width="22" height="20" fill="#2E5641" />
          <rect x="122" y="94" width="22" height="20" fill="#2E5641" />
          <path d="M90 136 v-28 a10 10 0 0 1 20 0 v28 z" fill="#1F3D2F" />
        </g>
      ) : (
        <g {...plan}>
          <rect x="56" y="94" width="22" height="20" /><rect x="122" y="94" width="22" height="20" />
          <path d="M90 136 v-28 a10 10 0 0 1 20 0 v28" />
        </g>
      )}
      {/* tiled roof */}
      {done(4) ? (
        <g>
          <path d="M28 80 L100 26 L172 80 z" fill="#B5573A" stroke="#8E3F27" strokeWidth="1.4" />
          <g stroke="#8E3F27" strokeWidth="1.2" opacity=".6">
            <path d="M52 72 L100 36" /><path d="M76 78 L110 52" /><path d="M110 78 L130 62" />
          </g>
        </g>
      ) : <path d="M28 80 L100 26 L172 80 z" {...plan} />}
      {/* finished: lamp at the door, sprout, people live here */}
      {done(5) && (
        <g>
          <circle cx="118" cy="112" r="3" fill="#C9A03A" />
          <path d="M100 26 v-12" stroke="#2E5641" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M100 18 q-9 -1 -12 -9 q9 0 12 9 z" fill="#4F8A5B" />
          <path d="M100 16 q8 -3 10 -11 q-9 1 -10 11 z" fill="#2E5641" />
          <path d="M14 146 q6 -16 12 0" fill="#4F8A5B" /><path d="M178 146 q5 -12 10 0" fill="#4F8A5B" />
        </g>
      )}
    </svg>
  )
}

/** Case status → how much of the house exists. */
export const statusLevel: Record<string, number> = { intake: 0, verified: 0, planning: 1, finance_review: 1, construction: 3, completed: 5 }
