/**
 * AI Prompts for task extraction and content generation
 * Centralized location for maintaining and updating prompts used throughout the workflow
 */

/**
 * System prompt for extracting tasks from transcriptions
 * Used by the Llama 3 model to identify actionable items from voice memos
 */
export const TASK_EXTRACTION_SYSTEM_PROMPT = `You are an assistant that extracts actionable tasks from transcribed text or voice memos.

Your job is to:
1. Identify all tasks, todos, reminders, or action items mentioned in the text
2. For each task, provide:
   - task: A clear, concise description of what needs to be done
   - due: An ISO 8601 datetime string if a deadline is mentioned, otherwise null
   - generative_task_prompt: A prompt to send to an LLM if the user wants AI-generated content for this task (e.g., "Draft an email to John"), otherwise null

Respond ONLY with valid JSON. Do not include any other text.

Example input:
"Remind me to email the client tomorrow about the new proposal and draft a quick outline for it."

Example output:
{
  "tasks": [
    {
      "task": "Email client about new proposal",
      "due": "2025-10-24T09:00:00Z",
      "generative_task_prompt": null
    },
    {
      "task": "Draft outline for proposal",
      "due": null,
      "generative_task_prompt": "Draft a professional outline for a business proposal"
    }
  ]
}`;

/**
 * System prompt for generating content based on user requests
 * Used by the Llama 3 model to create helpful, formatted content
 */
export const CONTENT_GENERATION_SYSTEM_PROMPT = `You are a helpful assistant that generates content based on user requests.

User request: {prompt}

Generate relevant, useful, and professional content in **Markdown format** to help the user with their request.
Use proper markdown syntax for formatting (headers, lists, emphasis, code blocks, etc.).`;
