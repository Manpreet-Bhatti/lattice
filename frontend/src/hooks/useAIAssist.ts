import { useState, useCallback, useRef } from "react";

export interface AICompletion {
  completion: string;
  stopReason?: string;
}

export interface AIExplanation {
  explanation: string;
}

export interface AIRefactor {
  refactored: string;
}

interface UseAIAssistOptions {
  provider?: "openai" | "anthropic" | "ollama";
  maxTokens?: number;
}

const API_BASE = import.meta.env.VITE_API_URL || "";

export function useAIAssist(options: UseAIAssistOptions = {}) {
  const { provider, maxTokens = 150 } = options;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCompletion, setLastCompletion] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoading(false);
  }, []);

  const complete = useCallback(
    async (
      code: string,
      cursorPos: number,
      language: string,
      hint?: string
    ): Promise<string | null> => {
      cancelRequest();

      try {
        setLoading(true);
        setError(null);

        abortControllerRef.current = new AbortController();

        const response = await fetch(`${API_BASE}/api/ai/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            cursor_pos: cursorPos,
            language,
            prompt: hint,
            max_tokens: maxTokens,
            provider,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to get completion");
        }

        const data: AICompletion = await response.json();
        setLastCompletion(data.completion);
        return data.completion;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return null;
        }
        const message =
          err instanceof Error ? err.message : "AI request failed";
        setError(message);
        return null;
      } finally {
        setLoading(false);
        abortControllerRef.current = null;
      }
    },
    [provider, maxTokens, cancelRequest]
  );

  const explain = useCallback(
    async (code: string, language: string): Promise<string | null> => {
      cancelRequest();

      try {
        setLoading(true);
        setError(null);

        abortControllerRef.current = new AbortController();

        const response = await fetch(`${API_BASE}/api/ai/explain`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, language }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to get explanation");
        }

        const data: AIExplanation = await response.json();
        return data.explanation;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return null;
        }
        const message =
          err instanceof Error ? err.message : "AI request failed";
        setError(message);
        return null;
      } finally {
        setLoading(false);
        abortControllerRef.current = null;
      }
    },
    [cancelRequest]
  );

  const refactor = useCallback(
    async (
      code: string,
      language: string,
      instruction: string
    ): Promise<string | null> => {
      cancelRequest();

      try {
        setLoading(true);
        setError(null);

        abortControllerRef.current = new AbortController();

        const response = await fetch(`${API_BASE}/api/ai/refactor`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, language, instruction }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to refactor");
        }

        const data: AIRefactor = await response.json();
        return data.refactored;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return null;
        }
        const message =
          err instanceof Error ? err.message : "AI request failed";
        setError(message);
        return null;
      } finally {
        setLoading(false);
        abortControllerRef.current = null;
      }
    },
    [cancelRequest]
  );

  return {
    loading,
    error,
    lastCompletion,
    complete,
    explain,
    refactor,
    cancelRequest,
  };
}
