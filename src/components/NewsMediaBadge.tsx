import { Play } from 'lucide-react';

/** Play overlay for news cards that have a VK video. */
export default function NewsMediaBadge({ hasVideo }: { hasVideo?: boolean }) {
  if (!hasVideo) return null;
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: 52,
        height: 52,
        borderRadius: '50%',
        background: 'rgba(15, 23, 42, 0.72)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        pointerEvents: 'none',
        boxShadow: '0 8px 24px rgba(15,23,42,0.35)',
      }}
    >
      <Play size={22} fill="currentColor" style={{ marginLeft: 2 }} />
    </span>
  );
}
