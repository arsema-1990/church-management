import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import multer from 'multer';

const photoDirectory = path.resolve('uploads', 'profiles');
const extensions: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export const uploadProfilePhoto = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, done) => {
      mkdirSync(photoDirectory, { recursive: true });
      done(null, photoDirectory);
    },
    filename: (_req, file, done) => done(null, `${Date.now()}-${randomBytes(12).toString('hex')}${extensions[file.mimetype] ?? '.img'}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, done) => {
    if (!extensions[file.mimetype]) return done(new Error('Choose a JPG, PNG, or WebP profile photo.'));
    done(null, true);
  },
});
