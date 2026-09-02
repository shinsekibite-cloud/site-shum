'use client';

import { useState } from 'react';
import { Database, Trash2, Loader2 } from 'lucide-react';

export default function DemoSettingsPanel() {
  const [loadingSeed, setLoadingSeed] = useState(false);
  const [loadingClear, setLoadingClear] = useState(false);
  const [message, setMessage] = useState('');

  const seedData = async () => {
    if (!confirm('Вы уверены? Это создаст 100+ фейковых записей в базе данных.')) return;
    setLoadingSeed(true);
    setMessage('Генерация данных (это может занять около 5-10 секунд)...');
    try {
      const res = await fetch('/api/admin/demo-seed', { method: 'POST' });
      const data = await res.json();
      setMessage(data.message || 'Готово!');
    } catch (e) {
      setMessage('Ошибка соединения');
    } finally {
      setLoadingSeed(false);
    }
  };

  const clearData = async () => {
    if (!confirm('Вы уверены? Будут удалены ТОЛЬКО сгенерированные демо-записи.')) return;
    setLoadingClear(true);
    setMessage('Очистка демо-данных...');
    try {
      const res = await fetch('/api/admin/demo-clear', { method: 'POST' });
      const data = await res.json();
      setMessage(data.message || 'Очищено!');
    } catch (e) {
      setMessage('Ошибка соединения');
    } finally {
      setLoadingClear(false);
    }
  };

  return (
    <div className="settings-card" style={{ animation: 'fadeIn 0.3s ease' }}>
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '2rem', alignItems: 'center' }}>
        <div style={{ padding: '0.5rem', background: 'rgba(168, 85, 247, 0.1)', color: '#a855f7', borderRadius: 'var(--radius-md)' }}><Database size={20} /></div>
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>Демо-режим и Тестирование</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: 0 }}>Сгенерируйте искусственную активность (100 пользователей, заявки, мероприятия), чтобы проверить сайт под нагрузкой.</p>
        </div>
      </div>

      <div style={{ padding: '1.5rem', border: '1px solid #e2e8f0', borderRadius: 'var(--radius-md)', background: 'linear-gradient(180deg, #f8fafc 0%, white 100%)', marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
        <button 
          type="button" 
          onClick={seedData} 
          disabled={loadingSeed || loadingClear}
          style={{ padding: '0.75rem 1.5rem', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', transition: 'opacity 0.2s', opacity: (loadingSeed || loadingClear) ? 0.5 : 1 }}
        >
          {loadingSeed ? <Loader2 size={18} className="animate-spin" /> : <Database size={18} />} 
          Наполнить сайт демо-данными
        </button>

        <button 
          type="button" 
          onClick={clearData} 
          disabled={loadingSeed || loadingClear}
          style={{ padding: '0.75rem 1.5rem', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', transition: 'opacity 0.2s', opacity: (loadingSeed || loadingClear) ? 0.5 : 1 }}
        >
          {loadingClear ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />} 
          Удалить все демо-данные
        </button>
      </div>

      {message && (
        <div style={{ padding: '1rem', backgroundColor: 'rgba(0,0,0,0.03)', borderRadius: 'var(--radius-sm)', fontSize: '0.9rem', fontWeight: 500 }}>
          {message}
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
      `}} />
    </div>
  );
}
