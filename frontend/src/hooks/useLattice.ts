import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import * as Y from "yjs";
import { LatticeProvider, ConnectionStatus } from "../crdt/YjsProvider";

interface User {
  id: string;
  clientID: number;
  name: string;
  color: string;
  isYou?: boolean;
}

interface UseLatticeOptions {
  roomId: string;
  userName?: string;
  userColor?: string;
}

// Generate random user data
function generateUserInfo() {
  const colors = [
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#3b82f6",
    "#8b5cf6",
    "#ec4899",
    "#06b6d4",
    "#84cc16",
  ];
  const adjectives = [
    "Swift",
    "Clever",
    "Bright",
    "Quick",
    "Sharp",
    "Keen",
    "Bold",
    "Calm",
  ];
  const animals = [
    "Fox",
    "Owl",
    "Hawk",
    "Wolf",
    "Bear",
    "Lion",
    "Eagle",
    "Deer",
  ];

  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  const color = colors[Math.floor(Math.random() * colors.length)];

  return {
    name: `${adjective}${animal}`,
    color,
  };
}

export function useLattice(options: UseLatticeOptions) {
  const { roomId } = options;

  // Generate stable user info
  const userInfo = useMemo(() => {
    return {
      name: options.userName || generateUserInfo().name,
      color: options.userColor || generateUserInfo().color,
    };
  }, [options.userName, options.userColor]);

  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [synced, setSynced] = useState(false);
  const [users, setUsers] = useState<User[]>([]);

  const docRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<LatticeProvider | null>(null);
  const textRef = useRef<Y.Text | null>(null);

  // Initialize Yjs document and provider
  useEffect(() => {
    const doc = new Y.Doc();
    const text = doc.getText("content");

    docRef.current = doc;
    textRef.current = text;

    // Create WebSocket URL
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = import.meta.env.VITE_WS_HOST || window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    // Create provider
    const provider = new LatticeProvider(wsUrl, roomId, doc);
    providerRef.current = provider;

    // Set local awareness state
    provider.awareness.setLocalState({
      user: userInfo,
    });

    // Listen for status changes
    const handleStatus = (newStatus: ConnectionStatus) => {
      setStatus(newStatus);
    };
    provider.on("status", handleStatus);

    // Listen for sync status
    const handleSynced = (isSynced: boolean) => {
      setSynced(isSynced);
    };
    provider.on("synced", handleSynced);

    // Listen for awareness changes
    const handleAwarenessChange = () => {
      const states = provider.awareness.getStates();
      const userList: User[] = [];

      states.forEach((state, clientID) => {
        if (state.user) {
          userList.push({
            id: String(clientID),
            clientID,
            name: state.user.name,
            color: state.user.color,
            isYou: clientID === doc.clientID,
          });
        }
      });

      // Sort so current user is first
      userList.sort((a, b) => {
        if (a.isYou) return -1;
        if (b.isYou) return 1;
        return a.name.localeCompare(b.name);
      });

      setUsers(userList);
    };

    provider.awareness.on("change", handleAwarenessChange);

    handleAwarenessChange();

    return () => {
      provider.off("status", handleStatus);
      provider.off("synced", handleSynced);
      provider.awareness.off("change", handleAwarenessChange);
      provider.destroy();
      doc.destroy();
    };
  }, [roomId, userInfo]);

  // Get the current text content
  const getText = useCallback((): string => {
    return textRef.current?.toString() || "";
  }, []);

  // Insert text at a position
  const insertText = useCallback((index: number, text: string): void => {
    textRef.current?.insert(index, text);
  }, []);

  // Delete text at a position
  const deleteText = useCallback((index: number, length: number): void => {
    textRef.current?.delete(index, length);
  }, []);

  // Replace all text
  const setText = useCallback((text: string): void => {
    const ytext = textRef.current;
    if (ytext) {
      ytext.delete(0, ytext.length);
      ytext.insert(0, text);
    }
  }, []);

  // Subscribe to text changes
  const onTextChange = useCallback(
    (callback: (text: string) => void): (() => void) => {
      const ytext = textRef.current;
      if (!ytext) return () => {};

      const handler = () => {
        callback(ytext.toString());
      };

      ytext.observe(handler);
      return () => ytext.unobserve(handler);
    },
    []
  );

  // Update cursor position in awareness
  const updateCursor = useCallback((anchor: number, head: number): void => {
    providerRef.current?.awareness.setLocalStateField("cursor", {
      anchor,
      head,
    });
  }, []);

  return {
    // State
    status,
    synced,
    users,
    isConnected: status === "connected",

    // Document
    doc: docRef.current,
    text: textRef.current,
    provider: providerRef.current,

    // Text operations
    getText,
    setText,
    insertText,
    deleteText,
    onTextChange,

    // Awareness
    updateCursor,
    userInfo,
  };
}
