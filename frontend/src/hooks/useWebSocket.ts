import { useEffect, useRef, useState, useCallback } from "react";

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

interface UseWebSocketOptions {
  roomId?: string;
  onMessage?: (data: ArrayBuffer) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    roomId = "default",
    onMessage,
    onStatusChange,
    reconnectAttempts = 5,
    reconnectDelay = 1000,
  } = options;

  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [lastPong, setLastPong] = useState<Date | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const updateStatus = useCallback(
    (newStatus: ConnectionStatus) => {
      setStatus(newStatus);
      onStatusChange?.(newStatus);
    },
    [onStatusChange]
  );

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    updateStatus("connecting");

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = import.meta.env.VITE_WS_HOST || window.location.host;
    const wsUrl = `${protocol}//${host}/ws?room=${encodeURIComponent(roomId)}`;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      console.log("🔷 Lattice: Connected to room", roomId);
      updateStatus("connected");
      reconnectCountRef.current = 0;
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        onMessage?.(event.data);
      } else if (typeof event.data === "string") {
        if (event.data === "pong") {
          setLastPong(new Date());
        }
      }
    };

    ws.onclose = () => {
      console.log("🔷 Lattice: Disconnected from room", roomId);
      updateStatus("disconnected");
      wsRef.current = null;

      if (reconnectCountRef.current < reconnectAttempts) {
        reconnectCountRef.current++;
        const delay =
          reconnectDelay * Math.pow(2, reconnectCountRef.current - 1);
        console.log(
          `🔷 Lattice: Reconnecting in ${delay}ms (attempt ${reconnectCountRef.current}/${reconnectAttempts})`
        );

        reconnectTimeoutRef.current = window.setTimeout(() => {
          connect();
        }, delay);
      }
    };

    ws.onerror = (error) => {
      console.error("🔷 Lattice: WebSocket error", error);
      updateStatus("error");
    };

    wsRef.current = ws;
  }, [roomId, onMessage, updateStatus, reconnectAttempts, reconnectDelay]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    reconnectCountRef.current = reconnectAttempts;
    wsRef.current?.close();
    wsRef.current = null;
    updateStatus("disconnected");
  }, [reconnectAttempts, updateStatus]);

  const send = useCallback((data: ArrayBuffer | Uint8Array | string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
      return true;
    }

    console.warn("🔷 Lattice: Cannot send - not connected");
    return false;
  }, []);

  const ping = useCallback(() => {
    return send("ping");
  }, [send]);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    status,
    lastPong,
    send,
    ping,
    connect,
    disconnect,
    isConnected: status === "connected",
  };
}
