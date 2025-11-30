import { useState, useEffect } from "react";
import { Toolbar } from "./components/Toolbar";
import { Presence } from "./components/Presence";
import { CodeMirrorEditor } from "./components/Editor";
import { useLattice } from "./hooks/useLattice";
import styles from "./App.module.css";

function getInitialRoomId(): string {
  const params = new URLSearchParams(window.location.search);
  return (
    params.get("room") || "demo-" + Math.random().toString(36).substring(2, 8)
  );
}

const isMac =
  navigator.userAgent.includes("Mac") ||
  ("userAgentData" in navigator &&
    (navigator.userAgentData as { platform?: string })?.platform === "macOS");

function App() {
  const [roomId] = useState(getInitialRoomId);
  const [syncStatus, setSyncStatus] = useState<string>("waiting");

  const { status, synced, users, yText, awareness, userInfo } = useLattice({
    roomId,
  });

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

  return (
    <div className={styles.app}>
      <Toolbar roomId={roomId} connectionStatus={status} />

      <Presence users={users} />

      <main className={styles.main}>
        <div className={styles.editorPane}>
          {yText && awareness ? (
            <CodeMirrorEditor
              yText={yText}
              awareness={awareness}
              language="typescript"
              placeholder={`// Welcome to Lattice! 🌸
// 
// This is a real-time collaborative code editor
// powered by CRDTs (Conflict-free Replicated Data Types).
//
// Open this URL in another browser tab and start typing
// to see the magic happen!
//
// Features:
// - Real-time sync with no conflicts
// - Syntax highlighting for 15+ languages
// - Remote cursor awareness
// - Automatic reconnection`}
            />
          ) : (
            <div className={styles.loadingEditor}>
              <div className={styles.spinner} />
              <span>Initializing editor...</span>
            </div>
          )}
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
                ? "Document is synchronized. Changes are instantly shared."
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
            <h3 className={styles.panelTitle}>Keyboard Shortcuts</h3>
            <div className={styles.shortcuts}>
              <div className={styles.shortcut}>
                <div className={styles.keys}>
                  <kbd>{isMac ? "⌘" : "Ctrl"}</kbd>+<kbd>Z</kbd>
                </div>
                <span>Undo</span>
              </div>
              <div className={styles.shortcut}>
                <div className={styles.keys}>
                  <kbd>{isMac ? "⌘" : "Ctrl"}</kbd>+<kbd>⇧</kbd>+<kbd>Z</kbd>
                </div>
                <span>Redo</span>
              </div>
              <div className={styles.shortcut}>
                <div className={styles.keys}>
                  <kbd>{isMac ? "⌘" : "Ctrl"}</kbd>+<kbd>F</kbd>
                </div>
                <span>Find</span>
              </div>
              <div className={styles.shortcut}>
                <div className={styles.keys}>
                  <kbd>{isMac ? "⌘" : "Ctrl"}</kbd>+<kbd>/</kbd>
                </div>
                <span>Comment</span>
              </div>
              <div className={styles.shortcut}>
                <div className={styles.keys}>
                  <kbd>Tab</kbd>
                </div>
                <span>Indent</span>
              </div>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

export default App;
