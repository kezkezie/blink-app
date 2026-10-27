"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, ChevronDown, Link2, Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ListSkeleton } from "@/components/studio/Skeletons";

/**
 * Ask skills (2026-10-12): the playbooks Ask BlinkSpot loads when a request needs one. Built-in
 * ones come with BlinkSpot; you can add your own (your agency's way of writing captions, a client's
 * rules, a motion-graphics recipe), pasted or imported from a SKILL.md link.
 */
type Skill = { id: string; slug?: string; name: string; description: string; body: string; source_url?: string | null; enabled?: boolean };

export default function SkillsPage() {
  const [builtin, setBuiltin] = useState<Skill[] | null>(null);
  const [mine, setMine] = useState<Skill[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [mode, setMode] = useState<"link" | "paste">("link");
  const [url, setUrl] = useState("");
  const [draft, setDraft] = useState({ name: "", description: "", body: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/skills", { cache: "no-store" });
    const d = await r.json().catch(() => ({}));
    if (r.ok) { setBuiltin(d.builtin ?? []); setMine(d.mine ?? []); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function add() {
    setBusy(true);
    try {
      const res = await fetch("/api/skills", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mode === "link" ? { url } : draft) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Couldn't add the skill.");
      setMine((m) => [...m, d.skill]);
      setUrl(""); setDraft({ name: "", description: "", body: "" });
      // What the safety check did (lib/assistant/skill-safety.ts), so nothing changes silently.
      const removed = Array.isArray(d.removed) && d.removed.length ? ` We removed ${d.removed.join(" and ")} from it.` : "";
      const links = Array.isArray(d.links) && d.links.length ? ` It mentions ${d.links.slice(0, 4).join(", ")}${d.links.length > 4 ? " and more" : ""}: Ask never opens links from skills.` : "";
      toast.success(`"${d.skill.name}" added. Ask uses it when a request fits.${removed}${links}`, { duration: removed || links ? 10000 : 4000 });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't add the skill."); }
    finally { setBusy(false); }
  }
  async function toggle(s: Skill) {
    const res = await fetch("/api/skills", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: s.id, enabled: !s.enabled }) });
    if (res.ok) setMine((m) => m.map((x) => (x.id === s.id ? { ...x, enabled: !s.enabled } : x)));
  }
  async function remove(s: Skill) {
    if (!confirm(`Delete "${s.name}"?`)) return;
    await fetch(`/api/skills?id=${encodeURIComponent(s.id)}`, { method: "DELETE" });
    setMine((m) => m.filter((x) => x.id !== s.id));
  }

  if (builtin === null) return <ListSkeleton />;
  const canAdd = mode === "link" ? /^https:\/\/\S+$/.test(url.trim()) : draft.name.trim() && draft.description.trim() && draft.body.trim().length > 20;

  const card = (s: Skill, own: boolean) => (
    <div key={s.id} className="s-card p-4 grid gap-2" style={{ opacity: own && s.enabled === false ? 0.6 : 1 }}>
      <div className="flex items-start gap-3">
        <span className="h-8 w-8 rounded-lg grid place-items-center shrink-0" style={{ background: "var(--s-raised)" }}><BookOpen className="h-4 w-4" style={{ color: own ? "var(--s-accent)" : "var(--s-ai)" }} /></span>
        <div className="flex-1 min-w-0">
          <b className="text-[14px]">{s.name}</b>
          <p className="text-[12.5px] mt-0.5" style={{ color: "var(--s-soft)" }}>{s.description}</p>
          {own && s.source_url && <p className="text-[11px] mt-1 truncate" style={{ color: "var(--s-mute)" }} title={s.source_url}>Imported from {(() => { try { return new URL(s.source_url).hostname; } catch { return s.source_url; } })()}</p>}
        </div>
        {own && (
          <div className="flex items-center gap-1.5 shrink-0">
            <label className="flex items-center gap-1.5 text-[12px] cursor-pointer" style={{ color: "var(--s-soft)" }}><input type="checkbox" checked={s.enabled !== false} onChange={() => toggle(s)} style={{ accentColor: "var(--s-accent)" }} /> On</label>
            <button className="s-btn ghost sm" onClick={() => remove(s)} aria-label={`Delete ${s.name}`}><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        )}
      </div>
      <button className="text-[12px] flex items-center gap-1 self-start" style={{ color: "var(--s-mute)" }} onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}>
        <ChevronDown className="h-3.5 w-3.5 transition-transform" style={{ transform: open === s.id ? "rotate(180deg)" : undefined }} /> {open === s.id ? "Hide" : "Read"} the instructions
      </button>
      {open === s.id && <pre className="text-[12px] leading-relaxed whitespace-pre-wrap rounded-lg p-3 max-h-80 overflow-auto" style={{ background: "var(--s-bg)", border: "1px solid var(--s-line)", color: "var(--s-soft)", fontFamily: "inherit" }}>{s.body}</pre>}
    </div>
  );

  return (
    <div className="grid gap-8 s-reading">
      <div>
        <h2 className="text-[20px] font-semibold">Ask skills</h2>
        <p className="text-[13px] mt-1 max-w-2xl" style={{ color: "var(--s-soft)" }}>Playbooks Ask BlinkSpot reads when your request needs one: how to design a poster, plan motion graphics, build a page that sells. Add your own and Ask follows them for this account.</p>
        <div className="flex items-start gap-2 rounded-xl p-3 mt-3 max-w-2xl text-[12.5px]" style={{ background: "var(--s-bg)", border: "1px solid var(--s-line)", color: "var(--s-soft)" }}>
          <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "var(--s-ok)" }} />
          <span>Skills are text only and private to your account: nothing in them ever runs. We check each one when you add it, remove hidden characters, and refuse code or instructions that try to take over Ask. When Ask reads one of your skills, it shows you buttons to press instead of making, writing or scheduling anything on its own, and it never opens links from a skill. Only add skills from people you trust.</span>
        </div>
      </div>

      <section className="s-card p-5 grid gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="text-[15px] font-semibold flex items-center gap-2"><Plus className="h-4 w-4" /> Add a skill</h3>
          <div className="flex-1" />
          <div className="s-seg" role="group" aria-label="How to add">
            <button aria-pressed={mode === "link"} onClick={() => setMode("link")}>From a link</button>
            <button aria-pressed={mode === "paste"} onClick={() => setMode("paste")}>Write or paste</button>
          </div>
        </div>
        {mode === "link" ? (
          <div className="grid gap-1.5">
            <div className="relative">
              <Link2 className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--s-mute)" }} />
              <input className="s-input" style={{ paddingLeft: 30 }} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/…/SKILL.md" aria-label="Skill link" data-no-mic />
            </div>
            <span className="text-[11.5px]" style={{ color: "var(--s-mute)" }}>A public SKILL.md (the format Claude skills use) or any plain-text or Markdown file. GitHub page links work too.</span>
          </div>
        ) : (
          <div className="grid gap-2">
            <input className="s-input" value={draft.name} maxLength={60} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Name, e.g. Our caption style" aria-label="Skill name" />
            <input className="s-input" value={draft.description} maxLength={300} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="When Ask should use it, e.g. Writing captions for any of our clients" aria-label="When to use it" />
            <textarea className="s-input" rows={7} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} placeholder="The instructions, as you'd brief a new designer or copywriter." aria-label="Instructions" />
          </div>
        )}
        <button className="s-btn primary self-start" disabled={!canAdd || busy} onClick={add}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add skill</button>
      </section>

      <section className="grid gap-3">
        <h3 className="s-section-h">Your skills</h3>
        {mine.length ? <div className="grid gap-3 md:grid-cols-2">{mine.map((s) => card(s, true))}</div>
          : <div className="s-empty"><h3>None yet</h3><p className="text-[13px]">Add your house style, a client&apos;s rules or a recipe you use a lot. Ask picks it up on the next message.</p></div>}
      </section>

      <section className="grid gap-3">
        <h3 className="s-section-h">Built into BlinkSpot</h3>
        <div className="grid gap-3 md:grid-cols-2">{builtin.map((s) => card(s, false))}</div>
      </section>
    </div>
  );
}
