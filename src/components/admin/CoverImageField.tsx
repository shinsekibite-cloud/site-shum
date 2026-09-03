'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';

type CoverImageFieldProps = {
  currentImage?: string | null;
  name?: string;
  label?: string;
  /** Hidden field that stores the URL for server actions */
  hiddenName?: string;
};

/** Modern cover picker with live preview for admin forms. */
export default function CoverImageField({
  currentImage,
  name = 'imageFile',
  label = 'Обложка',
  hiddenName = 'image',
}: CoverImageFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentImage || null);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    setPreview(currentImage || null);
    setCleared(false);
  }, [currentImage]);

  useEffect(() => {
    return () => {
      if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const onFile = (file: File | null) => {
    if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview);
    if (!file) {
      setPreview(cleared ? null : currentImage || null);
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

  return (
    <div>
      <label htmlFor={inputId} style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>
        {label}
      </label>
      <input type="hidden" name={hiddenName} value={cleared ? '' : currentImage || ''} />
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16 / 9',
          maxHeight: 220,
          borderRadius: 14,
          overflow: 'hidden',
          border: '1px dashed rgba(15,23,42,0.18)',
          background: preview
            ? `#0f172a url(${preview}) center/cover no-repeat`
            : 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {!preview && (
          <div style={{ textAlign: 'center', color: '#64748b', padding: '1rem' }}>
            <ImagePlus size={28} style={{ margin: '0 auto 0.5rem' }} />
            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Добавить изображение</div>
            <div style={{ fontSize: '0.8rem', marginTop: 4 }}>JPEG, PNG, WebP до 5 МБ</div>
          </div>
        )}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'flex-end',
            gap: 8,
            padding: 10,
            background: preview ? 'linear-gradient(transparent, rgba(15,23,42,0.45))' : 'transparent',
          }}
        >
          <label
            htmlFor={inputId}
            className="btn btn-secondary"
            style={{
              cursor: 'pointer',
              margin: 0,
              padding: '0.45rem 0.85rem',
              fontSize: '0.85rem',
              background: 'rgba(255,255,255,0.95)',
            }}
          >
            {preview ? 'Заменить' : 'Выбрать файл'}
          </label>
          {preview && (
            <button
              type="button"
              onClick={clear}
              className="btn btn-secondary"
              style={{
                padding: '0.45rem 0.7rem',
                fontSize: '0.85rem',
                background: 'rgba(255,255,255,0.95)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
              aria-label="Удалить обложку"
            >
              <Trash2 size={14} />
            </button>
          )}
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
      <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0.45rem 0 0' }}>
        Рекомендуем горизонтальное фото 1600×900. Пустой выбор сохраняет текущее изображение.
      </p>
    </div>
  );
}
