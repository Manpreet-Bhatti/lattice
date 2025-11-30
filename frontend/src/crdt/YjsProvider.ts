import * as Y from "yjs";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

const SYNC_STEP_1 = 0;
const SYNC_STEP_2 = 1;
const SYNC_UPDATE = 2;

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export interface AwarenessState {
  user?: {
    name: string;
    color: string;
  };
  cursor?: {
    anchor: number;
    head: number;
  };
}

interface AwarenessChange {
  added: number[];
  updated: number[];
  removed: number[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventCallback = (...args: any[]) => void;

/**
 * Simple event emitter to replace deprecated lib0/observable
 */
class EventEmitter {
  private listeners: Map<string, Set<EventCallback>> = new Map();

  on(event: string, callback: EventCallback): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: EventCallback): void {
    this.listeners.get(event)?.delete(callback);
  }

  emit(event: string, args: unknown[]): void {
    this.listeners.get(event)?.forEach((callback) => {
      try {
        callback(...args);
      } catch (e) {
        console.error("Event callback error:", e);
      }
    });
  }

  destroy(): void {
    this.listeners.clear();
  }
}

/**
 * Custom WebSocket provider for Yjs that works with our Go backend.
 * Implements the Yjs sync protocol for document synchronization.
 */
export class LatticeProvider extends EventEmitter {
  doc: Y.Doc;
  roomId: string;
  awareness: Awareness;

  private ws: WebSocket | null = null;
  private wsUrl: string;
  private status: ConnectionStatus = "disconnected";
  private reconnectTimeout: number | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private synced = false;

  constructor(wsUrl: string, roomId: string, doc: Y.Doc) {
    super();
    this.wsUrl = wsUrl;
    this.roomId = roomId;
    this.doc = doc;
    this.awareness = new Awareness(doc);

    // Listen for local document updates
    this.doc.on("update", this.handleDocUpdate);

    // Listen for awareness updates
    this.awareness.on("update", this.handleAwarenessUpdate);

    this.connect();
  }

  get connectionStatus(): ConnectionStatus {
    return this.status;
  }

  get isSynced(): boolean {
    return this.synced;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.setStatus("connecting");

    const url = `${this.wsUrl}?room=${encodeURIComponent(this.roomId)}`;
    this.ws = new WebSocket(url);
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = () => {
      console.log("🌸 Lattice: Connected to room", this.roomId);
      this.setStatus("connected");
      this.reconnectAttempts = 0;

      // Request document state
      this.sendSyncStep1();

      // Send initial awareness state
      this.sendAwarenessState();
    };

    this.ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        this.handleMessage(new Uint8Array(event.data));
      }
    };

    this.ws.onclose = () => {
      console.log("🌸 Lattice: Disconnected from room", this.roomId);
      this.ws = null;
      this.synced = false;
      this.setStatus("disconnected");
      this.scheduleReconnect();
    };

    this.ws.onerror = (error) => {
      console.error("🌸 Lattice: WebSocket error", error);
      this.setStatus("error");
    };
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.reconnectAttempts = this.maxReconnectAttempts;
    this.ws?.close();
    this.ws = null;
    this.setStatus("disconnected");
  }

  destroy(): void {
    this.disconnect();
    this.doc.off("update", this.handleDocUpdate);
    this.awareness.off("update", this.handleAwarenessUpdate);
    this.awareness.destroy();
    super.destroy();
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.emit("status", [status]);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log("🌸 Lattice: Max reconnection attempts reached");
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    console.log(
      `🌸 Lattice: Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
    );

    this.reconnectTimeout = window.setTimeout(() => {
      this.connect();
    }, delay);
  }

  private handleMessage = (data: Uint8Array): void => {
    const decoder = decoding.createDecoder(data);
    const messageType = decoding.readVarUint(decoder);

    switch (messageType) {
      case MESSAGE_SYNC:
        this.handleSyncMessage(decoder);
        break;
      case MESSAGE_AWARENESS:
        this.handleAwarenessMessage(decoder);
        break;
      default:
        console.warn("🌸 Lattice: Unknown message type", messageType);
    }
  };

  private handleSyncMessage(decoder: decoding.Decoder): void {
    const syncType = decoding.readVarUint(decoder);

    switch (syncType) {
      case SYNC_STEP_1: {
        // Send state vector + missing updates
        const stateVector = decoding.readVarUint8Array(decoder);
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        encoding.writeVarUint(encoder, SYNC_STEP_2);
        encoding.writeVarUint8Array(
          encoder,
          Y.encodeStateAsUpdate(this.doc, stateVector)
        );
        this.send(encoding.toUint8Array(encoder));
        break;
      }
      case SYNC_STEP_2: {
        // Apply the update
        const update = decoding.readVarUint8Array(decoder);
        Y.applyUpdate(this.doc, update, this);
        if (!this.synced) {
          this.synced = true;
          this.emit("synced", [true]);
          console.log("🌸 Lattice: Document synced");
        }
        break;
      }
      case SYNC_UPDATE: {
        // Received a regular update
        const update = decoding.readVarUint8Array(decoder);
        Y.applyUpdate(this.doc, update, this);
        break;
      }
    }
  }

  private handleAwarenessMessage(decoder: decoding.Decoder): void {
    const update = decoding.readVarUint8Array(decoder);
    this.awareness.applyUpdate(update, this);
  }

  private handleDocUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === this) {
      return;
    }

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    encoding.writeVarUint(encoder, SYNC_UPDATE);
    encoding.writeVarUint8Array(encoder, update);
    this.send(encoding.toUint8Array(encoder));
  };

  private handleAwarenessUpdate = (
    { added, updated, removed }: AwarenessChange,
    origin: unknown
  ): void => {
    if (origin === this) {
      return;
    }

    const changedClients = [...added, ...updated, ...removed];
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      this.awareness.encodeUpdate(changedClients)
    );
    this.send(encoding.toUint8Array(encoder));
  };

  private sendSyncStep1(): void {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    encoding.writeVarUint(encoder, SYNC_STEP_1);
    encoding.writeVarUint8Array(encoder, Y.encodeStateVector(this.doc));
    this.send(encoding.toUint8Array(encoder));
  }

  private sendAwarenessState(): void {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      this.awareness.encodeUpdate([this.doc.clientID])
    );
    this.send(encoding.toUint8Array(encoder));
  }

  private send(data: Uint8Array): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }
}

/**
 * Awareness protocol implementation for tracking user presence.
 * Tracks cursor positions, selections, and user info.
 */
export class Awareness extends EventEmitter {
  doc: Y.Doc;
  clientID: number;
  states: Map<number, AwarenessState> = new Map();
  private meta: Map<number, { clock: number; lastUpdated: number }> = new Map();
  private checkInterval: number | null = null;

  constructor(doc: Y.Doc) {
    super();
    this.doc = doc;
    this.clientID = doc.clientID;

    this.checkInterval = window.setInterval(() => {
      this.removeTimedOutClients();
    }, 15000);
  }

  destroy(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    super.destroy();
  }

  getLocalState(): AwarenessState | null {
    return this.states.get(this.clientID) || null;
  }

  setLocalState(state: AwarenessState | null): void {
    const clientID = this.clientID;
    const prevState = this.states.get(clientID);
    const currClock = (this.meta.get(clientID)?.clock || 0) + 1;

    if (state === null) {
      this.states.delete(clientID);
    } else {
      this.states.set(clientID, state);
    }

    this.meta.set(clientID, { clock: currClock, lastUpdated: Date.now() });

    const added: number[] = [];
    const updated: number[] = [];
    const removed: number[] = [];

    if (state === null) {
      removed.push(clientID);
    } else if (prevState === undefined) {
      added.push(clientID);
    } else {
      updated.push(clientID);
    }

    if (added.length > 0 || updated.length > 0 || removed.length > 0) {
      this.emit("update", [{ added, updated, removed }, "local"]);
    }
  }

  setLocalStateField<K extends keyof AwarenessState>(
    field: K,
    value: AwarenessState[K]
  ): void {
    const state = this.getLocalState() || {};
    this.setLocalState({ ...state, [field]: value });
  }

  getStates(): Map<number, AwarenessState> {
    return this.states;
  }

  applyUpdate(update: Uint8Array, origin: unknown): void {
    const decoder = decoding.createDecoder(update);
    const timestamp = Date.now();

    const added: number[] = [];
    const updated: number[] = [];
    const removed: number[] = [];

    const len = decoding.readVarUint(decoder);
    for (let i = 0; i < len; i++) {
      const clientID = decoding.readVarUint(decoder);
      const clock = decoding.readVarUint(decoder);
      const state = JSON.parse(decoding.readVarString(decoder));

      const prevMeta = this.meta.get(clientID);
      const prevState = this.states.get(clientID);

      if (
        prevMeta === undefined ||
        prevMeta.clock < clock ||
        (prevMeta.clock === clock &&
          state === null &&
          this.states.has(clientID))
      ) {
        this.meta.set(clientID, { clock, lastUpdated: timestamp });

        if (state === null) {
          if (this.states.has(clientID)) {
            this.states.delete(clientID);
            removed.push(clientID);
          }
        } else {
          this.states.set(clientID, state);
          if (prevState === undefined) {
            added.push(clientID);
          } else {
            updated.push(clientID);
          }
        }
      }
    }

    if (added.length > 0 || updated.length > 0 || removed.length > 0) {
      this.emit("update", [{ added, updated, removed }, origin]);
      this.emit("change", [{ added, updated, removed }, origin]);
    }
  }

  encodeUpdate(clients: number[]): Uint8Array {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, clients.length);

    for (const clientID of clients) {
      const state = this.states.get(clientID) || null;
      const clock = this.meta.get(clientID)?.clock || 0;

      encoding.writeVarUint(encoder, clientID);
      encoding.writeVarUint(encoder, clock);
      encoding.writeVarString(encoder, JSON.stringify(state));
    }

    return encoding.toUint8Array(encoder);
  }

  private removeTimedOutClients(): void {
    const now = Date.now();
    const timeout = 30000;

    const removed: number[] = [];

    this.meta.forEach((meta, clientID) => {
      if (
        clientID !== this.clientID &&
        now - meta.lastUpdated > timeout &&
        this.states.has(clientID)
      ) {
        this.states.delete(clientID);
        removed.push(clientID);
      }
    });

    if (removed.length > 0) {
      this.emit("update", [{ added: [], updated: [], removed }, "timeout"]);
      this.emit("change", [{ added: [], updated: [], removed }, "timeout"]);
    }
  }
}
