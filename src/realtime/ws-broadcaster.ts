// WebSocket broadcaster — manages connected clients and broadcasts events

import type { WebSocket } from "ws";

export interface BroadcastEvent {
  type: string;
  payload: unknown;
  timestamp: string;
}

export class WsBroadcaster {
  private clients = new Set<WebSocket>();

  addClient(ws: WebSocket): void {
    this.clients.add(ws);
    ws.on("close", () => this.clients.delete(ws));
    ws.on("error", () => this.clients.delete(ws));
  }

  broadcast(event: BroadcastEvent): void {
    const data = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(data);
      }
    }
  }

  get clientCount(): number {
    return this.clients.size;
  }
}
