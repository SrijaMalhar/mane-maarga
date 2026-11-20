/**
 * Mane Maarga mark: a tiled roof over a path that leads to the door.
 * Static copies live in public/favicon.svg and docs/assets/logo.svg — keep them in sync.
 */
export default function Logo({ size = 40, className, title = 'Mane Maarga' }: { size?: number; className?: string; title?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title}>
      <rect width="64" height="64" rx="14" fill="#1F3D2F" />
      <path d="M19 31 H45 V45 H19 Z" fill="#F6F1E7" />
      <path d="M28.5 45 V38.5 a3.5 3.5 0 0 1 7 0 V45 Z" fill="#1F3D2F" />
      <path d="M11 32 L32 15 L53 32" fill="none" stroke="#E9B95A" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M32 49 C31 53 25 55 17 56" fill="none" stroke="#E9B95A" strokeWidth="2.8" strokeLinecap="round" strokeDasharray="0.5 5.5" />
    </svg>
  )
}
