'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Save, CheckCircle2 } from 'lucide-react';

/**
 * Tracks dirty state on a server-action form and shows a compact floating Save bar
 * only after the user changes something.
 */
export default function SettingsSaveBar({
  justSaved,
  formId,
}: {
  justSaved?: boolean;
  /** If set, associates the floating button with a form via form= */
  formId?: string;
}) {
  const [dirty, setDirty] = useState(false);
  const [showSaved, setShowSaved] = useState(Boolean(justSaved));
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!justSaved) return;
    setShowSaved(true);
    setDirty(false);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowSaved(false), 4000);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [justSaved]);

  useEffect(() => {
    const onChange = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const form = t.closest('form');
      if (!form) return;
      if (formId && form.id !== formId) return;
      // Ignore pure navigation clicks
      if (t.tagName === 'BUTTON' && (t as HTMLButtonElement).type === 'submit') return;
      setDirty(true);
      setShowSaved(false);
    };
    document.addEventListener('input', onChange, true);
    document.addEventListener('change', onChange, true);
    return () => {
      document.removeEventListener('input', onChange, true);
      document.removeEventListener('change', onChange, true);
    };
  }, [formId]);

  if (!dirty && !showSaved) return null;

  return (
    <div className="settings-save-float" role="status">
      {showSaved && !dirty ? (
        <div className="settings-save-float__toast is-ok">
          <CheckCircle2 size={16} /> Сохранено
        </div>
      ) : (
        <button
          type="submit"
          form={formId}
          className="settings-save-float__btn"
        >
          <Save size={15} /> Сохранить изменения
        </button>
      )}
    </div>
  );
}

export function SettingsFormShell({
  children,
  action,
  formId = 'yp-settings-form',
  justSaved,
}: {
  children: ReactNode;
  action: (formData: FormData) => void | Promise<void>;
  formId?: string;
  justSaved?: boolean;
}) {
  return (
    <>
      <form id={formId} action={action} encType="multipart/form-data">
        {children}
      </form>
      <SettingsSaveBar justSaved={justSaved} formId={formId} />
    </>
  );
}
