/**
 * Seed test documents (PDF + TXT) into SiteDocument.
 * Run: docker-compose exec -T -e PUBLIC_DIR=/app/public web node /app/scripts/seed-documents.mjs
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const PUBLIC = process.env.PUBLIC_DIR || path.join(process.cwd(), 'public');

/** Minimal valid PDF with one page of text (Helvetica). */
function buildPdf(lines) {
  const escaped = lines
    .map((l) => String(l).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'))
    .join('\\n');
  // Simple single-page PDF
  const content = `BT /F1 14 Tf 50 750 Td 16 TL (${escaped.split('\\n')[0]}) Tj`;
  const more = escaped
    .split('\\n')
    .slice(1)
    .map((l) => ` T* (${l}) Tj`)
    .join('');
  const stream = `${content}${more} ET`;
  const objs = [];
  objs.push('1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n');
  objs.push('2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n');
  objs.push(
    '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n'
  );
  objs.push(`4 0 obj<< /Length ${stream.length} >>stream\n${stream}\nendstream\nendobj\n`);
  objs.push('5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n');

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const o of objs) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += o;
  }
  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objs.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objs.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}

function writeDoc(fileName, buffer) {
  const dir = path.join(PUBLIC, 'uploads', 'documents');
  fs.mkdirSync(dir, { recursive: true });
  const stored = `${randomUUID()}-${fileName}`;
  const full = path.join(dir, stored);
  fs.writeFileSync(full, buffer);
  return {
    url: `/uploads/documents/${stored}`,
    fileName,
    sizeBytes: buffer.length,
  };
}

const DOCS = [
  {
    id: 'doc_rules_booking',
    title: 'Правила бронирования пространств',
    description: 'Тестовый документ: порядок подачи заявки, рабочие часы и отмена брони.',
    category: 'Правила',
    pdfLines: [
      'Molodezh Sochi — Pravila bronirovaniya',
      '',
      '1. Bronirovanie dostupno uchastnikam portala.',
      '2. Rabochee vremya ploshchadok: 09:00–21:00.',
      '3. Zayavka rassmatrivaetsya administratsiey.',
      '4. Otmena — ne menee chem za 3 chasa.',
    ],
  },
  {
    id: 'doc_polozhenie_spaces',
    title: 'Положение о молодёжных пространствах',
    description: 'Тестовое положение об использовании площадок Дома молодёжи и партнёрских точек.',
    category: 'Положения',
    pdfLines: [
      'Polozhenie o molodezhnykh prostranstvakh',
      '',
      'Prostranstva predostavlyayutsya dlya meropriyatiy,',
      'obucheniya i tvorcheskikh vstrech molodezhi Sochi.',
      'Ispolzovanie — po soglasovaniyu administratsii.',
    ],
  },
  {
    id: 'doc_form_apply',
    title: 'Форма заявки в проект / клуб',
    description: 'Образец формы: ФИО, контакты, мотивация. На портале заявка подаётся онлайн.',
    category: 'Формы',
    pdfLines: [
      'Forma zayavki v proekt / klub',
      '',
      'FIO: _______________________________',
      'Email / telefon: ____________________',
      'Proekt ili klub: ____________________',
      'Motivatsiya: ________________________',
    ],
  },
];

async function main() {
  for (const meta of DOCS) {
    const pdf = buildPdf(meta.pdfLines);
    const saved = writeDoc(`${meta.id}.pdf`, pdf);
    await prisma.siteDocument.upsert({
      where: { id: meta.id },
      create: {
        id: meta.id,
        title: meta.title,
        description: meta.description,
        category: meta.category,
        fileUrl: saved.url,
        fileName: saved.fileName,
        mimeType: 'application/pdf',
        sizeBytes: saved.sizeBytes,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        isDemoData: true,
      },
      update: {
        title: meta.title,
        description: meta.description,
        category: meta.category,
        fileUrl: saved.url,
        fileName: saved.fileName,
        mimeType: 'application/pdf',
        sizeBytes: saved.sizeBytes,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        isDemoData: true,
      },
    });
    console.log('seeded', meta.id, saved.url);
  }

  const txt = Buffer.from(
    `Политика конфиденциальности (тестовый фрагмент)

Портал «Молодёжь Сочи» обрабатывает персональные данные участников
в соответствии с законодательством РФ. Полная версия — на странице /privacy.

Контакты поддержки указаны в разделе «Контакты».
`,
    'utf8'
  );
  const txtSaved = writeDoc('privacy-excerpt.txt', txt);
  await prisma.siteDocument.upsert({
    where: { id: 'doc_privacy_excerpt' },
    create: {
      id: 'doc_privacy_excerpt',
      title: 'Выдержка из политики конфиденциальности',
      description: 'Тестовый текстовый документ для проверки просмотра TXT на сайте.',
      category: 'Общее',
      fileUrl: txtSaved.url,
      fileName: txtSaved.fileName,
      mimeType: 'text/plain',
      sizeBytes: txtSaved.sizeBytes,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      isDemoData: true,
    },
    update: {
      title: 'Выдержка из политики конфиденциальности',
      description: 'Тестовый текстовый документ для проверки просмотра TXT на сайте.',
      fileUrl: txtSaved.url,
      fileName: txtSaved.fileName,
      mimeType: 'text/plain',
      sizeBytes: txtSaved.sizeBytes,
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  });
  console.log('seeded doc_privacy_excerpt', txtSaved.url);
  console.log('Done');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
