/**
 * Amber Learn — прогресс через IndexedDB (storage.js).
 *
 * Статус повышается только: not-started → in-progress → completed.
 * Понижения нет.
 */

import { storage } from './storage.js?v=5';

export const progress = {
  async markStarted(userId, lessonId) {
    const p = await storage.getProgress(userId, lessonId);
    if (!p || p.status === 'not-started') {
      await storage.setProgress(userId, lessonId, { status: 'in-progress' });
    }
  },

  async completeLesson(userId, lessonId) {
    const p = await storage.getProgress(userId, lessonId);
    if (!p || p.status === 'completed') return;
    return storage.setProgress(userId, lessonId, { status: 'completed' });
  },

  async setTaskResult(userId, lessonId, taskId, passed) {
    const p = await storage.getProgress(userId, lessonId);
    const tasks = p?.tasks || {};
    tasks[taskId] = { passed, at: Date.now() };
    const status = p?.status === 'completed' ? 'completed' : p?.status || 'not-started';
    return storage.setProgress(userId, lessonId, { tasks, status });
  },

  async setQuizResult(userId, lessonId, quizId, correct) {
    const p = await storage.getProgress(userId, lessonId);
    const quiz = p?.quiz || {};
    quiz[quizId] = { correct, at: Date.now() };
    const status = p?.status === 'completed' ? 'completed' : p?.status || 'not-started';
    return storage.setProgress(userId, lessonId, { quiz, status });
  },

  async getLesson(userId, lessonId) {
    return storage.getProgress(userId, lessonId);
  },

  async getAll(userId) {
    return storage.getAllProgress(userId);
  },

  async courseStats(userId, courseId, lessonIds) {
    const all = await this.getAll(userId);
    const map = new Map(all.map(p => [p.lessonId, p]));
    let completed = 0, inProgress = 0;
    for (const lid of lessonIds) {
      const p = map.get(lid);
      if (!p) continue;
      if (p.status === 'completed') completed++;
      else if (p.status === 'in-progress') inProgress++;
    }
    const total = lessonIds.length;
    return {
      total, completed, inProgress,
      percent: total ? Math.round((completed / total) * 100) : 0,
    };
  },
};
