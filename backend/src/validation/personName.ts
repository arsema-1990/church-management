import { z } from 'zod';

export const PERSON_NAME_ERROR = 'Use letters only; spaces, apostrophes, and hyphens are allowed.';
const personNamePattern = /^[\p{L}\p{M}]+(?:[ '\u2019-][\p{L}\p{M}]+)*$/u;

export const requiredPersonName = z.string().trim()
  .min(1, 'Enter a name.')
  .max(80, 'Name must be 80 characters or fewer.')
  .regex(personNamePattern, PERSON_NAME_ERROR);

export const optionalPersonName = z.string().trim()
  .max(80, 'Name must be 80 characters or fewer.')
  .refine(value => !value || personNamePattern.test(value), PERSON_NAME_ERROR);
