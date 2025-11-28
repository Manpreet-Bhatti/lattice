import { useState, useCallback } from "react";
import { Toolbar } from "./components/Toolbar";
import { Presence } from "./components/Presence";
import { Editor } from "./components/Editor";
import { useWebSocket } from "./hooks/useWebSocket";
import styles from "./App.module.css";

function getInitialRoomId(): string {
  const params = new URLSearchParams(window.location.search);
  return (
    params.get("room") || "demo-" + Math.random().toString(36).substring(2, 8)
  );
}

function generateUser() {
  const colors = [
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#3b82f6",
    "#8b5cf6",
    "#ec4899",
  ];
  const adjectives = ["Swift", "Clever", "Bright", "Quick", "Sharp", "Keen"];
  const animals = ["Fox", "Owl", "Hawk", "Wolf", "Bear", "Lion"];

  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  const color = colors[Math.floor(Math.random() * colors.length)];

  return {
    id: Math.random().toString(36).substring(2, 9),
    name: `${adjective}${animal}`,
    color,
    isYou: true,
  };
}

function App() {
  const [roomId] = useState(getInitialRoomId);
  const [currentUser] = useState(generateUser);
  const [messages, setMessages] = useState<string[]>([]);

  const handleMessage = useCallback((data: ArrayBuffer) => {
    const decoder = new TextDecoder();
    const message = decoder.decode(data);

    setMessages((prev) => [...prev.slice(-9), `Received: ${message}`]);

    console.log("🔷 Received message:", message);
  }, []);

  const { status, lastPong, send, ping, isConnected } = useWebSocket({
    roomId,
    onMessage: handleMessage,
    onStatusChange: (newStatus) => {
      console.log("🔷 Connection status:", newStatus);
    },
  });

  const handlePing = () => {
    if (ping()) {
      setMessages((prev) => [...prev.slice(-9), "Sent: ping"]);
    }
  };

  const handleEditorChange = (content: string) => {
    if (isConnected && content.length < 100) {
      const encoder = new TextEncoder();
      send(encoder.encode(content));
    }
  };

  const users = [
    currentUser,
    // Simulated other users for visual demo
    // { id: '2', name: 'CleverOwl', color: '#f59e0b' },
    // { id: '3', name: 'SwiftHawk', color: '#3b82f6' },
  ];

  return (
    <div className={styles.app}>
      <Toolbar
        roomId={roomId}
        connectionStatus={status}
        onPing={handlePing}
        lastPong={lastPong}
      />

      <Presence users={users} />

      <main className={styles.main}>
        <div className={styles.editorPane}>
          <Editor onChange={handleEditorChange} />
        </div>

        <aside className={styles.sidebar}>
          <div className={styles.panel}>
            <h3 className={styles.panelTitle}>WebSocket Messages</h3>
            <div className={styles.messageLog}>
              {messages.length === 0 ? (
                <p className={styles.emptyState}>
                  No messages yet. Click "Ping" to test the connection, or open
                  this page in another tab to test real-time sync.
                </p>
              ) : (
                messages.map((msg, i) => (
                  <div key={i} className={styles.message}>
                    {msg}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className={styles.panel}>
            <h3 className={styles.panelTitle}>Room Info</h3>
            <div className={styles.infoGrid}>
              <span className={styles.infoLabel}>Room ID</span>
              <code className={styles.infoValue}>{roomId}</code>

              <span className={styles.infoLabel}>Your Name</span>
              <span className={styles.infoValue}>{currentUser.name}</span>

              <span className={styles.infoLabel}>Status</span>
              <span className={styles.infoValue}>{status}</span>
            </div>

            <div className={styles.shareBox}>
              <p className={styles.shareLabel}>
                Share this link to collaborate:
              </p>
              <code className={styles.shareUrl}>
                {window.location.origin}?room={roomId}
              </code>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

export default App;
