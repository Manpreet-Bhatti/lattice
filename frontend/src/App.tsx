import { useState, useEffect, useRef } from "react";
import { Toolbar } from "./components/Toolbar";
import { Presence } from "./components/Presence";
import { Editor } from "./components/Editor";
import { useLattice } from "./hooks/useLattice";
import styles from "./App.module.css";

function getInitialRoomId(): string {
  const params = new URLSearchParams(window.location.search);
  return (
    params.get("room") || "demo-" + Math.random().toString(36).substring(2, 8)
  );
}

function App() {
  const [roomId] = useState(getInitialRoomId);
  const [content, setContent] = useState("");
  const [syncStatus, setSyncStatus] = useState<string>("waiting");
  const isLocalChangeRef = useRef(false);

  const {
    status,
    synced,
    users,
    getText,
    setText,
    onTextChange,
    updateCursor,
    userInfo,
  } = useLattice({ roomId });

  useEffect(() => {
    const unsubscribe = onTextChange((newText) => {
      if (!isLocalChangeRef.current) {
        setContent(newText);
      }
      isLocalChangeRef.current = false;
    });

    return unsubscribe;
  }, [onTextChange]);

  // Update sync status display
  useEffect(() => {
    if (status === "connecting") {
      setSyncStatus("connecting...");
    } else if (status === "connected" && !synced) {
      setSyncStatus("syncing...");
    } else if (status === "connected" && synced) {
      setSyncStatus("synced");
    } else {
      setSyncStatus("offline");
    }
  }, [status, synced]);

  // Initialize content when synced
  useEffect(() => {
    if (synced) {
      const text = getText();
      if (text) {
        setContent(text);
      }
    }
  }, [synced, getText]);

  const handleEditorChange = (newContent: string) => {
    isLocalChangeRef.current = true;
    setContent(newContent);
    setText(newContent);
  };

  const handleSelectionChange = (start: number, end: number) => {
    updateCursor(start, end);
  };

  return (
    <div className={styles.app}>
      <Toolbar roomId={roomId} connectionStatus={status} />

      <Presence users={users} />

      <main className={styles.main}>
        <div className={styles.editorPane}>
          <Editor
            content={content}
            onChange={handleEditorChange}
            onSelectionChange={handleSelectionChange}
          />
        </div>

        <aside className={styles.sidebar}>
          <div className={styles.panel}>
            <h3 className={styles.panelTitle}>Sync Status</h3>
            <div className={styles.statusDisplay}>
              <div
                className={`${styles.statusIndicator} ${styles[syncStatus.replace("...", "")]}`}
              />
              <span className={styles.statusText}>{syncStatus}</span>
            </div>
            <p className={styles.syncInfo}>
              {synced
                ? "Document is synchronized across all clients. Changes are instantly shared."
                : "Waiting for initial sync with server..."}
            </p>
          </div>

          <div className={styles.panel}>
            <h3 className={styles.panelTitle}>Room Info</h3>
            <div className={styles.infoGrid}>
              <span className={styles.infoLabel}>Room ID</span>
              <code className={styles.infoValue}>{roomId}</code>

              <span className={styles.infoLabel}>Your Name</span>
              <span className={styles.infoValue}>{userInfo.name}</span>

              <span className={styles.infoLabel}>Your Color</span>
              <span
                className={styles.infoValue}
                style={{ color: userInfo.color }}
              >
                ● {userInfo.color}
              </span>

              <span className={styles.infoLabel}>Users Online</span>
              <span className={styles.infoValue}>{users.length}</span>
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

          <div className={styles.panel}>
            <h3 className={styles.panelTitle}>How It Works</h3>
            <div className={styles.howItWorks}>
              <p>
                <strong>CRDT-powered sync:</strong> Changes are merged using
                Conflict-free Replicated Data Types (CRDTs).
              </p>
              <p>
                <strong>No conflicts:</strong> Even if two users edit the same
                line simultaneously, changes merge deterministically.
              </p>
              <p>
                <strong>Offline support:</strong> Changes queue locally and sync
                when reconnected.
              </p>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

export default App;
