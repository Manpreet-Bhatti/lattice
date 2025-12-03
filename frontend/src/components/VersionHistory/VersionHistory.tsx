import { useState } from "react";
import type { Version, DiffResult } from "../../hooks/useVersionHistory";
import styles from "./VersionHistory.module.css";

interface VersionHistoryProps {
  versions: Version[];
  loading: boolean;
  error: string | null;
  onCreateVersion: (name?: string, description?: string) => Promise<unknown>;
  onGetVersion: (versionId: number) => Promise<Version | null>;
  onCompareWithCurrent: (versionId: number) => void;
  onCompareVersions: (
    fromId: number,
    toId: number
  ) => Promise<DiffResult | null>;
  onRestoreVersion: (versionId: number) => Promise<unknown>;
  onDeleteVersion: (versionId: number) => Promise<void>;
  onRefresh: () => void;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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

export function VersionHistory({
  versions,
  loading,
  error,
  onCreateVersion,
  onCompareWithCurrent,
  onCompareVersions,
  onRestoreVersion,
  onDeleteVersion,
  onRefresh,
}: VersionHistoryProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newVersionName, setNewVersionName] = useState("");
  const [newVersionDesc, setNewVersionDesc] = useState("");
  const [selectedForCompare, setSelectedForCompare] = useState<number | null>(
    null
  );
  const [expandedVersion, setExpandedVersion] = useState<number | null>(null);

  const handleCreateVersion = async () => {
    await onCreateVersion(
      newVersionName || undefined,
      newVersionDesc || undefined
    );
    setShowCreateModal(false);
    setNewVersionName("");
    setNewVersionDesc("");
  };

  const handleCompareSelect = (versionId: number) => {
    if (selectedForCompare === null) {
      setSelectedForCompare(versionId);
    } else if (selectedForCompare === versionId) {
      setSelectedForCompare(null);
    } else {
      const [older, newer] =
        selectedForCompare < versionId
          ? [selectedForCompare, versionId]
          : [versionId, selectedForCompare];
      onCompareVersions(older, newer);
      setSelectedForCompare(null);
    }
  };

  const handleRestore = async (versionId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (
      window.confirm(
        "Are you sure you want to restore this version? This will replace the current content."
      )
    ) {
      await onRestoreVersion(versionId);
    }
  };

  const handleDelete = async (versionId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this version?")) {
      await onDeleteVersion(versionId);
    }
  };

  const manualVersions = versions.filter((v) => !v.is_auto);
  const autoVersions = versions.filter((v) => v.is_auto);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>Version History</h3>
        <div className={styles.headerActions}>
          <button
            className={styles.iconButton}
            onClick={onRefresh}
            disabled={loading}
            title="Refresh"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M23 4v6h-6M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
          <button
            className={styles.createButton}
            onClick={() => setShowCreateModal(true)}
            disabled={loading}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            Save Version
          </button>
        </div>
      </div>

      {error && (
        <div className={styles.error}>
          <span>{error}</span>
          <button onClick={onRefresh}>Retry</button>
        </div>
      )}

      {selectedForCompare !== null && (
        <div className={styles.compareHint}>
          Select another version to compare, or{" "}
          <button onClick={() => setSelectedForCompare(null)}>cancel</button>
        </div>
      )}

      <div className={styles.timeline}>
        {versions.length === 0 && !loading && (
          <div className={styles.empty}>
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <p>No versions saved yet</p>
            <span>Click "Save Version" to create a snapshot</span>
          </div>
        )}

        {manualVersions.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>Saved Versions</div>
            {manualVersions.map((version) => (
              <VersionItem
                key={version.id}
                version={version}
                isSelected={selectedForCompare === version.id}
                isExpanded={expandedVersion === version.id}
                onToggleExpand={() =>
                  setExpandedVersion(
                    expandedVersion === version.id ? null : version.id
                  )
                }
                onCompareSelect={() => handleCompareSelect(version.id)}
                onCompareWithCurrent={() => onCompareWithCurrent(version.id)}
                onRestore={(e) => handleRestore(version.id, e)}
                onDelete={(e) => handleDelete(version.id, e)}
              />
            ))}
          </div>
        )}

        {autoVersions.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>Auto-saved</div>
            {autoVersions.map((version) => (
              <VersionItem
                key={version.id}
                version={version}
                isSelected={selectedForCompare === version.id}
                isExpanded={expandedVersion === version.id}
                onToggleExpand={() =>
                  setExpandedVersion(
                    expandedVersion === version.id ? null : version.id
                  )
                }
                onCompareSelect={() => handleCompareSelect(version.id)}
                onCompareWithCurrent={() => onCompareWithCurrent(version.id)}
                onRestore={(e) => handleRestore(version.id, e)}
                onDelete={(e) => handleDelete(version.id, e)}
              />
            ))}
          </div>
        )}

        {loading && (
          <div className={styles.loading}>
            <div className={styles.spinner} />
          </div>
        )}
      </div>

      {showCreateModal && (
        <div
          className={styles.modalOverlay}
          onClick={() => setShowCreateModal(false)}
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h4>Save Version</h4>
            <div className={styles.formGroup}>
              <label>Name (optional)</label>
              <input
                type="text"
                value={newVersionName}
                onChange={(e) => setNewVersionName(e.target.value)}
                placeholder="e.g., Before refactoring"
                autoFocus
              />
            </div>
            <div className={styles.formGroup}>
              <label>Description (optional)</label>
              <textarea
                value={newVersionDesc}
                onChange={(e) => setNewVersionDesc(e.target.value)}
                placeholder="What changed in this version?"
                rows={3}
              />
            </div>
            <div className={styles.modalActions}>
              <button
                className={styles.cancelButton}
                onClick={() => setShowCreateModal(false)}
              >
                Cancel
              </button>
              <button
                className={styles.saveButton}
                onClick={handleCreateVersion}
                disabled={loading}
              >
                Save Version
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface VersionItemProps {
  version: Version;
  isSelected: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onCompareSelect: () => void;
  onCompareWithCurrent: () => void;
  onRestore: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}

function VersionItem({
  version,
  isSelected,
  isExpanded,
  onToggleExpand,
  onCompareSelect,
  onCompareWithCurrent,
  onRestore,
  onDelete,
}: VersionItemProps) {
  return (
    <div
      className={`${styles.versionItem} ${isSelected ? styles.selected : ""} ${version.is_auto ? styles.auto : ""}`}
      onClick={onToggleExpand}
    >
      <div className={styles.versionMarker}>
        <div className={styles.dot} />
        <div className={styles.line} />
      </div>
      <div className={styles.versionContent}>
        <div className={styles.versionHeader}>
          <span className={styles.versionName}>{version.name}</span>
          <span
            className={styles.versionTime}
            title={formatFullTime(version.created_at)}
          >
            {formatRelativeTime(version.created_at)}
          </span>
        </div>
        {version.description && (
          <p className={styles.versionDesc}>{version.description}</p>
        )}
        <div className={styles.versionMeta}>
          <code className={styles.hash}>{version.content_hash}</code>
          {version.created_by && (
            <span className={styles.author}>by {version.created_by}</span>
          )}
        </div>

        {isExpanded && (
          <div className={styles.versionActions}>
            <button
              className={styles.actionButton}
              onClick={(e) => {
                e.stopPropagation();
                onCompareWithCurrent();
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
              </svg>
              Compare with current
            </button>
            <button
              className={styles.actionButton}
              onClick={(e) => {
                e.stopPropagation();
                onCompareSelect();
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="12" y1="3" x2="12" y2="21" />
              </svg>
              {isSelected ? "Cancel compare" : "Compare with..."}
            </button>
            <button
              className={`${styles.actionButton} ${styles.restoreButton}`}
              onClick={onRestore}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              Restore
            </button>
            <button
              className={`${styles.actionButton} ${styles.deleteButton}`}
              onClick={onDelete}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
