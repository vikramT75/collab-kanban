import { Response } from 'express';
import pg from 'pg';
import { randomUUID } from 'crypto';
import { DATABASE_URL } from '../config/env';
import { BoardEvent } from '../../../shared/types';

const clients = new Map<string, Response>();
let heartbeatTimer: NodeJS.Timeout | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let activeListener: pg.Client | null = null;
let isShuttingDown = false;

async function connectListener(attempt = 0): Promise<void> {
  if (isShuttingDown) return;

  const client = new pg.Client({ connectionString: DATABASE_URL });
  activeListener = client;

  const scheduleReconnect = () => {
    if (isShuttingDown || reconnectTimer) return;
    const delayMs = Math.min(1000 * 2 ** attempt, 10_000);
    console.log(`Reconnecting PG LISTEN client in ${delayMs}ms...`);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connectListener(attempt + 1);
    }, delayMs);
  };

  client.on('notification', (msg) => {
    if (!msg.payload) return;
    try {
      const event = JSON.parse(msg.payload) as BoardEvent;
      broadcast(event);
    } catch (e) {
      console.error('SSE parse error', e);
    }
  });

  client.on('error', (err) => {
    console.error('PG LISTEN client error:', err.message);
    if (activeListener === client) {
      activeListener = null;
      client.end().catch(() => {});
      scheduleReconnect();
    }
  });

  client.on('end', () => {
    if (activeListener === client) {
      activeListener = null;
      scheduleReconnect();
    }
  });

  try {
    await client.connect();
    await client.query('LISTEN kanban_events');
    console.log('SSE hub listening on kanban_events');

    // If this was a reconnect after a PG drop, tell connected tabs to silently resync
    if (attempt > 0) {
      broadcast({
        type: 'board:resync',
        eventId: randomUUID(),
        originClientId: 'server',
      });
    }
  } catch (err: any) {
    console.error('Failed to start PG LISTEN client:', err?.message ?? err);
    activeListener = null;
    await client.end().catch(() => {});
    if (attempt === 0) {
      throw err;
    }
    scheduleReconnect();
  }
}

export async function startListening(): Promise<void> {
  isShuttingDown = false;
  await connectListener(0);

  // 25s heartbeat to prevent NAT/proxy idle disconnects
  heartbeatTimer = setInterval(() => {
    for (const [id, res] of clients.entries()) {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clients.delete(id);
      }
    }
  }, 25_000);
}

export function registerClient(res: Response): string {
  const connectionId = randomUUID();
  clients.set(connectionId, res);
  res.write(': connected\n\n');
  console.log(`SSE client connected: ${connectionId}, total: ${clients.size}`);
  return connectionId;
}

export function unregisterClient(connectionId: string): void {
  clients.delete(connectionId);
  console.log(`SSE client disconnected: ${connectionId}, total: ${clients.size}`);
}

export async function closeAllClients(): Promise<void> {
  isShuttingDown = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  for (const res of clients.values()) {
    try {
      res.end();
    } catch {
      // ignore
    }
  }
  clients.clear();
  if (activeListener) {
    await activeListener.end().catch(() => {});
    activeListener = null;
  }
}

function broadcast(event: BoardEvent): void {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const [id, res] of clients.entries()) {
    try {
      res.write(data);
    } catch {
      clients.delete(id);
    }
  }
}
