/** Auth-gated cabinet — never prerender as a public static page. */
export const dynamic = 'force-dynamic';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
