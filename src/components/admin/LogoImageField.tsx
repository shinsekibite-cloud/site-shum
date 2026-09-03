'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';

type Props = {
  currentLogo?: string | null;
  name?: string;
  hiddenName?: string;
  label?: string;
};

/** Square logo picker for admin settings (PNG/JPEG/WebP/SVG via URL fallback). */
export default function LogoImageField({
  currentLogo,
  name = 'logoFile',
  hiddenName = 'logoUrl',
  label = 'Логотип сайта',
}: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentLogo || null);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    setPreview(currentLogo || null);
    setCleared(false);
  }, [currentLogo]);

  useEffect(() => {
    return () => {
      if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const onFile = (file: File | null) => {
    if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview);
    if (!file) {
      setPreview(cleared ? null : currentLogo || null);
      return;
    }
    setCleared(false);
    setPreview(URL.createObjectURL(file));
  };

  const clear = () => {
    if (inputRef.current) inputRef.current.value = '';
    if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview);
    setPreview(null);
    setCleared(true);
  };

  const shown = cleared ? null : preview;

  return (
    <div>
      <label htmlFor={inputId} style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>
        {label}
      </label>
      <input type="hidden" name={hiddenName} value={cleared ? '' : currentLogo || ''} />
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            width: 112,
            height: 112,
            borderRadius: 20,
            border: '1px dashed rgba(15,23,42,0.18)',
            background: '#fff',
            display: 'grid',
            placeItems: 'center',
            overflow: 'hidden',
            flexShrink: 0,
            boxShadow: '0 4px 16px rgba(15,23,42,0.06)',
          }}
        >
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="Логотип" style={{ width: '86%', height: '86%', objectFit: 'contain' }} />
          ) : (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: 8 }}>
              <ImagePlus size={22} style={{ margin: '0 auto 4px' }} />
              <div style={{ fontSize: '0.72rem', fontWeight: 600 }}>Нет логотипа</div>
            </div>
          )}
        </div>
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <label
              htmlFor={inputId}
              className="btn btn-secondary"
              style={{ cursor: 'pointer', margin: 0, padding: '0.5rem 0.9rem', fontSize: '0.85rem' }}
            >
              {shown ? 'Заменить' : 'Загрузить логотип'}
            </label>
            {shown && (
              <button
                type="button"
                onClick={clear}
                className="btn btn-secondary"
                style={{ padding: '0.5rem 0.85rem', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <Trash2 size={14} /> Сбросить
              </button>
            )}
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0.55rem 0 0', lineHeight: 1.45 }}>
            PNG, JPEG, WebP или GIF, до 5 МБ. Лучше квадрат 512×512 на прозрачном фоне. После сброса снова
            используется стандартный логотип портала.
          </p>
        </div>
      </div>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        name={name}
        accept="image/jpeg,image/png,image/webp,image/gif"
        style={{ display: 'none' }}
        onChange={(e) => onFile(e.target.files?.[0] || null)}
      />
    </div>
  );
}
