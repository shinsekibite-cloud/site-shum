'use client';

import { ExternalLink, MessageCircle, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  senderImage: string | null;
  body: string;
  flagged: boolean;
  createdAt: string;
};

type Props = {
  kind: 'PROJECT' | 'CLUB';
  entityId: string;
  entityTitle: string;
  currentUserId: string;
};

export default function GroupChatPanel({ kind, entityId, entityTitle, currentUserId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const messagesTab = kind === 'CLUB' ? 'clubs' : 'projects';

  const loadChat = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({ kind, entityId });
      const res = await fetch(`/api/group-chat?${qs}`);
      if (res.status === 401) {
        router.push(`/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || 'Не удалось загрузить чат');
        return;
      }
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      if (data.conversationId) setConversationId(data.conversationId);
    } catch {
      setError('Сеть недоступна');
    } finally {
      setLoading(false);
    }
  }, [entityId, kind, router]);

  useEffect(() => {
    if (!open) return;
    void loadChat();
  }, [open, loadChat]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  const send = async () => {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/group-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, entityId, body: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.push(`/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      if (!res.ok) {
        setError(data.message || 'Не удалось отправить');
        return;
      }
      if (data.message) {
        setMessages((prev) => [...prev, data.message]);
      }
      if (data.conversationId) setConversationId(data.conversationId);
      setBody('');
      if (data.warning) setError(data.warning);
    } catch {
      setError('Сеть недоступна');
    } finally {
      setSending(false);
    }
  };

  const openInMessages = () => {
    const qs = new URLSearchParams({ tab: messagesTab });
    if (conversationId) qs.set('c', conversationId);
    router.push(`/messages?${qs}`);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-primary"
          style={{ flex: 1, minWidth: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          onClick={() => setOpen((v) => !v)}
        >
          <MessageCircle size={18} />
          {open ? 'Скрыть чат' : 'Групповой чат'}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '0.55rem 0.75rem' }}
          onClick={openInMessages}
          title="Открыть в Сообщениях"
        >
          <ExternalLink size={16} />
          В сообщениях
        </button>
      </div>
      {open ? (
        <div
          style={{
            marginTop: 10,
            borderRadius: 12,
            border: '1px solid rgba(15,23,42,0.08)',
            background: '#fff',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: 420,
          }}
        >
          <div style={{ padding: '0.65rem 0.85rem', borderBottom: '1px solid rgba(15,23,42,0.06)', background: 'rgba(37,99,235,0.04)' }}>
            <div style={{ fontWeight: 800, fontSize: '0.88rem' }}>Чат «{entityTitle}»</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Только для участников</div>
          </div>
          <div
            ref={listRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '0.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              minHeight: 180,
            }}
          >
            {loading ? (
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>Загрузка…</p>
            ) : messages.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>Пока нет сообщений — напишите первым.</p>
            ) : (
              messages.map((m) => {
                const mine = m.senderId === currentUserId;
                return (
                  <div
                    key={m.id}
                    style={{
                      alignSelf: mine ? 'flex-end' : 'flex-start',
                      maxWidth: '88%',
                      padding: '0.45rem 0.65rem',
                      borderRadius: mine ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                      background: mine ? 'rgba(37,99,235,0.12)' : 'rgba(15,23,42,0.04)',
                    }}
                  >
                    {!mine ? (
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#2563eb', marginBottom: 2 }}>{m.senderName}</div>
                    ) : null}
                    <div style={{ fontSize: '0.88rem', lineHeight: 1.45, color: '#0f172a', whiteSpace: 'pre-wrap' }}>{m.body}</div>
                  </div>
                );
              })
            )}
          </div>
          <div style={{ padding: '0.65rem', borderTop: '1px solid rgba(15,23,42,0.06)', display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              maxLength={2000}
              placeholder="Сообщение команде…"
              disabled={sending}
              style={{
                flex: 1,
                padding: '0.5rem 0.65rem',
                borderRadius: 8,
                border: '1px solid rgba(15,23,42,0.12)',
                fontSize: '0.88rem',
              }}
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={sending || !body.trim()}
              onClick={() => void send()}
              aria-label="Отправить"
              style={{ padding: '0.5rem 0.75rem' }}
            >
              <Send size={16} />
            </button>
          </div>
          {error ? (
            <p style={{ margin: 0, padding: '0 0 0.55rem 0.75rem', fontSize: '0.78rem', color: '#b45309' }}>{error}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
