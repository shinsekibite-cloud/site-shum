import { PDFDocument, rgb, degrees } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';
import {
  OFFICIAL_DOC_TYPE_META,
  type OfficialDocType,
  type OfficialDocTemplate,
} from '@/lib/official-documents-shared';

export type { OfficialDocType, OfficialDocTemplate };
export { OFFICIAL_DOC_TYPE_META, OFFICIAL_DOC_TEMPLATES } from '@/lib/official-documents-shared';

export function makeSerialNumber(type: OfficialDocType) {
  const prefix = type.slice(0, 3).toUpperCase();
  const y = new Date().getFullYear();
  const rnd = randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}-${y}-${rnd}`;
}

export type OfficialPdfInput = {
  type: OfficialDocType;
  title: string;
  subtitle?: string | null;
  body?: string | null;
  recipientName: string;
  issuerName: string;
  issuedAt: Date;
  serialNumber: string;
  siteName: string;
  template?: OfficialDocTemplate | string;
};

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars) {
      if (cur) lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

async function loadFonts(pdf: PDFDocument) {
  pdf.registerFontkit(fontkit);
  const fontsDir = join(process.cwd(), 'public', 'fonts');
  const regular = await readFile(join(fontsDir, 'DejaVuSans.ttf'));
  const bold = await readFile(join(fontsDir, 'DejaVuSans-Bold.ttf'));
  const font = await pdf.embedFont(regular, { subset: true });
  const fontBold = await pdf.embedFont(bold, { subset: true });
  return { font, fontBold };
}

/** Generate a landscape A4 PDF certificate and return public path. */
export async function generateOfficialDocumentPdf(input: OfficialPdfInput): Promise<{
  pdfPath: string;
  bytes: Uint8Array;
}> {
  const meta = OFFICIAL_DOC_TYPE_META[input.type];
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([842, 595]); // A4 landscape
  const { width, height } = page.getSize();
  const { font, fontBold } = await loadFonts(pdf);
  const accent = rgb(...meta.accent);

  page.drawRectangle({
    x: 28,
    y: 28,
    width: width - 56,
    height: height - 56,
    borderColor: accent,
    borderWidth: 2.5,
  });
  page.drawRectangle({
    x: 38,
    y: 38,
    width: width - 76,
    height: height - 76,
    borderColor: rgb(0.75, 0.7, 0.55),
    borderWidth: 1,
  });

  page.drawText(input.siteName.slice(0, 40), {
    x: 120,
    y: height / 2 - 20,
    size: 36,
    font: fontBold,
    color: rgb(0.92, 0.93, 0.94),
    rotate: degrees(28),
    opacity: 0.45,
  });

  const centerX = width / 2;
  const drawCentered = (text: string, y: number, size: number, bold = false, color = rgb(0.1, 0.14, 0.2)) => {
    const f = bold ? fontBold : font;
    const tw = f.widthOfTextAtSize(text, size);
    page.drawText(text, { x: centerX - tw / 2, y, size, font: f, color });
  };

  drawCentered(input.siteName.toUpperCase().slice(0, 60), height - 88, 11, true, accent);
  drawCentered(meta.label.toUpperCase(), height - 130, 26, true, accent);
  if (input.subtitle) {
    drawCentered(input.subtitle.slice(0, 80), height - 158, 11, false, rgb(0.35, 0.4, 0.48));
  }

  drawCentered('награждается', height - 200, 12);
  drawCentered(input.recipientName.slice(0, 80), height - 235, 20, true);

  const bodyLines = wrapText((input.body || input.title).slice(0, 320), 64);
  let by = height - 280;
  for (const line of bodyLines.slice(0, 5)) {
    drawCentered(line, by, 11);
    by -= 17;
  }
  if (input.title && input.body) {
    drawCentered(input.title.slice(0, 90), by - 8, 12, true);
  }

  const dateStr = input.issuedAt.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  page.drawText(`Дата: ${dateStr}`, {
    x: 70,
    y: 78,
    size: 10,
    font,
    color: rgb(0.25, 0.3, 0.36),
  });
  page.drawText(`№ ${input.serialNumber}`, {
    x: 70,
    y: 60,
    size: 9,
    font,
    color: rgb(0.4, 0.45, 0.5),
  });

  const issuer = `Подпись: ${input.issuerName.slice(0, 48)}`;
  const iw = font.widthOfTextAtSize(issuer, 10);
  page.drawText(issuer, {
    x: width - 70 - iw,
    y: 78,
    size: 10,
    font,
    color: rgb(0.25, 0.3, 0.36),
  });

  const bytes = await pdf.save();
  const dir = join(process.cwd(), 'public', 'uploads', 'awards');
  await mkdir(dir, { recursive: true });
  const fileName = `${input.serialNumber.replace(/[^A-Z0-9-]/gi, '_')}.pdf`;
  await writeFile(join(dir, fileName), bytes);
  return { pdfPath: `/uploads/awards/${fileName}`, bytes };
}
