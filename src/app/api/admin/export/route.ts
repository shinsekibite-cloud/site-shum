import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { aclJsonError, requireAdmin, requirePermission } from '@/lib/acl';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');

    if (type === 'users') {
      await requireAdmin();
      const users = await prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          createdAt: true,
        },
      });

      let csvContent = 'ID,Name,Email,Phone,Role,Created At\n';
      users.forEach((user) => {
        const row = [
          user.id,
          user.name || '',
          user.email || '',
          user.phone || '',
          user.role,
          user.createdAt.toISOString(),
        ].join(',');
        csvContent += row + '\n';
      });

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="users.csv"',
        },
      });
    }

    if (type === 'applications') {
      await requirePermission('applications');
      const apps = await prisma.application.findMany({
        include: {
          user: { select: { id: true, name: true, email: true, phone: true, role: true } },
          project: true,
          club: true,
          program: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      let csvContent = 'ID,User Name,User Email,User Phone,Target,Status,Created At\n';
      apps.forEach((app) => {
        const target = app.project
          ? app.project.title
          : app.club
            ? app.club.title
            : app.program
              ? app.program.title
              : 'N/A';
        const row = [
          app.id,
          app.user.name || '',
          app.user.email || '',
          app.user.phone || '',
          `"${target.replace(/"/g, '""')}"`,
          app.status,
          app.createdAt.toISOString(),
        ].join(',');
        csvContent += row + '\n';
      });

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="applications.csv"',
        },
      });
    }

    return new NextResponse('Invalid export type', { status: 400 });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e) {
      const err = e as { message: string; status: number };
      return new NextResponse(err.message, { status: err.status });
    }
    return aclJsonError(e);
  }
}
