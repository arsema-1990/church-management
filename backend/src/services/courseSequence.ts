export type CourseSequenceItem = { id: string; title: string };

export function getCourseSequenceAccess(
  courses: readonly CourseSequenceItem[],
  completedCourseIds: ReadonlySet<string>,
) {
  return courses.map((course, index) => {
    const previousCourse = courses[index - 1];
    const lockedByCourseTitle = previousCourse && !completedCourseIds.has(previousCourse.id)
      ? previousCourse.title
      : null;

    return {
      courseId: course.id,
      completed: completedCourseIds.has(course.id),
      locked: lockedByCourseTitle !== null,
      lockedByCourseTitle,
    };
  });
}
