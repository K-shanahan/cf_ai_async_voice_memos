/**
 * Shared utility functions for Voice Memo Task Manager
 */

/**
 * Format a date string to a human-readable format
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Calculate elapsed time between two dates
 */
export function getElapsedSeconds(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return Math.floor((end.getTime() - start.getTime()) / 1000);
}

/**
 * Format elapsed seconds to a human-readable duration
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Truncate text to a maximum length with ellipsis
 */
export function truncateText(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Get status badge text with emoji
 */
export function getStatusBadge(status: string): string {
  const badges: Record<string, string> = {
    pending: '⏳ Pending',
    processing: '🔄 Processing',
    completed: '✅ Complete',
    failed: '❌ Failed',
  };
  return badges[status] || status;
}

/**
 * Generate a unique task ID (client-side, for reference only)
 */
export function generateClientTaskId(): string {
  return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Check if a date is recent (within last 24 hours)
 */
export function isRecentDate(dateString: string): boolean {
  const date = new Date(dateString);
  const now = new Date();
  const hoursDiff = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
  return hoursDiff < 24;
}
