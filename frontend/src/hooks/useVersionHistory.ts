import { useState, useEffect, useCallback, useRef } from "react";

export interface Version {
  id: number;
  room_id: string;
  name: string;
  description: string;
  content?: string;
  content_hash: string;
  created_by: string;
  created_at: string;
  is_auto: boolean;
}

export interface DiffLine {
  type: "added" | "removed" | "unchanged";
  content: string;
  old_line?: number;
  new_line?: number;
}

export interface DiffResult {
  from: Version;
  to: Version;
  diff: DiffLine[];
}

interface UseVersionHistoryOptions {
  roomId: string;
  getText: () => string;
  setText: (text: string) => void;
  userName?: string;
  autoSaveInterval?: number;
  autoSaveMinChanges?: number; // minimum character changes for auto-save
}

const API_BASE = import.meta.env.VITE_API_URL || "";

export function useVersionHistory(options: UseVersionHistoryOptions) {
  const {
    roomId,
    getText,
    setText,
    userName = "",
    autoSaveInterval = 60000,
    autoSaveMinChanges = 50,
  } = options;

  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<Version | null>(null);
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [showDiff, setShowDiff] = useState(false);

  const lastSavedContentRef = useRef<string>("");
  const lastSavedHashRef = useRef<string>("");

  const fetchVersions = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `${API_BASE}/api/versions?room_id=${encodeURIComponent(roomId)}&limit=50`
      );
      if (!response.ok) throw new Error("Failed to fetch versions");
      const data = await response.json();
      setVersions(data.versions || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch versions");
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  const createVersion = useCallback(
    async (name?: string, description?: string) => {
      const content = getText();
      if (!content.trim()) return null;

      try {
        setLoading(true);
        const response = await fetch(`${API_BASE}/api/versions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            room_id: roomId,
            name: name || `Snapshot ${new Date().toLocaleString()}`,
            description: description || "",
            content,
            created_by: userName,
            is_auto: false,
          }),
        });

        if (!response.ok) throw new Error("Failed to create version");
        const newVersion = await response.json();

        lastSavedContentRef.current = content;
        lastSavedHashRef.current = newVersion.content_hash;

        await fetchVersions();
        setError(null);
        return newVersion;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to create version"
        );
        return null;
      } finally {
        setLoading(false);
      }
    },
    [roomId, getText, userName, fetchVersions]
  );

  const autoSaveVersion = useCallback(async () => {
    const content = getText();
    if (!content.trim()) return;

    const lastContent = lastSavedContentRef.current;
    const changeCount = Math.abs(content.length - lastContent.length);

    if (changeCount < autoSaveMinChanges && content === lastContent) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_id: roomId,
          content,
          created_by: userName,
          is_auto: true,
        }),
      });

      if (response.ok) {
        const newVersion = await response.json();
        lastSavedContentRef.current = content;
        lastSavedHashRef.current = newVersion.content_hash;
        fetchVersions();
      }
    } catch {
      console.warn("Auto-save failed");
    }
  }, [roomId, getText, userName, autoSaveMinChanges, fetchVersions]);

  const getVersion = useCallback(
    async (versionId: number): Promise<Version | null> => {
      try {
        setLoading(true);
        const response = await fetch(`${API_BASE}/api/versions/${versionId}`);
        if (!response.ok) throw new Error("Failed to fetch version");
        const version = await response.json();
        setSelectedVersion(version);
        setError(null);
        return version;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch version"
        );
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const getDiff = useCallback(
    async (fromId: number, toId: number): Promise<DiffResult | null> => {
      try {
        setLoading(true);
        const response = await fetch(
          `${API_BASE}/api/versions/diff?from=${fromId}&to=${toId}`
        );
        if (!response.ok) throw new Error("Failed to fetch diff");
        const result = await response.json();
        setDiffResult(result);
        setShowDiff(true);
        setError(null);
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch diff");
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const compareWithCurrent = useCallback(
    async (versionId: number) => {
      const version = await getVersion(versionId);
      if (!version?.content) return;

      const currentContent = getText();

      const oldLines = version.content.split("\n");
      const newLines = currentContent.split("\n");

      const diff: DiffLine[] = [];
      const maxLen = Math.max(oldLines.length, newLines.length);

      for (let i = 0; i < maxLen; i++) {
        const oldLine = oldLines[i];
        const newLine = newLines[i];

        if (oldLine === newLine) {
          diff.push({
            type: "unchanged",
            content: oldLine || "",
            old_line: i + 1,
            new_line: i + 1,
          });
        } else if (oldLine === undefined) {
          diff.push({ type: "added", content: newLine, new_line: i + 1 });
        } else if (newLine === undefined) {
          diff.push({ type: "removed", content: oldLine, old_line: i + 1 });
        } else {
          diff.push({ type: "removed", content: oldLine, old_line: i + 1 });
          diff.push({ type: "added", content: newLine, new_line: i + 1 });
        }
      }

      setDiffResult({
        from: version,
        to: {
          id: 0,
          room_id: roomId,
          name: "Current",
          description: "Current document state",
          content: currentContent,
          content_hash: "",
          created_by: "",
          created_at: new Date().toISOString(),
          is_auto: false,
        },
        diff,
      });
      setShowDiff(true);
    },
    [getVersion, getText, roomId]
  );

  const restoreVersion = useCallback(
    async (versionId: number) => {
      try {
        setLoading(true);
        const response = await fetch(
          `${API_BASE}/api/versions/${versionId}/restore`,
          {
            method: "POST",
          }
        );

        if (!response.ok) throw new Error("Failed to restore version");
        const result = await response.json();

        if (result.content) {
          setText(result.content);
          lastSavedContentRef.current = result.content;
        }

        await fetchVersions();
        setShowDiff(false);
        setSelectedVersion(null);
        setError(null);
        return result;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to restore version"
        );
        return null;
      } finally {
        setLoading(false);
      }
    },
    [setText, fetchVersions]
  );

  const deleteVersion = useCallback(
    async (versionId: number) => {
      try {
        setLoading(true);
        const response = await fetch(`${API_BASE}/api/versions/${versionId}`, {
          method: "DELETE",
        });

        if (!response.ok) throw new Error("Failed to delete version");
        await fetchVersions();
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to delete version"
        );
      } finally {
        setLoading(false);
      }
    },
    [fetchVersions]
  );

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  useEffect(() => {
    const interval = setInterval(autoSaveVersion, autoSaveInterval);
    return () => clearInterval(interval);
  }, [autoSaveVersion, autoSaveInterval]);

  useEffect(() => {
    if (!lastSavedContentRef.current) {
      lastSavedContentRef.current = getText();
    }
  }, [getText]);

  return {
    versions,
    loading,
    error,
    selectedVersion,
    diffResult,
    showDiff,
    setShowDiff,
    fetchVersions,
    createVersion,
    getVersion,
    getDiff,
    compareWithCurrent,
    restoreVersion,
    deleteVersion,
    setSelectedVersion,
  };
}
