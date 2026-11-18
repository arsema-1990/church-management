import test from 'node:test';
import assert from 'node:assert/strict';
import { getCourseSequenceAccess } from './services/courseSequence.js';

const courses = [
  { id: 'first', title: 'First course' },
  { id: 'second', title: 'Second course' },
  { id: 'third', title: 'Third course' },
];

test('only unlocks the next course after the previous course is complete', () => {
  assert.deepEqual(getCourseSequenceAccess(courses, new Set()), [
    { courseId: 'first', completed: false, locked: false, lockedByCourseTitle: null },
    { courseId: 'second', completed: false, locked: true, lockedByCourseTitle: 'First course' },
    { courseId: 'third', completed: false, locked: true, lockedByCourseTitle: 'Second course' },
  ]);

  assert.deepEqual(getCourseSequenceAccess(courses, new Set(['first'])), [
    { courseId: 'first', completed: true, locked: false, lockedByCourseTitle: null },
    { courseId: 'second', completed: false, locked: false, lockedByCourseTitle: null },
    { courseId: 'third', completed: false, locked: true, lockedByCourseTitle: 'Second course' },
  ]);
});
