'use client';

import { useCallback, useEffect, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';

type GalleryItem = {
  url: string;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED';
};

type GalleryPayload = {
  items?: GalleryItem[];
  urls: string[];
  max: number;
  maxUploadBytes: number;
};

/** Personal gallery editor for the dashboard profile section. */
export default function PersonalGalleryEditor() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [max, setMax] = useState(12);
  const [maxBytes, setMaxBytes] = useState(2 * 1024 * 1024);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/user/gallery');
      if (!res.ok) return;
      const data = (await res.json()) as GalleryPayload;
      const next =
        data.items ||
        (data.urls || []).map((url) => ({ url, status: 'APPROVED' as const }));
      setItems(next);
      setMax(data.max || 12);
      setMaxBytes(data.maxUploadBytes || 2 * 1024 * 1024);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (next: GalleryItem[]) => {
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch('/api/user/gallery', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.message || 'Не удалось сохранить');
        return;
      }
      setItems(data.items || next);
      setMsg('Сохранено');
    } finally {
      setBusy(false);
    }
  };

  const onUpload = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setMsg('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/user/gallery', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.message || 'Ошибка загрузки');
        return;
      }
      setItems(data.items || []);
      setMsg(
        data.message ||
          (data.moderationStatus === 'PENDING'
            ? 'Фото на модерации — на публичном профиле появится после проверки'
            : 'Фото добавлено')
      );
    } finally {
      setBusy(false);
    }
  };

  const mb = (maxBytes / (1024 * 1024)).toFixed(1);

  return (
    <div className="personal-gallery-editor">
      <div className="personal-gallery-editor__head">
        <strong>Личная галерея</strong>
        <span>
          {items.length}/{max} · до {mb} МБ
        </span>
      </div>
      <div className="personal-gallery-editor__grid">
        {items.map((item) => (
          <div
            key={item.url}
            className={`personal-gallery-editor__thumb${
              item.status === 'PENDING' ? ' is-pending' : ''
            }`}
            style={{ backgroundImage: `url(${item.url})` }}
          >
            {item.status === 'PENDING' ? (
              <span className="personal-gallery-editor__badge">На проверке</span>
            ) : null}
            <button
              type="button"
              className="personal-gallery-editor__del"
              aria-label="Удалить"
              disabled={busy}
              onClick={() => void save(items.filter((u) => u.url !== item.url))}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {items.length < max ? (
          <label className="personal-gallery-editor__add">
            <ImagePlus size={18} />
            <span>Добавить</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                e.target.value = '';
                void onUpload(f);
              }}
            />
          </label>
        ) : null}
      </div>
      <p className="personal-gallery-editor__hint">
        Новые фото проходят модерацию перед публикацией на открытом профиле. Не загружайте
        непристойные или чужие изображения.
      </p>
      {msg ? <p className="personal-gallery-editor__msg">{msg}</p> : null}
    </div>
  );
}
