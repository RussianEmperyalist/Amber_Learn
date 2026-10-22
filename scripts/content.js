/**
 * Amber Learn — загрузка контента.
 */

const BASE = './content';

async function fetchJson(path) {
  const res = await fetch(`${BASE}/${path}`);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

export const content = {
  async getCourses() {
    const data = await fetchJson('courses.json');
    return data.courses || [];
  },

  async getCourse(courseId) {
    const courses = await this.getCourses();
    return courses.find(c => c.id === courseId);
  },

  async getLessonsIndex(courseId) {
    return fetchJson(`${courseId}/index.json`);
  },

  async getLesson(courseId, lessonId) {
    return fetchJson(`${courseId}/${lessonId}.json`);
  }
};
