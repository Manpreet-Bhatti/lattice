import { useRef, useEffect } from "react";
import styles from "./Editor.module.css";

interface EditorProps {
  initialContent?: string;
  onChange?: (content: string) => void;
}

export function Editor({ initialContent = "", onChange }: EditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current && initialContent) {
      textareaRef.current.value = initialContent;
    }
  }, [initialContent]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange?.(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const value = textarea.value;

      textarea.value = value.substring(0, start) + "  " + value.substring(end);
      textarea.selectionStart = textarea.selectionEnd = start + 2;

      onChange?.(textarea.value);
    }
  };

  return (
    <div className={styles.editorContainer}>
      <div className={styles.lineNumbers}>
        {Array.from({ length: 50 }, (_, i) => (
          <span key={i + 1} className={styles.lineNumber}>
            {i + 1}
          </span>
        ))}
      </div>
      <textarea
        ref={textareaRef}
        className={styles.textarea}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        placeholder="// Start typing your code here...
// This is a placeholder editor.
// Phase 2 will integrate CodeMirror with Yjs for real-time collaboration."
      />
    </div>
  );
}
