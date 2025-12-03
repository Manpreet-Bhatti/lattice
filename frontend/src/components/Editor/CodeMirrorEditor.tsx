import {
  useEffect,
  useRef,
  useState,
  useImperativeHandle,
  forwardRef,
} from "react";
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
import { largeDocumentExtensions, shouldDisableSyntax } from "./largeDocument";
import styles from "./CodeMirrorEditor.module.css";

export interface EditorRef {
  getContent: () => string;
  getCursorPosition: () => number;
  getSelection: () => { from: number; to: number; text: string } | null;
  insertAtCursor: (text: string) => void;
  replaceSelection: (text: string) => void;
  focus: () => void;
}

interface CodeMirrorEditorProps {
  yText: Y.Text;
  awareness: Awareness;
  language?: LanguageId;
  readOnly?: boolean;
  placeholder?: string;
  onAIComplete?: () => void;
}

export const CodeMirrorEditor = forwardRef<EditorRef, CodeMirrorEditorProps>(
  function CodeMirrorEditor(
    {
      yText,
      awareness,
      language = "typescript",
      readOnly = false,
      placeholder = "// Start typing...",
      onAIComplete,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<EditorView | null>(null);
    const [currentLanguage, setCurrentLanguage] =
      useState<LanguageId>(language);

    // Expose editor methods via ref
    useImperativeHandle(ref, () => ({
      getContent: () => {
        return editorRef.current?.state.doc.toString() || "";
      },
      getCursorPosition: () => {
        const view = editorRef.current;
        if (!view) return 0;
        return view.state.selection.main.head;
      },
      getSelection: () => {
        const view = editorRef.current;
        if (!view) return null;
        const { from, to } = view.state.selection.main;
        if (from === to) return null;
        return {
          from,
          to,
          text: view.state.doc.sliceString(from, to),
        };
      },
      insertAtCursor: (text: string) => {
        const view = editorRef.current;
        if (!view) return;
        const pos = view.state.selection.main.head;
        view.dispatch({
          changes: { from: pos, insert: text },
          selection: { anchor: pos + text.length },
        });
      },
      replaceSelection: (text: string) => {
        const view = editorRef.current;
        if (!view) return;
        const { from, to } = view.state.selection.main;
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + text.length },
        });
      },
      focus: () => {
        editorRef.current?.focus();
      },
    }));

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

      const docLength = yText.length;
      const disableSyntax = shouldDisableSyntax(docLength);

      if (disableSyntax) {
        console.log(
          `📄 Document too large (${(docLength / 1024).toFixed(1)}KB), syntax highlighting disabled`
        );
      }

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
          {
            key: "Ctrl-Space",
            run: () => {
              if (onAIComplete) {
                onAIComplete();
                return true;
              }
              return false;
            },
          },
        ]),

        latticeThemeExtension,

        ...(disableSyntax ? [] : [getLanguageSupport(currentLanguage)]),

        largeDocumentExtensions({
          sizeThreshold: 100_000,
          syntaxDisableThreshold: 500_000,
          updateDebounceMs: 100,
        }),

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
);
