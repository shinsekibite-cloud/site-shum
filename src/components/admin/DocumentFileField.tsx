'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { FileUp, FileText, Trash2 } from 'lucide-react';

type DocumentFileFieldProps = {
  name?: string;
  label?: string;
  required?: boolean;
  accept?: string;
  hint?: string;
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

/** Dropzone-style document picker for admin uploads. */
export default function DocumentFileField({
  name = 'docFile',
  label = 'Файл',
  required = true,
  accept = '.pdf,.doc,.docx,image/*,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain',
  hint = 'PDF, DOC, DOCX, JPEG/PNG/WebP/GIF или TXT до 20 МБ. Можно перетащить файл сюда.',
}: DocumentFileFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    return () => {
      /* no blob URLs for docs */
    };
  }, []);

  const assign = (next: File | null) => {
    setFile(next);
    if (!inputRef.current) return;
    if (!next) {
      inputRef.current.value = '';
      return;
    }
    const dt = new DataTransfer();
    dt.items.add(next);
    inputRef.current.files = dt.files;
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0] || null;
    if (f) assign(f);
  };

  return (
    <div>
      <label htmlFor={inputId} style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>
        {label}
        {required ? ' *' : ''}
      </label>
      <div
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragging(false);
        }}
        onDrop={onDrop}
        style={{
          position: 'relative',
          width: '100%',
          minHeight: 148,
          borderRadius: 14,
          overflow: 'hidden',
          border: dragging ? '2px solid var(--primary)' : '1px dashed rgba(15,23,42,0.18)',
          background: dragging
            ? 'linear-gradient(135deg, rgba(37,99,235,0.08), rgba(14,165,233,0.06))'
            : file
              ? 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)'
              : 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.25rem',
          transition: 'border-color 0.15s, background 0.15s',
        }}
      >
        {file ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', width: '100%', maxWidth: 520 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 12,
                background: 'rgba(37,99,235,0.12)',
                color: 'var(--primary)',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <FileText size={24} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', wordBreak: 'break-word' }}>{file.name}</div>
              <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 4 }}>
                {formatSize(file.size)}
                {file.type ? ` · ${file.type}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
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
                Заменить
              </label>
              <button
                type="button"
                onClick={() => assign(null)}
                className="btn btn-secondary"
                style={{
                  padding: '0.45rem 0.7rem',
                  fontSize: '0.85rem',
                  background: 'rgba(255,255,255,0.95)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
                aria-label="Убрать файл"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: '#64748b', padding: '0.5rem' }}>
            <FileUp size={28} style={{ margin: '0 auto 0.55rem', color: 'var(--primary)' }} />
            <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#0f172a' }}>
              {dragging ? 'Отпустите файл' : 'Перетащите файл или выберите'}
            </div>
            <label
              htmlFor={inputId}
              className="btn btn-secondary"
              style={{
                cursor: 'pointer',
                margin: '0.85rem 0 0',
                padding: '0.5rem 1rem',
                fontSize: '0.88rem',
                display: 'inline-flex',
                background: 'rgba(255,255,255,0.95)',
              }}
            >
              Выбрать файл
            </label>
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        name={name}
        accept={accept}
        required={required}
        style={{ display: 'none' }}
        onChange={(e) => assign(e.target.files?.[0] || null)}
      />
      <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0.45rem 0 0' }}>{hint}</p>
    </div>
  );
}
