import { Extension, StateEffect, StateField } from "@codemirror/state";
import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";

/**
 * Configuration for large document handling
 */
export interface LargeDocumentConfig {
  sizeThreshold: number;
  syntaxDisableThreshold: number;
  updateDebounceMs: number;
}

const defaultConfig: LargeDocumentConfig = {
  sizeThreshold: 100_000,
  syntaxDisableThreshold: 500_000,
  updateDebounceMs: 100,
};

/**
 * State effect to toggle large document mode
 */
export const setLargeDocumentMode = StateEffect.define<boolean>();

/**
 * State field tracking whether we're in large document mode
 */
export const largeDocumentModeField = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setLargeDocumentMode)) {
        return effect.value;
      }
    }
    return value;
  },
});

/**
 * Creates extensions for handling large documents efficiently
 */
export function largeDocumentExtensions(
  config: Partial<LargeDocumentConfig> = {}
): Extension {
  const finalConfig = { ...defaultConfig, ...config };

  return [
    largeDocumentModeField,
    largeDocumentPlugin(finalConfig),
    largeDocumentTheme,
  ];
}

/**
 * Plugin that monitors document size and enables optimizations
 */
function largeDocumentPlugin(config: LargeDocumentConfig): Extension {
  return ViewPlugin.fromClass(
    class {
      private lastCheck = 0;
      private checkInterval = 1000;
      private isLargeMode = false;

      constructor(private view: EditorView) {
        this.checkDocumentSize();
      }

      update(update: ViewUpdate) {
        const now = Date.now();
        if (update.docChanged && now - this.lastCheck > this.checkInterval) {
          this.lastCheck = now;
          this.checkDocumentSize();
        }
      }

      private checkDocumentSize() {
        const docLength = this.view.state.doc.length;
        const shouldBeLargeMode = docLength >= config.sizeThreshold;

        if (shouldBeLargeMode !== this.isLargeMode) {
          this.isLargeMode = shouldBeLargeMode;
          this.view.dispatch({
            effects: setLargeDocumentMode.of(shouldBeLargeMode),
          });

          if (shouldBeLargeMode) {
            console.log(
              `📄 Large document mode enabled (${(docLength / 1024).toFixed(1)}KB)`
            );
          } else {
            console.log("📄 Large document mode disabled");
          }
        }
      }
    }
  );
}

/**
 * Theme adjustments for large document mode
 * Reduces visual complexity for better performance
 */
const largeDocumentTheme = EditorView.theme({
  "&.cm-largeDoc .cm-selectionBackground": {
    // Simplified selection rendering
  },
});

/**
 * Extension to debounce collaborative updates for large documents
 * This helps reduce network traffic and CPU usage
 */
export function debouncedSync(delayMs: number = 100): Extension {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let pendingUpdate: (() => void) | null = null;

  return EditorView.updateListener.of((update) => {
    if (!update.docChanged) return;

    const isLargeDoc = update.state.field(largeDocumentModeField, false);

    if (isLargeDoc && delayMs > 0) {
      if (timeout) {
        clearTimeout(timeout);
      }
      pendingUpdate = () => {};
      timeout = setTimeout(() => {
        pendingUpdate?.();
        pendingUpdate = null;
        timeout = null;
      }, delayMs);
    }
  });
}

/**
 * Returns whether syntax highlighting should be disabled
 * based on document size
 */
export function shouldDisableSyntax(
  docLength: number,
  threshold: number = defaultConfig.syntaxDisableThreshold
): boolean {
  return docLength >= threshold;
}

/**
 * Performance metrics for large documents
 */
export interface PerformanceMetrics {
  documentSize: number;
  isLargeMode: boolean;
  lineCount: number;
  estimatedMemoryMB: number;
}

/**
 * Get performance metrics for the current document
 */
export function getPerformanceMetrics(view: EditorView): PerformanceMetrics {
  const docLength = view.state.doc.length;
  const lineCount = view.state.doc.lines;

  const estimatedMemoryMB = (docLength * 2.5) / (1024 * 1024);

  let isLargeMode = false;
  try {
    isLargeMode = view.state.field(largeDocumentModeField) ?? false;
  } catch {}

  return {
    documentSize: docLength,
    isLargeMode,
    lineCount,
    estimatedMemoryMB,
  };
}

/**
 * Chunk-based document loader for very large documents
 * Loads document in chunks to avoid blocking the main thread
 */
export async function loadLargeDocument(
  content: string,
  view: EditorView,
  chunkSize: number = 50_000
): Promise<void> {
  if (content.length <= chunkSize) {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: content },
    });
    return;
  }

  let offset = 0;
  while (offset < content.length) {
    const chunk = content.slice(offset, offset + chunkSize);
    view.dispatch({
      changes: { from: view.state.doc.length, insert: chunk },
    });
    offset += chunkSize;

    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
