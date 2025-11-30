import { EditorView } from "@codemirror/view";
import { Extension } from "@codemirror/state";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

// Lattice cherry blossom theme colors
const colors = {
  bg: "#0f0f12",
  bgElevated: "#161619",
  bgSurface: "#1e1e22",
  border: "#2a2a30",
  primary: "#ffb7c5",
  primaryLight: "#ffd1db",
  accent: "#ff8fa3",
  accentLight: "#ffccd5",
  text: "#e2e8f0",
  textMuted: "#94a3b8",
  textDim: "#64748b",
  success: "#10b981",
  warning: "#f59e0b",
  error: "#ef4444",
  // Syntax highlighting
  keyword: "#ff8fa3",
  string: "#86efac",
  number: "#fcd34d",
  comment: "#64748b",
  function: "#93c5fd",
  variable: "#e2e8f0",
  type: "#c4b5fd",
  operator: "#f0abfc",
  property: "#fda4af",
  punctuation: "#94a3b8",
};

// Editor theme (UI styling)
export const latticeTheme = EditorView.theme(
  {
    "&": {
      color: colors.text,
      backgroundColor: colors.bg,
      fontSize: "14px",
      height: "100%",
    },
    ".cm-content": {
      caretColor: colors.primary,
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      padding: "16px 0",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: colors.primary,
      borderLeftWidth: "2px",
    },
    "&.cm-focused .cm-cursor": {
      borderLeftColor: colors.primary,
    },
    ".cm-activeLine": {
      backgroundColor: `${colors.bgSurface}80`,
    },
    ".cm-activeLineGutter": {
      backgroundColor: `${colors.bgSurface}80`,
    },
    ".cm-selectionMatch": {
      backgroundColor: `${colors.primary}30`,
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
      {
        backgroundColor: `${colors.primary}40`,
      },
    ".cm-panels": {
      backgroundColor: colors.bgElevated,
      color: colors.text,
    },
    ".cm-panels.cm-panels-top": {
      borderBottom: `1px solid ${colors.border}`,
    },
    ".cm-panels.cm-panels-bottom": {
      borderTop: `1px solid ${colors.border}`,
    },
    ".cm-searchMatch": {
      backgroundColor: `${colors.warning}40`,
      outline: `1px solid ${colors.warning}`,
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: `${colors.primary}40`,
    },
    ".cm-gutters": {
      backgroundColor: colors.bgElevated,
      color: colors.textDim,
      border: "none",
      borderRight: `1px solid ${colors.border}`,
    },
    ".cm-lineNumbers .cm-gutterElement": {
      padding: "0 16px 0 8px",
      minWidth: "40px",
    },
    ".cm-foldPlaceholder": {
      backgroundColor: colors.bgSurface,
      border: `1px solid ${colors.border}`,
      color: colors.textMuted,
    },
    ".cm-tooltip": {
      backgroundColor: colors.bgElevated,
      border: `1px solid ${colors.border}`,
      borderRadius: "6px",
    },
    ".cm-tooltip .cm-tooltip-arrow:before": {
      borderTopColor: colors.border,
      borderBottomColor: colors.border,
    },
    ".cm-tooltip .cm-tooltip-arrow:after": {
      borderTopColor: colors.bgElevated,
      borderBottomColor: colors.bgElevated,
    },
    ".cm-tooltip-autocomplete": {
      "& > ul > li[aria-selected]": {
        backgroundColor: colors.bgSurface,
        color: colors.text,
      },
    },
    // Scrollbar styling
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    },
    "&::-webkit-scrollbar, .cm-scroller::-webkit-scrollbar": {
      width: "8px",
      height: "8px",
    },
    "&::-webkit-scrollbar-track, .cm-scroller::-webkit-scrollbar-track": {
      background: colors.bg,
    },
    "&::-webkit-scrollbar-thumb, .cm-scroller::-webkit-scrollbar-thumb": {
      background: colors.border,
      borderRadius: "4px",
    },
    "&::-webkit-scrollbar-thumb:hover, .cm-scroller::-webkit-scrollbar-thumb:hover":
      {
        background: colors.textDim,
      },
  },
  { dark: true }
);

// Syntax highlighting
export const latticeHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: colors.keyword, fontWeight: "500" },
  {
    tag: [t.controlKeyword, t.moduleKeyword, t.operatorKeyword],
    color: colors.keyword,
    fontWeight: "500",
  },
  {
    tag: [t.name, t.deleted, t.character, t.macroName],
    color: colors.variable,
  },
  { tag: [t.propertyName], color: colors.property },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName)],
    color: colors.function,
  },
  { tag: [t.labelName], color: colors.variable },
  {
    tag: [t.color, t.constant(t.name), t.standard(t.name)],
    color: colors.number,
  },
  { tag: [t.definition(t.name), t.separator], color: colors.variable },
  { tag: [t.typeName, t.className, t.namespace], color: colors.type },
  {
    tag: [t.number, t.changed, t.annotation, t.modifier, t.self],
    color: colors.number,
  },
  { tag: [t.operator, t.special(t.string)], color: colors.operator },
  { tag: [t.meta, t.comment], color: colors.comment, fontStyle: "italic" },
  { tag: [t.atom, t.bool], color: colors.number },
  { tag: [t.string, t.regexp], color: colors.string },
  { tag: t.link, color: colors.primary, textDecoration: "underline" },
  { tag: t.escape, color: colors.warning },
  { tag: t.invalid, color: colors.error },
  { tag: t.punctuation, color: colors.punctuation },
  {
    tag: [t.heading, t.strong],
    color: colors.text,
    fontWeight: "bold",
  },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: [t.url, t.link], color: colors.primary },
]);

// Combined theme extension
export const latticeThemeExtension: Extension = [
  latticeTheme,
  syntaxHighlighting(latticeHighlightStyle),
];
