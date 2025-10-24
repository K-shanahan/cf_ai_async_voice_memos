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
}

export class TaskStatusDO {
  private state: DurableObjectState;
  private connections: Set<WebSocket> = new Set(); // IN-MEMORY ONLY
  private updates: StatusUpdate[] = []; // IN-MEMORY cache of persistent state
  private taskCompleted: boolean = false; // IN-MEMORY cache

  constructor(state: DurableObjectState) {
    this.state = state;

    // Load persistent state into memory on initialization
    this.state.blockConcurrencyWhile(async () => {
      const storedUpdates = await this.state.storage.get<StatusUpdate[]>('updates');
      const storedCompleted = await this.state.storage.get<boolean>('taskCompleted');

      this.updates = storedUpdates || [];
      this.taskCompleted = storedCompleted || false;
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
  private async handleWebSocket(request: Request): Promise<Response> {
    const [client, server] = new WebSocketPair();
    server.accept();

    this.connections.add(server);

    // Send recent update history to newly connected client
    const historyMessage = JSON.stringify({
      type: 'history',
      updates: this.updates,
      taskCompleted: this.taskCompleted
    });

    try {
      server.send(historyMessage);
    } catch (e) {
      this.connections.delete(server);
      return new Response(JSON.stringify({ error: 'Failed to send history' }), {
        status: 500
      });
    }

    // Handle client disconnect
    server.addEventListener('close', () => {
      this.connections.delete(server);
    });

    // Handle connection errors
    server.addEventListener('error', () => {
      this.connections.delete(server);
    });

    // Return the client side of the WebSocket pair
    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Receive and broadcast status update from workflow
   * Fire-and-forget endpoint - failures don't affect workflow
   */
  private async handlePublish(request: Request): Promise<Response> {
    try {
      const update = (await request.json()) as StatusUpdate;

      // Store in in-memory updates list
      this.updates.push(update);

      // Keep only last 50 updates to prevent unbounded growth
      if (this.updates.length > 50) {
        this.updates.shift();
      }

      // Persist to storage asynchronously (non-blocking)
      this.state.storage.put('updates', this.updates).catch((err) => {
        console.error('Failed to persist updates:', err);
      });

      // Mark task as completed if this is a final update
      if (update.status === 'completed' || update.status === 'failed') {
        this.taskCompleted = true;
        this.state.storage.put('taskCompleted', true).catch((err) => {
          console.error('Failed to persist taskCompleted:', err);
        });
      }

      // Broadcast to all connected clients
      const message = JSON.stringify(update);
      const failedConnections: WebSocket[] = [];

      for (const ws of this.connections) {
        try {
          ws.send(message);
        } catch (e) {
          // Mark for deletion if send fails
          failedConnections.push(ws);
        }
      }

      // Clean up failed connections
      for (const ws of failedConnections) {
        this.connections.delete(ws);
      }

      // Always return success - failures are logged but don't fail the workflow
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Error in handlePublish:', error);
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
  private async handleGetHistory(request: Request): Promise<Response> {
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
