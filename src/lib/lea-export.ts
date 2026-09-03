import { createCipheriv, createHash, randomBytes } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { getSiteIdentity } from '@/lib/site-identity';
import { signPortfolioDocument } from '@/lib/portfolio';
import { getPrivateRoot } from '@/lib/private-storage';

export type LeaExportResult = {
  exportId: string;
  filename: string;
  /** One-time AES key (hex). Shown only once. */
  keyHex: string;
  keyFingerprint: string;
  archiveSha256: string;
  byteSize: number;
  ciphertext: Buffer;
};

function absUrl(origin: string, url: string | null | undefined) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${origin}${url.startsWith('/') ? url : `/${url}`}`;
}

/** Collect user-related PD for lawful disclosure to RF authorities. */
export async function collectUserLeaPayload(userId: string) {
  const identity = await getSiteIdentity();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      publicCode: true,
      name: true,
      nickname: true,
      email: true,
      phone: true,
      image: true,
      city: true,
      birthDate: true,
      bio: true,
      about: true,
      hobbies: true,
      interests: true,
      role: true,
      reliabilityScore: true,
      warnCount: true,
      blockedAt: true,
      blockedReason: true,
      createdAt: true,
      privacyAcceptedAt: true,
      privacyPolicyVersion: true,
      rulesAcceptedAt: true,
      cookiesAcceptedAt: true,
      loginEvents: {
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          kind: true,
          success: true,
          ip: true,
          userAgent: true,
          deviceLabel: true,
          createdAt: true,
        },
      },
      applications: {
        take: 100,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          createdAt: true,
          projectId: true,
          clubId: true,
          programId: true,
        },
      },
      bookings: {
        take: 50,
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, status: true, startTime: true, endTime: true },
      },
      contentFlags: {
        take: 50,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          category: true,
          status: true,
          maskedText: true,
          createdAt: true,
          reliabilityDelta: true,
        },
      },
    },
  });
  if (!user) return null;

  const issuedAt = new Date().toISOString();
  const body = {
    schema: 'youngportal.lea.v1',
    site: identity.siteName,
    origin: identity.publicOrigin,
    issuedAt,
    subject: {
      ...user,
      image: absUrl(identity.publicOrigin, user.image),
    },
  };
  const json = JSON.stringify(body, null, 2);
  const contentHash = createHash('sha256').update(json).digest('hex');
  const signature = signPortfolioDocument({
    contentHash,
    userId,
    issuedAt,
  });
  return {
    json,
    contentHash,
    signature,
    issuedAt,
    siteName: identity.siteName,
    publicCode: user.publicCode,
  };
}

/**
 * Encrypt payload with AES-256-GCM. Key is returned once to the issuer;
 * only fingerprint is stored.
 */
export async function createLeaEncryptedExport(opts: {
  targetUserId: string;
  issuedById: string;
  reason: string;
  legalBasis?: string;
}): Promise<LeaExportResult | null> {
  const collected = await collectUserLeaPayload(opts.targetUserId);
  if (!collected) return null;

  const envelope = JSON.stringify({
    ...JSON.parse(collected.json),
    portalSignature: {
      contentHash: collected.contentHash,
      signature: collected.signature,
      issuedAt: collected.issuedAt,
    },
  });

  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(envelope, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: YPLEA1 | iv(12) | tag(16) | ciphertext
  const ciphertext = Buffer.concat([Buffer.from('YPLEA1'), iv, tag, enc]);
  const archiveSha256 = createHash('sha256').update(ciphertext).digest('hex');
  const keyHex = key.toString('hex');
  const keyFingerprint = createHash('sha256').update(key).digest('hex').slice(0, 32);

  const dir = path.join(getPrivateRoot(), 'lea');
  await mkdir(dir, { recursive: true });
  const filename = `lea-${opts.targetUserId.slice(0, 8)}-${Date.now()}.ypenc`;
  const absPath = path.join(dir, filename);
  await writeFile(absPath, ciphertext, { mode: 0o600 });

  const row = await prisma.leaDataExport.create({
    data: {
      targetUserId: opts.targetUserId,
      issuedById: opts.issuedById,
      reason: opts.reason.slice(0, 1000),
      legalBasis: opts.legalBasis?.slice(0, 500) || null,
      archiveSha256,
      keyFingerprint,
      storagePath: `private/lea/${filename}`,
      byteSize: ciphertext.length,
      keyRevealedAt: new Date(),
    },
  });

  return {
    exportId: row.id,
    filename,
    keyHex,
    keyFingerprint,
    archiveSha256,
    byteSize: ciphertext.length,
    ciphertext,
  };
}
