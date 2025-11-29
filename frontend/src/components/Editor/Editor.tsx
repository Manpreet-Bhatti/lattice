import { useRef, useEffect, useCallback } from "react";
import styles from "./Editor.module.css";

interface EditorProps {
  content: string;
  onChange?: (content: string) => void;
  onSelectionChange?: (start: number, end: number) => void;
}

export function Editor({ content, onChange, onSelectionChange }: EditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineCountRef = useRef<number>(1);

  const lineCount = content.split("\n").length;
  if (lineCount !== lineCountRef.current) {
    lineCountRef.current = lineCount;
  }

  // Sync content to textarea (for remote changes)
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea && textarea.value !== content) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.value = content;
      // Restore cursor position
      textarea.selectionStart = Math.min(start, content.length);
      textarea.selectionEnd = Math.min(end, content.length);
    }
  }, [content]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange?.(e.target.value);
    },
    [onChange]
  );

  const handleSelect = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea && onSelectionChange) {
      onSelectionChange(textarea.selectionStart, textarea.selectionEnd);
    }
  }, [onSelectionChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Handle Tab key for indentation
      if (e.key === "Tab") {
        e.preventDefault();
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const value = textarea.value;

        const newValue =
          value.substring(0, start) + "  " + value.substring(end);
        textarea.value = newValue;
        textarea.selectionStart = textarea.selectionEnd = start + 2;

        onChange?.(newValue);
      }
    },
    [onChange]
  );

  // Generate line numbers
  const lineNumbers = Array.from(
    { length: Math.max(lineCount, 20) },
    (_, i) => i + 1
  );

  return (
    <div className={styles.editorContainer}>
      <div className={styles.lineNumbers}>
        {lineNumbers.map((num) => (
          <span
            key={num}
            className={`${styles.lineNumber} ${num <= lineCount ? "" : styles.dimmed}`}
          >
            {num}
          </span>
        ))}
      </div>
      <textarea
        ref={textareaRef}
        className={styles.textarea}
        defaultValue={content}
        onChange={handleChange}
        onSelect={handleSelect}
        onKeyDown={handleKeyDown}
        onKeyUp={handleSelect}
        onClick={handleSelect}
        spellCheck={false}
        placeholder={`// Welcome to Lattice! 🔷
// 
// This is a real-time collaborative code editor.
// Open this URL in another browser tab or window
// and start typing to see the magic happen!
//
// Features:
// - CRDT-based sync (no conflicts ever)
// - Real-time cursor awareness
// - Automatic reconnection
// - Late joiner catch-up`}
      />
    </div>
  );
}
