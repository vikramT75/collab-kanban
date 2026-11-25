import { Response } from 'express';
import { listenClient } from '../db/pool';
import { BoardEvent } from '../../../shared/types';
import { randomUUID } from 'crypto';

const clients = new Map<string, Response>();
let heartbeatTimer: NodeJS.Timeout | null = null;

export async function startListening(): Promise<void> {
  await listenClient.connect();
  await listenClient.query('LISTEN kanban_events');

  listenClient.on('notification', (msg) => {
    if (!msg.payload) return;
    try {
      const event = JSON.parse(msg.payload) as BoardEvent;
      broadcast(event);
    } catch (e) {
      console.error('SSE parse error', e);
    }
  });

  listenClient.on('error', (err) => {
    console.error('PG LISTEN client error:', err);
  });

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

  console.log('SSE hub listening on kanban_events');
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

export function closeAllClients(): void {
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
