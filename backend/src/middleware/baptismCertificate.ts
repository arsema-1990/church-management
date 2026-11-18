import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import multer from 'multer';

const certificateDirectory = path.resolve('uploads', 'registration-certificates');
const extensions: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
};

export const uploadBaptismCertificate = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, done) => {
      mkdirSync(certificateDirectory, { recursive: true });
      done(null, certificateDirectory);
    },
    filename: (_req, file, done) => done(null, Date.now() + '-' + randomBytes(12).toString('hex') + (extensions[file.mimetype] ?? '.file')),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, done) => {
    if (!extensions[file.mimetype]) return done(new Error('Upload a PDF, JPG, or PNG baptism certificate.'));
    done(null, true);
  },
});
