import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import * as Y from "yjs";
import { LatticeProvider, ConnectionStatus } from "../crdt/YjsProvider";

interface User {
  id: string;
  clientID: number;
  name: string;
  color: string;
  isYou?: boolean;
  isTyping?: boolean;
}

interface UseLatticeOptions {
  roomId: string;
  userName?: string;
  userColor?: string;
}

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
  const typingTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const doc = new Y.Doc();
    const text = doc.getText("content");

    docRef.current = doc;
    textRef.current = text;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = import.meta.env.VITE_WS_HOST || window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    const provider = new LatticeProvider(wsUrl, roomId, doc);
    providerRef.current = provider;

    provider.awareness.setLocalState({
      user: userInfo,
      isTyping: false,
    });

    const handleStatus = (newStatus: ConnectionStatus) => {
      setStatus(newStatus);
    };
    provider.on("status", handleStatus);

    const handleSynced = (isSynced: boolean) => {
      setSynced(isSynced);
    };
    provider.on("synced", handleSynced);

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
            isTyping: state.isTyping || false,
          });
        }
      });

      userList.sort((a, b) => {
        if (a.isYou) return -1;
        if (b.isYou) return 1;
        return a.name.localeCompare(b.name);
      });

      setUsers(userList);
    };

    provider.awareness.on("change", handleAwarenessChange);
    handleAwarenessChange();

    const handleTextChange = () => {
      provider.awareness.setLocalStateField("isTyping", true);

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = window.setTimeout(() => {
        provider.awareness.setLocalStateField("isTyping", false);
      }, 2000);
    };

    text.observe(handleTextChange);

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      text.unobserve(handleTextChange);
      provider.off("status", handleStatus);
      provider.off("synced", handleSynced);
      provider.awareness.off("change", handleAwarenessChange);
      provider.destroy();
      doc.destroy();
    };
  }, [roomId, userInfo]);

  const getText = useCallback((): string => {
    return textRef.current?.toString() || "";
  }, []);

  const insertText = useCallback((index: number, text: string): void => {
    textRef.current?.insert(index, text);
  }, []);

  const deleteText = useCallback((index: number, length: number): void => {
    textRef.current?.delete(index, length);
  }, []);

  const setText = useCallback((text: string): void => {
    const ytext = textRef.current;
    if (ytext) {
      ytext.delete(0, ytext.length);
      ytext.insert(0, text);
    }
  }, []);

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

  const updateCursor = useCallback((anchor: number, head: number): void => {
    providerRef.current?.awareness.setLocalStateField("cursor", {
      anchor,
      head,
    });
  }, []);

  return {
    status,
    synced,
    users,
    isConnected: status === "connected",
    doc: docRef.current,
    yText: textRef.current,
    provider: providerRef.current,
    awareness: providerRef.current?.awareness || null,
    getText,
    setText,
    insertText,
    deleteText,
    onTextChange,
    updateCursor,
    userInfo,
  };
}
