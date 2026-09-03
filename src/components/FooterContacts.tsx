'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MapPin, Phone, Mail } from 'lucide-react';

type Props = {
  address?: string | null;
  phone?: string | null;
  email?: string | null;
};

/** Footer contacts column — on /contacts show only a short note to avoid duplicating the page. */
export default function FooterContacts({ address, phone, email }: Props) {
  const pathname = usePathname();
  const onContacts = pathname === '/contacts';

  return (
    <div className="site-footer-contacts">
      <h3 className="site-footer-heading">Контакты</h3>
      {onContacts ? (
        <p className="site-footer-contacts-note">
          Актуальные адрес, телефон и почта указаны выше на этой странице.
        </p>
      ) : (
        <ul className="site-footer-contacts-list">
          {address && (
            <li>
              <MapPin size={16} aria-hidden />
              <span>{address}</span>
            </li>
          )}
          {phone && (
            <li>
              <Phone size={16} aria-hidden />
              <a href={`tel:${phone.replace(/\s/g, '')}`}>{phone}</a>
            </li>
          )}
          {email && (
            <li>
              <Mail size={16} aria-hidden />
              <a href={`mailto:${email}`}>{email}</a>
            </li>
          )}
          {!address && !phone && !email && <li className="is-empty">Контакты пока не указаны</li>}
          <li className="is-more">
            <Link href="/contacts">Все контакты →</Link>
          </li>
        </ul>
      )}
    </div>
  );
}
