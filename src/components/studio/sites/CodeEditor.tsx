"use client";

import { useEffect, useRef } from "react";
import type { EditorView } from "@codemirror/view";
import type { Compartment } from "@codemirror/state";

/**
 * The website studio's code view (2026-10-16): CodeMirror 6 with HTML, CSS and JS highlighting,
 * line numbers, search (Cmd/Ctrl+F), undo and bracket matching. Loaded only when it is shown.
 * `value` from outside replaces the text (a version switch), or is appended while Claude is still
 * writing (`follow` keeps the newest line in view).
 */
export function CodeEditor({ value, onChange, readOnly = false, follow = false, label = "Code" }: {
  value: string; onChange?: (v: string) => void; readOnly?: boolean; follow?: boolean; label?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const lock = useRef<Compartment | null>(null);
  const changed = useRef(onChange);
  const outside = useRef(false);
  const first = useRef({ value, readOnly });

  useEffect(() => { changed.current = onChange; }, [onChange]);

  useEffect(() => {
    let alive = true;
    void Promise.all([import("codemirror"), import("@codemirror/lang-html"), import("@codemirror/theme-one-dark"), import("@codemirror/view"), import("@codemirror/state")])
      .then(([cm, lang, dark, v, st]) => {
        if (!alive || !host.current) return;
        lock.current = new st.Compartment();
        view.current = new cm.EditorView({
          parent: host.current,
          state: st.EditorState.create({
            doc: first.current.value,
            extensions: [
              cm.basicSetup, lang.html(), dark.oneDark, v.EditorView.lineWrapping,
              lock.current.of(st.EditorState.readOnly.of(first.current.readOnly)),
              v.EditorView.contentAttributes.of({ "aria-label": label }),
              v.EditorView.theme({ "&": { height: "100%", fontSize: "12.5px" }, ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", lineHeight: "1.55" } }),
              v.EditorView.updateListener.of((u) => { if (u.docChanged && !outside.current) changed.current?.(u.state.doc.toString()); }),
            ],
          }),
        });
      });
    return () => { alive = false; view.current?.destroy(); view.current = null; };
  }, [label]);

  useEffect(() => {
    const v = view.current;
    if (!v) { first.current.value = value; return; }
    const now = v.state.doc.toString();
    if (now === value) return;
    outside.current = true;
    // While Claude writes, the new text only grows: append it instead of replacing everything.
    if (value.startsWith(now)) v.dispatch({ changes: { from: now.length, insert: value.slice(now.length) }, ...(follow ? { selection: { anchor: value.length }, scrollIntoView: true } : {}) });
    else v.dispatch({ changes: { from: 0, to: now.length, insert: value } });
    outside.current = false;
  }, [value, follow]);

  useEffect(() => {
    const v = view.current, c = lock.current;
    if (!v || !c) { first.current.readOnly = readOnly; return; }
    void import("@codemirror/state").then((st) => v.dispatch({ effects: c.reconfigure(st.EditorState.readOnly.of(readOnly)) }));
  }, [readOnly]);

  return <div ref={host} className="h-full min-h-0 overflow-hidden rounded-xl" style={{ background: "#282c34" }} data-testid="code-editor" />;
}
