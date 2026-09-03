import { createCipheriv, createHash, createHmac, randomBytes } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { getSiteIdentity } from '@/lib/site-identity';
import {
  PRIVACY_POLICY_VERSION,
  RULES_POLICY_VERSION,
  INSTRUCTIONS_VERSION,
} from '@/lib/consent-versions';
import { getPrivateRoot } from '@/lib/private-storage';
const SCHEMA = 'youngportal.backup.v1';

export type ProjectBackupResult = {
  backupId: string;
  filename: string;
  keyHex: string;
  keyFingerprint: string;
  archiveSha256: string;
  contentHash: string;
  signature: string;
  byteSize: number;
  issuedAt: string;
};

function signingSecret() {
  return (
    process.env.BACKUP_SIGNING_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.PORTFOLIO_SIGNING_SECRET ||
    'youngportal-dev-backup-secret'
  );
}

export function signBackupPayload(opts: {
  contentHash: string;
  issuedAt: string;
  issuedById: string;
}) {
  const payload = `${SCHEMA}|${opts.contentHash}|${opts.issuedById}|${opts.issuedAt}`;
  return createHmac('sha256', signingSecret()).update(payload, 'utf8').digest('hex');
}

export function verifyBackupSignature(opts: {
  contentHash: string;
  issuedAt: string;
  issuedById: string;
  signature: string;
}) {
  return signBackupPayload(opts) === opts.signature;
}

/** Collect a portable JSON snapshot of portal configuration + anonymized counts. */
export async function collectProjectBackupPayload(issuedById: string) {
  const identity = await getSiteIdentity();
  const [
    settings,
    pages,
    documents,
    projects,
    clubs,
    spaces,
    programs,
    news,
    userCount,
    bookingCount,
    applicationCount,
  ] = await Promise.all([
    prisma.siteSettings.findUnique({ where: { id: '1' } }),
    prisma.pageContent.findMany({
      select: {
        id: true,
        slug: true,
        title: true,
        menuPosition: true,
        status: true,
        updatedAt: true,
        content: true,
        template: true,
      },
    }),
    prisma.siteDocument.findMany({
      select: {
        id: true,
        title: true,
        category: true,
        fileUrl: true,
        fileName: true,
        mimeType: true,
        createdAt: true,
      },
    }),
    prisma.project.findMany({
      select: {
        id: true,
        title: true,
        status: true,
        image: true,
        updatedAt: true,
      },
    }),
    prisma.club.findMany({
      select: {
        id: true,
        title: true,
        status: true,
        image: true,
        updatedAt: true,
      },
    }),
    prisma.space.findMany({
      select: {
        id: true,
        title: true,
        status: true,
        image: true,
        updatedAt: true,
      },
    }),
    prisma.portalProgram.findMany({
      select: {
        id: true,
        title: true,
        status: true,
        image: true,
        updatedAt: true,
      },
    }),
    prisma.news.findMany({
      take: 200,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        status: true,
        imageUrl: true,
        publishedAt: true,
        createdAt: true,
      },
    }),
    prisma.user.count(),
    prisma.booking.count(),
    prisma.application.count(),
  ]);

  // Strip secrets from settings clone
  const safeSettings = settings
    ? {
        ...settings,
        smtpPass: settings.smtpPass ? '[REDACTED]' : null,
        vkApiToken: settings.vkApiToken ? '[REDACTED]' : null,
        rknPackJson: settings.rknPackJson ? '[REDACTED_OR_SENSITIVE]' : null,
      }
    : null;

  const issuedAt = new Date().toISOString();
  const body = {
    schema: SCHEMA,
    site: identity.siteName,
    origin: identity.publicOrigin,
    issuedAt,
    issuedById,
    versions: {
      privacy: PRIVACY_POLICY_VERSION,
      rules: RULES_POLICY_VERSION,
      instructions: INSTRUCTIONS_VERSION,
    },
    counts: {
      users: userCount,
      bookings: bookingCount,
      applications: applicationCount,
      pages: pages.length,
      documents: documents.length,
      projects: projects.length,
      clubs: clubs.length,
      spaces: spaces.length,
      programs: programs.length,
      news: news.length,
    },
    settings: safeSettings,
    pages,
    documents,
    catalog: { projects, clubs, spaces, programs },
    news,
  };

  const json = JSON.stringify(body, null, 2);
  const contentHash = createHash('sha256').update(json).digest('hex');
  const signature = signBackupPayload({ contentHash, issuedAt, issuedById });
  return { json, contentHash, signature, issuedAt, body };
}

/**
 * Encrypt backup with AES-256-GCM. Key returned once; only fingerprint stored.
 * File magic: YPBK1 | iv(12) | tag(16) | ciphertext
 */
export async function createEncryptedProjectBackup(opts: {
  issuedById: string;
  label?: string;
  note?: string;
}): Promise<ProjectBackupResult> {
  const collected = await collectProjectBackupPayload(opts.issuedById);

  const envelope = JSON.stringify({
    ...JSON.parse(collected.json),
    portalSignature: {
      schema: SCHEMA,
      contentHash: collected.contentHash,
      signature: collected.signature,
      issuedAt: collected.issuedAt,
      issuedById: opts.issuedById,
    },
  });

  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(envelope, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const ciphertext = Buffer.concat([Buffer.from('YPBK1'), iv, tag, enc]);
  const archiveSha256 = createHash('sha256').update(ciphertext).digest('hex');
  const keyHex = key.toString('hex');
  const keyFingerprint = createHash('sha256').update(key).digest('hex').slice(0, 32);

  const dir = path.join(getPrivateRoot(), 'backups');
  await mkdir(dir, { recursive: true });
  const stamp = collected.issuedAt.replace(/[:.]/g, '-');
  const filename = `backup-${stamp}.ypenc`;
  const absPath = path.join(dir, filename);
  await writeFile(absPath, ciphertext, { mode: 0o600 });

  const row = await prisma.projectBackup.create({
    data: {
      issuedById: opts.issuedById,
      label: opts.label?.slice(0, 120) || null,
      note: opts.note?.slice(0, 1000) || null,
      archiveSha256,
      contentHash: collected.contentHash,
      signature: collected.signature,
      keyFingerprint,
      storagePath: `private/backups/${filename}`,
      byteSize: ciphertext.length,
      schemaVersion: SCHEMA,
      keyRevealedAt: new Date(),
    },
  });

  return {
    backupId: row.id,
    filename,
    keyHex,
    keyFingerprint,
    archiveSha256,
    contentHash: collected.contentHash,
    signature: collected.signature,
    byteSize: ciphertext.length,
    issuedAt: collected.issuedAt,
  };
}
