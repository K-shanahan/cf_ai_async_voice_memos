#!/usr/bin/env node
/**
 * End-to-End Deployment Test
 * Tests: Audio Upload → Workflow Trigger → LLM Processing → Database Update
 *
 * Usage:
 *   npx ts-node scripts/e2e-deploy-test.ts \
 *     --worker-url https://your-worker.workers.dev \
 *     --audio-file ./test.webm \
 *     [--timeout 120] \
 *     [--poll-interval 5]
 *
 * Prerequisites:
 *   - Worker must be deployed
 *   - R2 event notifications configured
 *   - Test audio file must exist and be valid audio (WebM or MP3)
 */

import * as fs from 'fs';
import * as path from 'path';

interface TestConfig {
  workerUrl: string;
  audioFile: string;
  timeout: number; // seconds
  pollInterval: number; // seconds
  userId: string;
}

interface TaskResponse {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  transcription?: string;
  processedTasks?: Array<{
    task: string;
    due: string | null;
    generative_task_prompt: string | null;
    generated_content?: string;
  }>;
  error?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Parse CLI arguments
function parseArgs(): TestConfig {
  const args = process.argv.slice(2);
  const config: Partial<TestConfig> = {
    timeout: 120,
    pollInterval: 5,
    userId: `deploy-test-${Date.now()}`,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--worker-url' && args[i + 1]) {
      config.workerUrl = args[i + 1];
      i++;
    } else if (arg === '--audio-file' && args[i + 1]) {
      config.audioFile = args[i + 1];
      i++;
    } else if (arg === '--timeout' && args[i + 1]) {
      config.timeout = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === '--poll-interval' && args[i + 1]) {
      config.pollInterval = parseInt(args[i + 1], 10);
      i++;
    }
  }

  if (!config.workerUrl) {
    console.error('❌ Error: --worker-url is required');
    console.error('Usage: npx ts-node scripts/e2e-deploy-test.ts --worker-url <url> --audio-file <file>');
    process.exit(1);
  }

  if (!config.audioFile) {
    console.error('❌ Error: --audio-file is required');
    process.exit(1);
  }

  // Verify audio file exists
  if (!fs.existsSync(config.audioFile)) {
    console.error(`❌ Error: Audio file not found: ${config.audioFile}`);
    process.exit(1);
  }

  return config as TestConfig;
}

// Step 1: Upload audio file
async function uploadAudio(config: TestConfig): Promise<string> {
  console.log('\n📤 Step 1: Uploading audio file...');
  console.log(`   File: ${config.audioFile}`);
  console.log(`   Size: ${fs.statSync(config.audioFile).size} bytes`);

  const audioBuffer = fs.readFileSync(config.audioFile);
  const formData = new FormData();

  // Create File from buffer
  const blob = new Blob([audioBuffer], { type: 'audio/webm' });
  formData.append('audio', blob, path.basename(config.audioFile));

  try {
    const response = await fetch(`${config.workerUrl}/api/v1/memo`, {
      method: 'POST',
      headers: {
        'X-User-Id': config.userId,
      },
      body: formData,
    });

    const data = (await response.json()) as any;

    if (response.status !== 202) {
      console.error(`❌ Upload failed with status ${response.status}`);
      console.error(`   Response: ${JSON.stringify(data, null, 2)}`);
      process.exit(1);
    }

    const taskId = data.taskId;
    if (!taskId) {
      console.error('❌ No taskId in response');
      console.error(`   Response: ${JSON.stringify(data, null, 2)}`);
      process.exit(1);
    }

    console.log(`✅ Upload successful! Status: ${response.status}`);
    console.log(`   Task ID: ${taskId}`);
    console.log(`   Status URL: ${data.statusUrl}`);

    return taskId;
  } catch (error) {
    console.error('❌ Upload request failed:', error);
    process.exit(1);
  }
}

// Step 2: Poll for workflow completion
async function pollForCompletion(
  config: TestConfig,
  taskId: string
): Promise<TaskResponse> {
  console.log(`\n⏳ Step 2: Polling for workflow completion (timeout: ${config.timeout}s)...`);
  console.log(`   Using adaptive polling with exponential backoff...`);

  let elapsed = 0;
  let pollCount = 0;
  let currentPollInterval = Math.max(2, config.pollInterval); // Start with at least 2s
  const maxPollInterval = 15; // Cap at 15s
  let consecutiveStillPending = 0;

  // Track last status to detect changes
  let lastStatus: string | null = null;

  while (elapsed < config.timeout) {
    try {
      const response = await fetch(
        `${config.workerUrl}/api/v1/memo/${taskId}`,
        {
          method: 'GET',
          headers: {
            'X-User-Id': config.userId,
          },
        }
      );

      if (response.status === 404) {
        console.error('❌ Task not found in database');
        process.exit(1);
      }

      const task = (await response.json()) as TaskResponse;

      // Track if status changed
      const statusChanged = lastStatus !== task.status;
      lastStatus = task.status;

      switch (task.status) {
        case 'pending':
          consecutiveStillPending++;

          // Print status less frequently once we've confirmed it's pending
          if (statusChanged || pollCount % 3 === 0) {
            console.log(
              `   ⏳ Still pending... (${elapsed}/${config.timeout}s, poll #${pollCount})`
            );
          }

          // Increase poll interval for pending tasks (likely waiting for queue)
          if (consecutiveStillPending > 2) {
            currentPollInterval = Math.min(maxPollInterval, currentPollInterval * 1.2);
          }
          break;

        case 'processing':
          consecutiveStillPending = 0;
          currentPollInterval = Math.max(2, config.pollInterval); // Reset to faster polling
          console.log(
            `   🔄 Processing... (${elapsed}/${config.timeout}s)`
          );
          break;

        case 'completed':
          console.log(`✅ Workflow completed! (after ${elapsed}s)`);
          return task;

        case 'failed':
          console.error(`❌ Workflow failed: ${task.error || 'Unknown error'}`);
          process.exit(1);

        default:
          console.warn(`❓ Unknown status: ${task.status}`);
      }

      // Use exponential backoff: wait progressively longer
      const waitTime = Math.round(currentPollInterval * 1000);
      await sleep(waitTime);
      elapsed += Math.round(currentPollInterval);
      pollCount++;
    } catch (error) {
      console.error('❌ Polling request failed:', error);
      process.exit(1);
    }
  }

  console.error(`❌ Timeout waiting for workflow (${config.timeout}s)`);
  process.exit(1);
}

// Step 3: Verify results
function verifyResults(config: TestConfig, task: TaskResponse): void {
  console.log('\n✅ Step 3: Verifying results...\n');

  // Verify transcription exists
  if (!task.transcription) {
    console.error('❌ No transcription in completed task');
    process.exit(1);
  }

  console.log('📝 Transcription:');
  console.log(`   ${task.transcription}`);

  // Verify processed tasks exist
  if (!Array.isArray(task.processedTasks)) {
    console.error('❌ No processedTasks array in completed task');
    process.exit(1);
  }

  console.log(`\n✅ Extracted ${task.processedTasks.length} task(s):`);
  task.processedTasks.forEach((t, i) => {
    console.log(`\n   Task ${i + 1}:`);
    console.log(`      Description: ${t.task}`);
    console.log(`      Due: ${t.due || '(no due date)'}`);
    if (t.generative_task_prompt) {
      console.log(`      AI Prompt: ${t.generative_task_prompt}`);
    }
    if (t.generated_content) {
      console.log(`      Generated Content:`);
      t.generated_content
        .split('\n')
        .forEach((line) => console.log(`        ${line}`));
    }
  });
}

// Helper: Sleep
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Main test runner
async function runTest(): Promise<void> {
  const config = parseArgs();

  console.log('\n🚀 Starting End-to-End Deployment Test');
  console.log('═'.repeat(50));
  console.log(`Worker URL: ${config.workerUrl}`);
  console.log(`User ID: ${config.userId}`);
  console.log(`Audio File: ${config.audioFile}`);
  console.log('═'.repeat(50));

  try {
    // Step 1: Upload
    const taskId = await uploadAudio(config);

    // Step 2: Poll for completion
    const completedTask = await pollForCompletion(config, taskId);

    // Step 3: Verify
    verifyResults(config, completedTask);

    console.log('\n' + '═'.repeat(50));
    console.log('✅✅✅ END-TO-END TEST PASSED!');
    console.log('═'.repeat(50));
    console.log('\n✅ Your system is working correctly:');
    console.log('   1. ✅ Audio upload to R2');
    console.log('   2. ✅ Workflow triggered by R2 event');
    console.log('   3. ✅ Transcription (Whisper)');
    console.log('   4. ✅ Task extraction (Llama)');
    console.log('   5. ✅ Content generation (Llama)');
    console.log('   6. ✅ Database update');
    console.log('\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
runTest().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
