import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

/** Wraps the current selection (or inserts at the cursor if nothing is selected). */
export function wrapSelection(view: EditorView, before: string, after: string = before): void {
  const changes = view.state.changeByRange((range) => ({
    changes: [
      { from: range.from, insert: before },
      { from: range.to, insert: after },
    ],
    range: EditorSelection.range(range.from + before.length, range.to + before.length),
  }));
  view.dispatch(view.state.update(changes));
  view.focus();
}

/** Inserts `before + placeholder + after` at the cursor, with `placeholder` selected so typing replaces it. */
export function insertTemplate(view: EditorView, before: string, placeholder: string, after: string): void {
  const pos = view.state.selection.main.from;
  view.dispatch({
    changes: { from: pos, insert: before + placeholder + after },
    selection: { anchor: pos + before.length, head: pos + before.length + placeholder.length },
  });
  view.focus();
}
