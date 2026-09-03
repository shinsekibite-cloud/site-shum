import Link from 'next/link';
import { Home } from 'lucide-react';

export default function AuthHomeLink() {
  return (
    <Link href="/" className="yp-auth-home">
      <Home size={16} aria-hidden />
      На главную
    </Link>
  );
}
