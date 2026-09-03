import { redirect } from 'next/navigation';

/** Legacy static /about → CMS page to avoid duplicate «О нас». */
export default function AboutRedirect() {
  redirect('/p/about');
}
