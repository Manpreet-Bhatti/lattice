import { useState, useCallback } from "react";
import styles from "./AIAssist.module.css";

interface AIAssistProps {
  loading: boolean;
  error: string | null;
  onComplete: (hint?: string) => void;
  onExplain: () => void;
  onRefactor: (instruction: string) => void;
  onCancel: () => void;
  lastResult?: string | null;
  resultType?: "completion" | "explanation" | "refactor" | null;
  onAcceptCompletion?: () => void;
  onDismiss?: () => void;
}

export function AIAssist({
  loading,
  error,
  onComplete,
  onExplain,
  onRefactor,
  onCancel,
  lastResult,
  resultType,
  onAcceptCompletion,
  onDismiss,
}: AIAssistProps) {
  const [activeTab, setActiveTab] = useState<
    "complete" | "explain" | "refactor"
  >("complete");
  const [completionHint, setCompletionHint] = useState("");
  const [refactorInstruction, setRefactorInstruction] = useState("");

  const handleComplete = useCallback(() => {
    onComplete(completionHint || undefined);
  }, [onComplete, completionHint]);

  const handleRefactor = useCallback(() => {
    onRefactor(refactorInstruction || "Improve this code");
  }, [onRefactor, refactorInstruction]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <svg
            className={styles.icon}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
          <h3 className={styles.title}>AI Assist</h3>
          {loading && <div className={styles.loadingDot} />}
        </div>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === "complete" ? styles.active : ""}`}
            onClick={() => setActiveTab("complete")}
          >
            Complete
          </button>
          <button
            className={`${styles.tab} ${activeTab === "explain" ? styles.active : ""}`}
            onClick={() => setActiveTab("explain")}
          >
            Explain
          </button>
          <button
            className={`${styles.tab} ${activeTab === "refactor" ? styles.active : ""}`}
            onClick={() => setActiveTab("refactor")}
          >
            Refactor
          </button>
        </div>
      </div>

      <div className={styles.content}>
        {error && (
          <div className={styles.error}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {activeTab === "complete" && (
          <div className={styles.tabContent}>
            <p className={styles.description}>
              Generate code at your cursor position. Add a hint for better
              results.
            </p>
            <input
              type="text"
              className={styles.input}
              placeholder="e.g., add error handling"
              value={completionHint}
              onChange={(e) => setCompletionHint(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleComplete()}
            />
            <button
              className={styles.primaryButton}
              onClick={handleComplete}
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className={styles.spinner} />
                  Generating...
                </>
              ) : (
                <>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  Complete Code
                </>
              )}
            </button>
            <div className={styles.shortcut}>
              <kbd>Ctrl</kbd>+<kbd>Space</kbd> to trigger in editor
            </div>
          </div>
        )}

        {activeTab === "explain" && (
          <div className={styles.tabContent}>
            <p className={styles.description}>
              Select code in the editor, then click explain to understand what
              it does.
            </p>
            <button
              className={styles.primaryButton}
              onClick={onExplain}
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className={styles.spinner} />
                  Analyzing...
                </>
              ) : (
                <>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  Explain Selection
                </>
              )}
            </button>
          </div>
        )}

        {activeTab === "refactor" && (
          <div className={styles.tabContent}>
            <p className={styles.description}>
              Select code and describe how you want it changed.
            </p>
            <input
              type="text"
              className={styles.input}
              placeholder="e.g., convert to async/await"
              value={refactorInstruction}
              onChange={(e) => setRefactorInstruction(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRefactor()}
            />
            <button
              className={styles.primaryButton}
              onClick={handleRefactor}
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className={styles.spinner} />
                  Refactoring...
                </>
              ) : (
                <>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Refactor Code
                </>
              )}
            </button>
          </div>
        )}

        {loading && (
          <button className={styles.cancelButton} onClick={onCancel}>
            Cancel
          </button>
        )}

        {lastResult && resultType && (
          <div className={styles.resultPanel}>
            <div className={styles.resultHeader}>
              <span className={styles.resultLabel}>
                {resultType === "completion" && "Suggested completion"}
                {resultType === "explanation" && "Explanation"}
                {resultType === "refactor" && "Refactored code"}
              </span>
              {onDismiss && (
                <button className={styles.dismissButton} onClick={onDismiss}>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
            <pre className={styles.resultContent}>{lastResult}</pre>
            {resultType === "completion" && onAcceptCompletion && (
              <button
                className={styles.acceptButton}
                onClick={onAcceptCompletion}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Insert at cursor
              </button>
            )}
            {resultType === "refactor" && onAcceptCompletion && (
              <button
                className={styles.acceptButton}
                onClick={onAcceptCompletion}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Replace selection
              </button>
            )}
          </div>
        )}
      </div>

      <div className={styles.footer}>
        <span className={styles.providerInfo}>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          Set OPENAI_API_KEY or ANTHROPIC_API_KEY
        </span>
      </div>
    </div>
  );
}
