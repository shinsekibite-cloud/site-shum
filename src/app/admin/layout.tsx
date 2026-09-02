import AdminLayoutClient from '@/components/admin/AdminLayoutClient';

/** Staff console is session-specific — keep the whole /admin tree dynamic. */
export const dynamic = 'force-dynamic';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
