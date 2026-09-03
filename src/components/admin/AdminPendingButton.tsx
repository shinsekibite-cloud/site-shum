'use client';

import { useFormStatus } from 'react-dom';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  pendingLabel?: ReactNode;
};

/** Submit button that disables + shows pending state during server actions. */
export default function AdminPendingButton({ children, pendingLabel = '…', disabled, ...rest }: Props) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={disabled || pending} aria-busy={pending} {...rest}>
      {pending ? pendingLabel : children}
    </button>
  );
}
