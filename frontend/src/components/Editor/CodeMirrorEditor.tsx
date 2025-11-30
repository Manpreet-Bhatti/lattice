import { useEffect, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightSpecialChars,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  indentOnInput,
  bracketMatching,
  foldGutter,
  foldKeymap,
} from "@codemirror/language";
import {
  closeBrackets,
  closeBracketsKeymap,
  autocompletion,
  completionKeymap,
} from "@codemirror/autocomplete";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { yCollab } from "y-codemirror.next";
import * as Y from "yjs";
import { Awareness } from "../../crdt/YjsProvider";
import { latticeThemeExtension } from "./theme";
import { getLanguageSupport, LanguageId } from "./languages";
import styles from "./CodeMirrorEditor.module.css";

interface CodeMirrorEditorProps {
  yText: Y.Text;
  awareness: Awareness;
  language?: LanguageId;
  readOnly?: boolean;
  placeholder?: string;
}

export function CodeMirrorEditor({
  yText,
  awareness,
  language = "typescript",
  readOnly = false,
  placeholder = "// Start typing...",
}: CodeMirrorEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const [currentLanguage, setCurrentLanguage] = useState<LanguageId>(language);

  useEffect(() => {
    if (language !== currentLanguage) {
      setCurrentLanguage(language);
    }
  }, [language, currentLanguage]);

  useEffect(() => {
    if (!containerRef.current || !yText) return;

    if (editorRef.current) {
      editorRef.current.destroy();
    }

    const awarenessAdapter = {
      doc: awareness.doc,
      clientID: awareness.clientID,
      states: awareness.states,
      getLocalState: () => awareness.getLocalState(),
      setLocalState: (state: unknown) =>
        awareness.setLocalState(
          state as Parameters<typeof awareness.setLocalState>[0]
        ),
      setLocalStateField: (field: string, value: unknown) => {
        const state = awareness.getLocalState() || {};
        awareness.setLocalState({ ...state, [field]: value });
      },
      getStates: () => awareness.getStates(),
      on: (event: string, callback: (...args: unknown[]) => void) =>
        awareness.on(event, callback),
      off: (event: string, callback: (...args: unknown[]) => void) =>
        awareness.off(event, callback),
    };

    const extensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      foldGutter(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightSelectionMatches(),

      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        indentWithTab,
      ]),

      latticeThemeExtension,

      getLanguageSupport(currentLanguage),

      yCollab(yText, awarenessAdapter),

      EditorState.readOnly.of(readOnly),

      EditorView.updateListener.of(() => {}),
    ];

    if (placeholder && yText.length === 0) {
      extensions.push(
        EditorView.contentAttributes.of({ "data-placeholder": placeholder })
      );
    }

    const state = EditorState.create({
      doc: yText.toString(),
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    editorRef.current = view;

    view.focus();

    return () => {
      view.destroy();
      editorRef.current = null;
    };
  }, [yText, awareness, currentLanguage, readOnly, placeholder]);

  return (
    <div className={styles.editorWrapper}>
      <div ref={containerRef} className={styles.editorContainer} />
    </div>
  );
}
