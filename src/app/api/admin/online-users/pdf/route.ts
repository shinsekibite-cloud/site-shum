import { NextResponse } from 'next/server';
import { requireAdmin, aclJsonError } from '@/lib/acl';
import { queryOnlineUsers } from '@/lib/admin-online-users';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFile } from 'fs/promises';
import { join } from 'path';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const data = await queryOnlineUsers({
      q: url.searchParams.get('q') || undefined,
      role: url.searchParams.get('role') || undefined,
      status: url.searchParams.get('status') || 'online',
      sort: url.searchParams.get('sort') || 'active',
      order: url.searchParams.get('order') === 'asc' ? 'asc' : 'desc',
      limit: Number(url.searchParams.get('limit') || 200),
    });

    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const fontBytes = await readFile(join(process.cwd(), 'public', 'fonts', 'DejaVuSans.ttf'));
    const boldBytes = await readFile(join(process.cwd(), 'public', 'fonts', 'DejaVuSans-Bold.ttf'));
    const font = await pdf.embedFont(fontBytes, { subset: true });
    const bold = await pdf.embedFont(boldBytes, { subset: true });

    let page = pdf.addPage([595, 842]);
    let y = 800;
    const draw = (text: string, size = 10, isBold = false) => {
      if (y < 48) {
        page = pdf.addPage([595, 842]);
        y = 800;
      }
      page.drawText(text.slice(0, 110), {
        x: 40,
        y,
        size,
        font: isBold ? bold : font,
        color: rgb(0.1, 0.14, 0.2),
      });
      y -= size + 6;
    };

    draw('Отчёт: пользователи онлайн / активность', 14, true);
    draw(`Собрано: ${data.collectedAt || ''}`, 9);
    draw(
      `Онлайн: ${data.summary.onlineCount} · За 24ч: ${data.summary.recentCount} · Всего: ${data.summary.totalUsers}`,
      10,
      true
    );
    y -= 6;
    draw('Имя | Роль | Нагрузка | Последняя активность', 9, true);

    for (const u of data.items) {
      const name = (u.name || u.email || u.id).slice(0, 28);
      draw(
        `${name} | ${u.role} | load=${u.loadScore} | ${u.lastActiveAt || '—'} ${u.online ? '[online]' : ''}`,
        8
      );
    }

    const bytes = await pdf.save();
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="online-users-${Date.now()}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return aclJsonError(e);
  }
}
