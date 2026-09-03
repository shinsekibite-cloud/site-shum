import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isSuperAdmin, LIMITED_ADMIN_TOKEN, sanitizePermissions } from '@/lib/acl';
import { logAdminAction } from '@/lib/admin-audit';

export async function PUT(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const session = await getServerSession(authOptions);

    if (!session || session.user?.role !== 'ADMIN') {
      return NextResponse.json({ message: 'Нет доступа' }, { status: 403 });
    }
    if (!isSuperAdmin(session.user.role, session.user.permissions)) {
      return NextResponse.json({ message: 'Только суперадминистратор может менять роли' }, { status: 403 });
    }

    const body = await req.json();
    const { role, permissions, isSuperAdmin: superFlag } = body;
    const allowed = ['USER', 'MODERATOR', 'ADMIN', 'SCANNER'];
    const nextRole = role === 'PARTICIPANT' ? 'USER' : role;
    if (!allowed.includes(nextRole)) {
      return NextResponse.json({ message: 'Некорректная роль' }, { status: 400 });
    }

    // Prevent accidental self-lockout from demoting the last admin
    if (session.user.id === params.id && nextRole !== 'ADMIN') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
      if (adminCount <= 1) {
        return NextResponse.json(
          { message: 'Нельзя снять права с единственного администратора' },
          { status: 400 }
        );
      }
    }

    let cleanPermissions: string | null = null;
    if (nextRole === 'MODERATOR') {
      cleanPermissions = sanitizePermissions(permissions) || null;
    } else if (nextRole === 'ADMIN' && superFlag === false) {
      const sections = sanitizePermissions(permissions);
      cleanPermissions = [LIMITED_ADMIN_TOKEN, sections].filter(Boolean).join(',');
    }

    const target = await prisma.user.findUnique({
      where: { id: params.id },
      select: { role: true },
    });
    if (!target || target.role === 'TECH') {
      return NextResponse.json({ message: 'Пользователь не найден' }, { status: 404 });
    }
    const elevatingToStaff =
      ['ADMIN', 'MODERATOR', 'SCANNER'].includes(nextRole) && target.role !== nextRole;

    const user = await prisma.user.update({
      where: { id: params.id },
      data: {
        role: nextRole,
        permissions: cleanPermissions,
        ...(elevatingToStaff ? { mustChangePassword: true } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        permissions: true,
        mustChangePassword: true,
      },
    });

    await logAdminAction({
      actorId: session.user.id!,
      actorEmail: session.user.email,
      actorRole: session.user.role,
      action: 'USER_ROLE_CHANGE',
      targetType: 'User',
      targetId: user.id,
      targetEmail: user.email,
      detail: {
        fromRole: target?.role || null,
        toRole: nextRole,
        permissions: cleanPermissions,
        isSuperAdmin: nextRole === 'ADMIN' && superFlag !== false,
        mustChangePassword: Boolean(user.mustChangePassword),
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error('Ошибка обновления прав:', error);
    return NextResponse.json({ message: 'Ошибка сервера' }, { status: 500 });
  }
}
