import { LanguageSupport } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { go } from "@codemirror/lang-go";
import { rust } from "@codemirror/lang-rust";
import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { markdown } from "@codemirror/lang-markdown";
import { sql } from "@codemirror/lang-sql";

export type LanguageId =
  | "javascript"
  | "typescript"
  | "jsx"
  | "tsx"
  | "python"
  | "go"
  | "rust"
  | "cpp"
  | "c"
  | "java"
  | "json"
  | "html"
  | "css"
  | "markdown"
  | "sql"
  | "plaintext";

interface LanguageConfig {
  name: string;
  extension: string[];
  load: () => LanguageSupport;
}

export const languages: Record<LanguageId, LanguageConfig> = {
  javascript: {
    name: "JavaScript",
    extension: [".js", ".mjs", ".cjs"],
    load: () => javascript(),
  },
  typescript: {
    name: "TypeScript",
    extension: [".ts", ".mts", ".cts"],
    load: () => javascript({ typescript: true }),
  },
  jsx: {
    name: "JSX",
    extension: [".jsx"],
    load: () => javascript({ jsx: true }),
  },
  tsx: {
    name: "TSX",
    extension: [".tsx"],
    load: () => javascript({ jsx: true, typescript: true }),
  },
  python: {
    name: "Python",
    extension: [".py", ".pyw"],
    load: () => python(),
  },
  go: {
    name: "Go",
    extension: [".go"],
    load: () => go(),
  },
  rust: {
    name: "Rust",
    extension: [".rs"],
    load: () => rust(),
  },
  cpp: {
    name: "C++",
    extension: [".cpp", ".hpp", ".cc", ".hh", ".cxx", ".hxx"],
    load: () => cpp(),
  },
  c: {
    name: "C",
    extension: [".c", ".h"],
    load: () => cpp(),
  },
  java: {
    name: "Java",
    extension: [".java"],
    load: () => java(),
  },
  json: {
    name: "JSON",
    extension: [".json"],
    load: () => json(),
  },
  html: {
    name: "HTML",
    extension: [".html", ".htm"],
    load: () => html(),
  },
  css: {
    name: "CSS",
    extension: [".css"],
    load: () => css(),
  },
  markdown: {
    name: "Markdown",
    extension: [".md", ".markdown"],
    load: () => markdown(),
  },
  sql: {
    name: "SQL",
    extension: [".sql"],
    load: () => sql(),
  },
  plaintext: {
    name: "Plain Text",
    extension: [".txt"],
    load: () => javascript(), // Fallback, will show no highlighting
  },
};

export function getLanguageFromFilename(filename: string): LanguageId {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();

  for (const [id, config] of Object.entries(languages)) {
    if (config.extension.includes(ext)) {
      return id as LanguageId;
    }
  }

  return "plaintext";
}

export function getLanguageSupport(languageId: LanguageId): LanguageSupport {
  return languages[languageId].load();
}
