'use client';

import { Share2, Check } from 'lucide-react';
import { useState } from 'react';

export default function ShareButton({ title, inverse = true }: { title?: string, inverse?: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: title || 'Центр развития молодежи Сочи',
          url: window.location.href,
        });
      } catch (error) {
        // user cancelled or share failed, fallback to copy
        copyToClipboard();
      }
    } else {
      copyToClipboard();
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button 
      onClick={handleShare}
      style={{ 
        display: 'inline-flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        gap: '0.5rem', 
        color: copied ? '#15803d' : (inverse ? 'white' : 'var(--muted)'), 
        background: copied ? '#dcfce7' : 'transparent',
        padding: '0.5rem 1rem', 
        borderRadius: '100px', 
        fontWeight: 600, 
        fontSize: '0.9rem',
        border: 'none',
        cursor: 'pointer',
        transition: 'all 0.2s'
      }}
      title="Поделиться"
    >
      {copied ? (
        <>
          <Check size={16} /> Скопировано
        </>
      ) : (
        <>
          <Share2 size={16} /> Поделиться
        </>
      )}
    </button>
  );
}
