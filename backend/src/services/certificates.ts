import { randomBytes } from 'node:crypto';
import QRCode from 'qrcode';
import { CertificateType } from '@prisma/client';
import { prisma } from '../prisma.js';

export async function issueCertificate(input: {
  personId: string;
  type: CertificateType;
  requestId?: string;
  issuerId: string;
  courseId?: string;
  courseTitleSnapshot?: string;
}) {
  const [person, issuer] = await Promise.all([
    prisma.person.findUniqueOrThrow({ where: { id: input.personId }, select: { firstName: true, middleName: true, lastName: true } }),
    prisma.user.findUniqueOrThrow({ where: { id: input.issuerId }, select: { person: { select: { firstName: true, middleName: true, lastName: true } }, username: true, signatureData: true } }),
  ]);
  const issuerNameSnapshot = [issuer.person?.firstName, issuer.person?.middleName, issuer.person?.lastName].filter(Boolean).join(' ') || issuer.username;
  const verificationCode = randomBytes(12).toString('hex').toUpperCase();
  const certificateNumber = `GEC-${input.type}-${new Date().getFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}`;
  const verificationUrl = `${process.env.WEB_ORIGIN ?? 'http://localhost:5173'}/verify/${verificationCode}`;
  const qrCodeDataUrl = await QRCode.toDataURL(verificationUrl);
  const data = {
    personId: input.personId,
    type: input.type,
    requestId: input.requestId,
    courseId: input.courseId,
    courseTitleSnapshot: input.courseTitleSnapshot,
    certificateNumber,
    verificationCode,
    issuerId: input.issuerId,
    issuerNameSnapshot,
    signatureSnapshot: issuer.signatureData,
    qrCodeDataUrl,
  };

  if (input.courseId) {
    return prisma.certificate.upsert({
      where: { personId_courseId: { personId: input.personId, courseId: input.courseId } },
      create: data,
      update: {},
      include: { person: true },
    });
  }

  return prisma.certificate.create({ data, include: { person: true } });
}
