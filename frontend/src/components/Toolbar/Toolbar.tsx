import styles from "./Toolbar.module.css";
import type { ConnectionStatus } from "../../crdt";

interface ToolbarProps {
  roomId: string;
  connectionStatus: ConnectionStatus;
}

export function Toolbar({ roomId, connectionStatus }: ToolbarProps) {
  const statusConfig = {
    connecting: { label: "Connecting...", color: "var(--lattice-warning)" },
    connected: { label: "Connected", color: "var(--lattice-success)" },
    disconnected: { label: "Disconnected", color: "var(--lattice-text-dim)" },
    error: { label: "Error", color: "var(--lattice-error)" },
  };

  const { label, color } = statusConfig[connectionStatus];

  return (
    <header className={styles.toolbar}>
      <div className={styles.brand}>
        <svg
          className={styles.logo}
          viewBox="0 0 100 100"
          width="28"
          height="28"
        >
          <defs>
            <linearGradient
              id="toolbarGrad"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" style={{ stopColor: "#4F46E5" }} />
              <stop offset="100%" style={{ stopColor: "#7C3AED" }} />
            </linearGradient>
          </defs>
          <g
            fill="none"
            stroke="url(#toolbarGrad)"
            strokeWidth="3"
            strokeLinecap="round"
          >
            <line x1="20" y1="25" x2="80" y2="25" />
            <line x1="20" y1="50" x2="80" y2="50" />
            <line x1="20" y1="75" x2="80" y2="75" />
            <line x1="25" y1="20" x2="25" y2="80" />
            <line x1="50" y1="20" x2="50" y2="80" />
            <line x1="75" y1="20" x2="75" y2="80" />
          </g>
          <g fill="url(#toolbarGrad)">
            <circle cx="25" cy="25" r="4" />
            <circle cx="50" cy="25" r="4" />
            <circle cx="75" cy="25" r="4" />
            <circle cx="25" cy="50" r="4" />
            <circle cx="50" cy="50" r="5" />
            <circle cx="75" cy="50" r="4" />
            <circle cx="25" cy="75" r="4" />
            <circle cx="50" cy="75" r="4" />
            <circle cx="75" cy="75" r="4" />
          </g>
        </svg>
        <h1 className={styles.title}>Lattice</h1>
      </div>

      <div className={styles.roomInfo}>
        <span className={styles.roomLabel}>Room:</span>
        <code className={styles.roomId}>{roomId}</code>
      </div>

      <div className={styles.actions}>
        <div className={styles.status}>
          <span
            className={styles.statusDot}
            style={{ backgroundColor: color }}
          />
          <span className={styles.statusLabel}>{label}</span>
        </div>
      </div>
    </header>
  );
}
