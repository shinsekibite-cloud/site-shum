'use client';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useVoice } from '@/components/VoiceProvider';

export default function QRCodeDisplay({ value, size = 120 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string>('');
  const { loadout } = useVoice();
  const ticketFx = loadout.ticket || '';

  useEffect(() => {
    QRCode.toDataURL(value, {
      margin: 3,
      width: size,
      errorCorrectionLevel: 'M',
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((url) => {
        setSrc(url);
      })
      .catch((err) => {
        console.error(err);
      });
  }, [value, size]);

  if (!src) return <div style={{ width: size, height: size, background: '#f1f5f9', borderRadius: 8 }} />;

  return (
    <div
      className={`yp-ticket-qr${ticketFx ? ` is-${ticketFx}` : ''}`}
      data-eco-ticket={ticketFx || undefined}
      style={{ display: 'inline-block', lineHeight: 0 }}
    >
      <img
        src={src}
        alt="Билет QR"
        style={{ width: size, height: size, borderRadius: 8, border: '1px solid #e2e8f0' }}
      />
    </div>
  );
}
