-- Create tasks table for storing memo processing state
CREATE TABLE IF NOT EXISTS tasks (
  taskId TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  r2Key TEXT,
  transcription TEXT,
  processedTasks TEXT,
  errorMessage TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_tasks_userId ON tasks(userId);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_createdAt ON tasks(createdAt DESC);
