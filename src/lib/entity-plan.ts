/** Shared parsers for project/club plans: roadmap, roles, tasks. */

export type RoadmapItem = {
  title: string;
  status?: 'planned' | 'active' | 'done' | string;
  due?: string;
  description?: string;
};

export type RoleItem = {
  role: string;
  duties?: string;
  userId?: string;
  name?: string;
};

export type TaskItem = {
  title: string;
  status?: 'todo' | 'doing' | 'done' | string;
  assigneeName?: string;
  done?: boolean;
};

function parseArray<T>(raw: unknown, map: (row: Record<string, unknown>) => T | null, max = 40): T[] {
  if (!raw) return [];
  let data: unknown = raw;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return [];
    try {
      data = JSON.parse(t);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(data)) return [];
  const out: T[] = [];
  for (const row of data) {
    if (!row || typeof row !== 'object') continue;
    const mapped = map(row as Record<string, unknown>);
    if (mapped) out.push(mapped);
    if (out.length >= max) break;
  }
  return out;
}

export function parseRoadmap(raw: unknown): RoadmapItem[] {
  return parseArray(raw, (row) => {
    const title = String(row.title || '').trim();
    if (!title) return null;
    return {
      title: title.slice(0, 120),
      status: row.status ? String(row.status).slice(0, 24) : 'planned',
      due: row.due ? String(row.due).slice(0, 40) : undefined,
      description: row.description ? String(row.description).slice(0, 400) : undefined,
    };
  });
}

export function parseRoles(raw: unknown): RoleItem[] {
  return parseArray(raw, (row) => {
    const role = String(row.role || row.title || '').trim();
    if (!role) return null;
    return {
      role: role.slice(0, 80),
      duties: row.duties ? String(row.duties).slice(0, 400) : undefined,
      userId: row.userId ? String(row.userId) : undefined,
      name: row.name ? String(row.name).slice(0, 80) : undefined,
    };
  }, 24);
}

export function parseTasks(raw: unknown): TaskItem[] {
  return parseArray(raw, (row) => {
    const title = String(row.title || '').trim();
    if (!title) return null;
    const done = Boolean(row.done) || String(row.status || '') === 'done';
    return {
      title: title.slice(0, 160),
      status: done ? 'done' : row.status ? String(row.status).slice(0, 24) : 'todo',
      assigneeName: row.assigneeName ? String(row.assigneeName).slice(0, 80) : undefined,
      done,
    };
  }, 48);
}

export function serializePlanField(items: unknown[]): string | null {
  if (!items.length) return null;
  return JSON.stringify(items);
}

/** Default starter roadmap when admin left fields empty — helps empty projects look complete. */
export function defaultProjectRoadmap(title: string): RoadmapItem[] {
  return [
    { title: 'Сбор команды и роли', status: 'active', description: `Определяем, кто ведёт «${title}» и какие зоны ответственности.` },
    { title: 'План работ и KPI', status: 'planned', description: 'Фиксируем цели, сроки и измеримый результат для города.' },
    { title: 'Реализация и публичный результат', status: 'planned', description: 'Делаем продукт/событие и фиксируем итог в портфолио.' },
  ];
}

export function defaultClubRoadmap(title: string): RoadmapItem[] {
  return [
    { title: 'Знакомство и правила клуба', status: 'active', description: `Онбординг участников «${title}».` },
    { title: 'Регулярные встречи', status: 'planned', description: 'Расписание, формат и темы сезона.' },
    { title: 'Совместный проект сезона', status: 'planned', description: 'Общий результат клуба для города.' },
  ];
}
