/**
 * Durable Object for managing real-time status updates for audio processing tasks
 *
 * Responsibilities:
 * - Maintain in-memory WebSocket connections
 * - Store and persist update history
 * - Broadcast status updates to all connected clients
 * - Provide history retrieval for client reconnection
 */

export interface StatusUpdate {
  taskId: string;
  stage: 'workflow' | 'transcribe' | 'extract' | 'generate' | 'db_update';
  status: 'started' | 'completed' | 'failed';
  timestamp: number; // unix ms
  duration_ms?: number; // only for completed events
  error_message?: string; // only for failed events
  overallStatus?: 'processing' | 'completed' | 'failed'; // overall workflow status
  transcription?: string; // transcription text (included when transcribe completes)
}

export class TaskStatusDO {
  private state: DurableObjectState;
  private connections: Set<WebSocket> = new Set(); // IN-MEMORY ONLY
  private updates: StatusUpdate[] = []; // IN-MEMORY cache - minimized to last 5 updates
  private taskCompleted: boolean = false; // IN-MEMORY cache
  private taskId: string; // Track taskId for this DO instance

  constructor(state: DurableObjectState) {
    this.state = state;

    // Debug: log what we're getting from state.id
    console.log(`[DO Constructor] state.id:`, state.id);
    console.log(`[DO Constructor] state.id.name:`, state.id.name);
    console.log(`[DO Constructor] state.id.toString():`, state.id.toString());

    // Try to extract taskId from state.id.name, but it may be set by first request
    this.taskId = state.id.name || 'unknown';

    console.log(`[DO Constructor] Initialized with taskId: ${this.taskId}`);

    // Load persistent state into memory on initialization
    this.state.blockConcurrencyWhile(async () => {
      const storedUpdates = await this.state.storage.get<StatusUpdate[]>('updates');
      const storedCompleted = await this.state.storage.get<boolean>('taskCompleted');

      this.updates = storedUpdates || [];
      this.taskCompleted = storedCompleted || false;

      console.log(`[DO:${this.taskId}] Loaded from storage: ${this.updates.length} updates, taskCompleted=${this.taskCompleted}`);
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // WebSocket upgrade request
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket(request);
    }

    // Publish status update endpoint (called by workflow)
    if (pathname === '/publish' && request.method === 'POST') {
      return this.handlePublish(request);
    }

    // Get update history endpoint (called by clients or for diagnostics)
    if (pathname === '/history' && request.method === 'GET') {
      return this.handleGetHistory(request);
    }

    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Handle WebSocket upgrade and maintain connection
   */
  private async handleWebSocket(_request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();

    this.connections.add(server);
    console.log(`[DO:${this.taskId}] 🔌 Client connected. Total connections: ${this.connections.size}`);

    // Send recent update history to newly connected client
    const historyMessage = JSON.stringify({
      type: 'history',
      updates: this.updates,
      taskCompleted: this.taskCompleted
    });

    console.log(`[DO:${this.taskId}] 📨 Sending history to new client:`);
    console.log(`  - Total updates in history: ${this.updates.length}`);
    console.log(`  - Task completed: ${this.taskCompleted}`);
    if (this.updates.length > 0) {
      console.log(`  - Updates:`, this.updates.map(u => ({
        stage: u.stage,
        status: u.status,
        overallStatus: u.overallStatus
      })));
    }

    try {
      server.send(historyMessage);
      console.log(`[DO:${this.taskId}] ✅ History sent successfully to client`);
    } catch (e) {
      console.error(`[DO:${this.taskId}] ❌ Failed to send history:`, e);
      this.connections.delete(server);
      return new Response(JSON.stringify({ error: 'Failed to send history' }), {
        status: 500
      });
    }

    // Handle client disconnect
    server.addEventListener('close', () => {
      this.connections.delete(server);
      console.log(`[DO:${this.taskId}] 🔌 Client disconnected. Total connections: ${this.connections.size}`);
    });

    // Handle connection errors
    server.addEventListener('error', (error) => {
      this.connections.delete(server);
      console.error(`[DO:${this.taskId}] ❌ WebSocket error:`, error);
      console.log(`[DO:${this.taskId}] 🔌 Connection error. Total connections: ${this.connections.size}`);
    });

    // Return the client side of the WebSocket pair
    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Receive and broadcast status update from workflow
   * Fire-and-forget endpoint - failures don't affect workflow
   * Only broadcasts to clients listening to this specific taskId
   */
  private async handlePublish(request: Request): Promise<Response> {
    try {
      const update = (await request.json()) as StatusUpdate;

      // If taskId is still 'unknown', initialize it from the first update
      if (this.taskId === 'unknown' && update.taskId) {
        this.taskId = update.taskId;
        console.log(`[DO] 🔧 Initializing taskId from first update: ${this.taskId}`);
      }

      console.log(`[DO:${this.taskId}] 📤 RECEIVED UPDATE:`);
      console.log(`  - stage: ${update.stage}`);
      console.log(`  - status: ${update.status}`);
      console.log(`  - overallStatus: ${update.overallStatus || 'undefined'}`);
      console.log(`  - taskId: ${update.taskId}`);
      console.log(`  - Full payload:`, JSON.stringify(update));

      // Validate this update is for this DO's taskId
      if (update.taskId !== this.taskId) {
        console.error(`[DO:${this.taskId}] ❌ TASKID MISMATCH! Update is for ${update.taskId}, ignoring`);
        return new Response(JSON.stringify({ success: false, error: 'TaskId mismatch' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Store in in-memory updates list - keep last 20 updates to preserve full workflow history
      // Workflow generates ~8 updates per task (start/complete pairs for 4 stages)
      // Keeping 20 ensures we have complete history even with retries
      this.updates.push(update);

      if (this.updates.length > 20) {
        this.updates.shift();
      }

      console.log(`[DO:${this.taskId}] 📚 Updates stored in memory: ${this.updates.length} total`);

      // Persist to storage asynchronously (non-blocking)
      this.state.storage.put('updates', this.updates).catch((err) => {
        console.error(`[DO:${this.taskId}] ❌ Failed to persist updates:`, err);
      });

      // Mark task as completed if this is a final update
      if (update.overallStatus === 'completed' || update.overallStatus === 'failed') {
        this.taskCompleted = true;
        console.log(`[DO:${this.taskId}] ✅ Task marked as ${update.overallStatus}`);
        this.state.storage.put('taskCompleted', true).catch((err) => {
          console.error(`[DO:${this.taskId}] ❌ Failed to persist taskCompleted:`, err);
        });
      }

      // Broadcast to all connected clients (already filtered by DO instance)
      const message = JSON.stringify(update);
      const failedConnections: WebSocket[] = [];
      let successCount = 0;

      console.log(`[DO:${this.taskId}] 📣 Broadcasting to ${this.connections.size} connected clients`);
      console.log(`[DO:${this.taskId}]    Message to send:`, message);

      for (const ws of this.connections) {
        try {
          console.log(`[DO:${this.taskId}]   📡 Sending to client...`);
          ws.send(message);
          successCount++;
          console.log(`[DO:${this.taskId}]   ✅ Successfully sent to client ${successCount}:`);
          console.log(`[DO:${this.taskId}]      - stage: ${update.stage}`);
          console.log(`[DO:${this.taskId}]      - status: ${update.status}`);
          console.log(`[DO:${this.taskId}]      - overallStatus: ${update.overallStatus || 'undefined'}`);
        } catch (e) {
          // Mark for deletion if send fails
          console.error(`[DO:${this.taskId}]   ❌ Failed to send to client:`, e);
          failedConnections.push(ws);
        }
      }

      // Clean up failed connections
      for (const ws of failedConnections) {
        this.connections.delete(ws);
      }

      const totalConnections = this.connections.size + failedConnections.length;
      console.log(`[DO:${this.taskId}] ✅ Broadcast complete: ${successCount}/${totalConnections} clients received update`);

      // Always return success - failures are logged but don't fail the workflow
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error(`[DO:${this.taskId}] ❌ Error in handlePublish:`, error);
      // Still return 200 to not block workflow
      return new Response(
        JSON.stringify({
          success: true,
          warning: 'Failed to process update, but workflow continues'
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  }

  /**
   * Return update history for clients or diagnostics
   */
  private async handleGetHistory(_request: Request): Promise<Response> {
    return new Response(
      JSON.stringify({
        updates: this.updates,
        taskCompleted: this.taskCompleted,
        connectedClients: this.connections.size
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      }
    );
  }
}
