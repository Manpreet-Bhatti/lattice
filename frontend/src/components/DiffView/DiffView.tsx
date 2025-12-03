import type { DiffResult, Version } from "../../hooks/useVersionHistory";
import styles from "./DiffView.module.css";

interface DiffViewProps {
  diffResult: DiffResult;
  onClose: () => void;
  onRestore?: (versionId: number) => Promise<unknown>;
}

function formatFullTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getStats(diffResult: DiffResult) {
  const added = diffResult.diff.filter((l) => l.type === "added").length;
  const removed = diffResult.diff.filter((l) => l.type === "removed").length;
  const unchanged = diffResult.diff.filter(
    (l) => l.type === "unchanged"
  ).length;
  return { added, removed, unchanged };
}

export function DiffView({ diffResult, onClose, onRestore }: DiffViewProps) {
  const stats = getStats(diffResult);
  const isCurrent = diffResult.to.id === 0;

  const handleRestore = async (version: Version) => {
    if (version.id === 0) return;
    if (onRestore) {
      await onRestore(version.id);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <h3>Comparing Versions</h3>
            <div className={styles.stats}>
              <span className={styles.statAdded}>+{stats.added} added</span>
              <span className={styles.statRemoved}>
                −{stats.removed} removed
              </span>
              <span className={styles.statUnchanged}>
                {stats.unchanged} unchanged
              </span>
            </div>
          </div>
          <button className={styles.closeButton} onClick={onClose}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={styles.versionHeaders}>
          <div className={styles.versionInfo}>
            <div className={styles.versionLabel}>From</div>
            <div className={styles.versionDetails}>
              <span className={styles.versionName}>{diffResult.from.name}</span>
              <span className={styles.versionMeta}>
                <code>{diffResult.from.content_hash}</code>
                <span>{formatFullTime(diffResult.from.created_at)}</span>
              </span>
            </div>
            {onRestore && diffResult.from.id !== 0 && (
              <button
                className={styles.restoreButton}
                onClick={() => handleRestore(diffResult.from)}
              >
                Restore this version
              </button>
            )}
          </div>
          <div className={styles.arrow}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </div>
          <div className={styles.versionInfo}>
            <div className={styles.versionLabel}>To</div>
            <div className={styles.versionDetails}>
              <span className={styles.versionName}>
                {diffResult.to.name}
                {isCurrent && (
                  <span className={styles.currentBadge}>Current</span>
                )}
              </span>
              <span className={styles.versionMeta}>
                {diffResult.to.content_hash && (
                  <code>{diffResult.to.content_hash}</code>
                )}
                <span>{formatFullTime(diffResult.to.created_at)}</span>
              </span>
            </div>
          </div>
        </div>

        <div className={styles.diffContainer}>
          <div className={styles.diffContent}>
            {diffResult.diff.length === 0 ? (
              <div className={styles.noDiff}>
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <p>No differences found</p>
                <span>The content is identical between these versions</span>
              </div>
            ) : (
              <table className={styles.diffTable}>
                <tbody>
                  {diffResult.diff.map((line, index) => (
                    <tr key={index} className={styles[line.type]}>
                      <td className={styles.lineNum}>
                        {line.type === "removed" || line.type === "unchanged"
                          ? line.old_line
                          : ""}
                      </td>
                      <td className={styles.lineNum}>
                        {line.type === "added" || line.type === "unchanged"
                          ? line.new_line
                          : ""}
                      </td>
                      <td className={styles.lineType}>
                        {line.type === "added"
                          ? "+"
                          : line.type === "removed"
                            ? "−"
                            : " "}
                      </td>
                      <td className={styles.lineContent}>
                        <pre>{line.content || " "}</pre>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.secondaryButton} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
