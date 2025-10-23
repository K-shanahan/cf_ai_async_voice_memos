/**
 * Database utility functions for D1
 */

export interface Task {
  taskId: string;
  userId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  r2Key: string | null;
  transcription: string | null;
  processedTasks: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Insert a new task record into the database
 */
export async function createTask(
  db: D1Database,
  taskId: string,
  userId: string,
  r2Key: string
): Promise<void> {
  const now = new Date().toISOString();

  const query = `
    INSERT INTO tasks (taskId, userId, status, r2Key, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  await db
    .prepare(query)
    .bind(taskId, userId, 'pending', r2Key, now, now)
    .run();
}

/**
 * Retrieve a task by ID and optionally by user ID (for security)
 */
export async function getTask(db: D1Database, taskId: string, userId?: string): Promise<Task | null> {
  let query = `SELECT * FROM tasks WHERE taskId = ?`;
  const params: any[] = [taskId];

  // If userId provided, add security check
  if (userId) {
    query += ` AND userId = ?`;
    params.push(userId);
  }

  const result = await db.prepare(query).bind(...params).first<Task>();

  return result || null;
}

/**
 * Update task status
 */
export async function updateTaskStatus(
  db: D1Database,
  taskId: string,
  status: Task['status']
): Promise<void> {
  const now = new Date().toISOString();

  const query = `
    UPDATE tasks
    SET status = ?, updatedAt = ?
    WHERE taskId = ?
  `;

  await db.prepare(query).bind(status, now, taskId).run();
}

/**
 * Update task with transcription and processed tasks
 */
export async function updateTaskResults(
  db: D1Database,
  taskId: string,
  transcription: string,
  processedTasks: string
): Promise<void> {
  const now = new Date().toISOString();

  const query = `UPDATE tasks SET status = ?, transcription = ?, processedTasks = ?, updatedAt = ? WHERE taskId = ?`;

  await db
    .prepare(query)
    .bind('completed', transcription, processedTasks, now, taskId)
    .run();
}

/**
 * Update task with error message
 */
export async function updateTaskError(
  db: D1Database,
  taskId: string,
  errorMessage: string
): Promise<void> {
  const now = new Date().toISOString();

  const query = `UPDATE tasks SET status = ?, errorMessage = ?, updatedAt = ? WHERE taskId = ?`;

  await db
    .prepare(query)
    .bind('failed', errorMessage, now, taskId)
    .run();
}

/**
 * Get all tasks for a user
 */
export async function getUserTasks(db: D1Database, userId: string): Promise<Task[]> {
  const query = `
    SELECT * FROM tasks
    WHERE userId = ?
    ORDER BY createdAt DESC
  `;

  const results = await db.prepare(query).bind(userId).all<Task>();

  return results.results || [];
}
