/**
 * Edit with AI, rebuilt in the app (2026-10-15). Kezie: "look into the AI edit because we haven't
 * changed it... I should be able to also replace the image with all the images we have in our
 * library" and "cache it there" (the scan). The old n8n edit sent every object as "DO NOT TOUCH"
 * with the new values filled in, never sent a swap photo to the model (looked up by name, keyed by
 * id), forced 4:5, overwrote the original, and polled forever when Kie failed. Now: one scan per
 * picture, kept on the post; the edit prompt lists only what changed, with where each thing is;
 * swap photos go to the model as images 2+; the picture keeps its shape; the result is a new post.
 * Pure parts here; the calls are in lib/ai-edit-server.ts.
 */

export type EditKind = "words" | "thing" | "person" | "background";
/** Where an object is, 0-1000 of the picture's width and height: x, y, w, h. */
export type Box = [number, number, number, number];
export type ScanObject = { id: string; name: string; kind: EditKind; color: string; material: string; text?: string; font?: string; box?: Box };
export type Scan = { scene: string; light: string; objects: ScanObject[] };
export type StoredScan = { source: string; scan: Scan; at: string; from: "scan" | "edit"; size?: [number, number] };

/** Priced by the rule (200 credits per provider dollar): a Sonnet scan is $0.015-0.018. Once per picture. */
export const SCAN_CREDITS = 4;
export const EDIT_CREDITS = 18;
export const MAX_SWAPS = 4;
export const EDIT_ENGINES = ["nano-banana-2", "gpt-image-2-image-to-image"] as const;
export type EditEngine = (typeof EDIT_ENGINES)[number];

/** Boxes come back in pixels of the picture as sent (0-1000 units came out shifted; pixels were tight). */
export function scanSystem(width: number, height: number) {
  return `You break a marketing or social media image into the parts someone might want to change, for an image editor.
Reply with JSON only:
{"scene":"one sentence: what the picture is","light":"the lighting in a few words","objects":[{"id":"o1","name":"short plain name, e.g. Coffee cup, Headline, Brand logo","kind":"words | thing | person | background","color":"#RRGGBB, its main colour","material":"its material or finish in a few words","text":"for words: the exact characters","font":"for words: the lettering style","box":[left,top,width,height]}]}
Rules:
- 4 to 14 objects, the most important first. Include the background as one object.
- Every separate block of text is its own "words" object with the exact characters as written (line breaks become spaces). Never fix spelling.
- A logo is a "thing" named "... logo"; give its text too if it has letters.
- People are "person" objects (describe clothing in material, never identity).
- box is where it is in pixels of this ${width}x${height} picture: [left, top, width, height]. Measure carefully.
- Only what is really there. Plain words, no jargon.`;
}

/** The model's pixel boxes → 0-1000 of the picture, before validateScan. */
export function boxesToThousandths(raw: unknown, width: number, height: number): unknown {
  if (!raw || typeof raw !== "object" || !(width > 0) || !(height > 0)) return raw;
  const o = raw as { objects?: unknown };
  if (!Array.isArray(o.objects)) return raw;
  return {
    ...o,
    objects: o.objects.map((item) => {
      const b = (item as { box?: unknown })?.box;
      if (!Array.isArray(b) || b.length !== 4 || !b.every((n) => typeof n === "number")) return item;
      return { ...(item as object), box: [b[0] * 1000 / width, b[1] * 1000 / height, b[2] * 1000 / width, b[3] * 1000 / height] };
    }),
  };
}

const HEX = /^#[0-9a-f]{6}$/i;
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const KINDS: EditKind[] = ["words", "thing", "person", "background"];

function box(v: unknown): Box | undefined {
  if (!Array.isArray(v) || v.length !== 4 || !v.every((n) => typeof n === "number" && Number.isFinite(n))) return undefined;
  const [x, y] = v.slice(0, 2).map((n) => Math.round(Math.min(995, Math.max(0, n))));
  const w = Math.round(Math.min(1000 - x, Math.max(0, v[2]))), h = Math.round(Math.min(1000 - y, Math.max(0, v[3])));
  return w >= 5 && h >= 5 ? [x, y, w, h] : undefined;
}

/** The scan as the model or the database gave it, checked; null when it isn't usable. */
export function validateScan(raw: unknown): Scan | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const list = Array.isArray(o.objects) ? o.objects : [];
  const seen = new Set<string>();
  const objects: ScanObject[] = [];
  for (const item of list.slice(0, 20)) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const name = clean(r.name, 80);
    if (!name) continue;
    let id = clean(r.id, 32).replace(/[^A-Za-z0-9_-]/g, "") || `o${objects.length + 1}`;
    while (seen.has(id)) id = `${id}x`;
    seen.add(id);
    const text = clean(r.text ?? r.text_content, 300);
    const rawKind = clean(r.kind ?? r.type, 20).toLowerCase();
    const kind: EditKind = KINDS.includes(rawKind as EditKind) ? (rawKind as EditKind) : rawKind === "text" || (text && !/logo/i.test(name)) ? "words" : "thing";
    const color = clean(r.color, 20);
    objects.push({
      id, name, kind,
      color: HEX.test(color) ? color.toUpperCase() : "",
      material: clean(r.material, 120),
      ...(text ? { text } : {}),
      ...(clean(r.font ?? r.font_style, 80) ? { font: clean(r.font ?? r.font_style, 80) } : {}),
      ...(box(r.box) ? { box: box(r.box) } : {}),
    });
  }
  if (objects.length < 2) return null;
  return { scene: clean(o.scene ?? o.scene_description, 400), light: clean(o.light ?? o.lighting_and_weather, 200), objects };
}

/** A kept scan, only if it still describes the post's current picture. */
export function keptScan(stored: unknown, source: string): StoredScan | null {
  if (!stored || typeof stored !== "object") return null;
  const s = stored as Record<string, unknown>;
  const scan = validateScan(s.scan);
  if (!scan || s.source !== source) return null;
  const size = Array.isArray(s.size) && s.size.length === 2 && s.size.every((n) => typeof n === "number" && n > 0) ? (s.size as [number, number]) : undefined;
  return { source, scan, at: typeof s.at === "string" ? s.at : "", from: s.from === "edit" ? "edit" : "scan", ...(size ? { size } : {}) };
}

export type ObjectChange = { id: string; color?: string; material?: string; text?: string; font?: string; remove?: boolean; note?: string; swap?: boolean };
export type EditChanges = { objects: ObjectChange[]; light?: string; instruction?: string };

/** What really changed against the kept scan (the browser's idea of the original isn't trusted). */
export function normalizeChanges(scan: Scan, raw: unknown, swapIds: string[] = []): EditChanges {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const byId = new Map(scan.objects.map((o) => [o.id, o]));
  const out: ObjectChange[] = [];
  const list = Array.isArray(r.objects) ? r.objects : [];
  const ids = new Set<string>();
  for (const item of list.slice(0, 30)) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    const was = byId.get(String(c.id));
    if (!was || ids.has(was.id)) continue;
    ids.add(was.id);
    const ch: ObjectChange = { id: was.id };
    if (c.remove === true) ch.remove = true;
    else {
      const color = clean(c.color, 20).toUpperCase();
      if (HEX.test(color) && color !== was.color) ch.color = color;
      const material = clean(c.material, 120);
      if (material && material !== was.material) ch.material = material;
      const text = typeof c.text === "string" ? c.text.replace(/\s+/g, " ").trim().slice(0, 300) : undefined;
      if (text !== undefined && text !== (was.text ?? "") && (was.kind === "words" || was.text)) ch.text = text;
      const font = clean(c.font, 80);
      if (font && font !== (was.font ?? "")) ch.font = font;
      const note = clean(c.note, 240);
      if (note) ch.note = note;
    }
    if (swapIds.includes(was.id) && !ch.remove) ch.swap = true;
    if (Object.keys(ch).length > 1) out.push(ch);
  }
  for (const id of swapIds) {
    if (!ids.has(id) && byId.has(id)) out.push({ id, swap: true });
  }
  const light = clean(r.light, 200);
  const instruction = clean(r.instruction, 400);
  return { objects: out, ...(light && light !== scan.light ? { light } : {}), ...(instruction ? { instruction } : {}) };
}

export const changeCount = (c: EditChanges) => c.objects.length + (c.light ? 1 : 0) + (c.instruction ? 1 : 0);

/** Most of box a (70%+) lies inside box b. */
export function insideOf(a: Box, b: Box) {
  const w = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
  return w > 0 && h > 0 && (w * h) / (a[2] * a[3]) >= 0.7;
}

/** "upper left", "centre", "lower right"... from a box, so the model finds the right thing. */
export function whereIs(b?: Box) {
  if (!b) return "";
  const cx = b[0] + b[2] / 2, cy = b[1] + b[3] / 2;
  const v = cy < 333 ? "upper" : cy > 667 ? "lower" : "";
  const h = cx < 333 ? "left" : cx > 667 ? "right" : "";
  return v && h ? `${v} ${h}` : v ? `${v} middle` : h ? `${h} side` : "centre";
}

/**
 * The edit prompt: only the changes, each with where it is, then "keep everything else". Swaps are
 * images 2, 3... in the order of `swapOrder`.
 */
export function buildEditPrompt(scan: Scan, changes: EditChanges, swapOrder: string[]): string {
  const byId = new Map(scan.objects.map((o) => [o.id, o]));
  const lines: string[] = [];
  for (const c of changes.objects) {
    const o = byId.get(c.id);
    if (!o) continue;
    const at = whereIs(o.box);
    const it = `the ${o.name}${at ? ` (${at})` : ""}`;
    if (c.remove) { lines.push(`Remove ${it} completely and fill its space naturally with what is around it.`); continue; }
    const img = swapOrder.indexOf(c.id);
    if (c.swap && img >= 0) lines.push(o.kind === "person"
      ? `Replace ${it} with the person shown in image ${img + 2}, at the same place, size and pose, matching this picture's light and perspective.`
      : `Replace ${it} with the main product or object from image ${img + 2} only (not its background, props or surface): keep it exactly as in that photo (shape, colours, any writing on it), at the same place and size, matching this picture's light, shadows and perspective.`);
    if (c.text !== undefined) {
      lines.push(c.text
        ? `Change the words of ${it} from "${o.text ?? ""}" to exactly "${c.text}", spelled exactly as given, in the same lettering, size, colour and position${c.font ? `, but in ${c.font} lettering` : ""}.`
        : `Remove the words of ${it} and fill their space naturally.`);
    } else if (c.font) lines.push(`Change the lettering of ${it} to ${c.font}; keep the same words, spelled exactly: "${o.text ?? ""}".`);
    if (c.color) lines.push(`Make ${it} ${c.color}${o.color ? ` (it is ${o.color} now)` : ""}, keeping its shading and texture.`);
    if (c.material) {
      const was = o.material ? ` (it is ${o.material} now)` : "";
      lines.push(o.kind === "background"
        ? `Change ${it} to ${c.material}${was}, keeping everything in front of it exactly as it is.`
        : o.kind === "person"
          ? `Change the clothing of ${it} to ${c.material}${was}; same person, face, pose and expression.`
          : `Make ${it} ${c.material}${o.material ? ` instead of ${o.material}` : ""}.`);
    }
    if (c.note) lines.push(`For ${it}: ${c.note}`);
  }
  if (changes.light) lines.push(`Change the lighting to: ${changes.light}. Update shadows and highlights to match.`);
  if (changes.instruction) lines.push(changes.instruction);
  // Parts of a thing being swapped or removed (the sneaker's laces) go with it, so they aren't "kept".
  const going = changes.objects.filter((c) => c.swap || c.remove).map((c) => byId.get(c.id)?.box).filter((b): b is Box => !!b);
  const kept = scan.objects
    .filter((o) => !changes.objects.some((c) => c.id === o.id) && !(o.box && o.kind !== "background" && going.some((g) => insideOf(o.box!, g))))
    .map((o) => (o.kind === "words" && o.text ? `the words "${o.text}"` : `the ${o.name}`));
  return [
    "Edit image 1. Make only these changes:",
    ...lines.map((l) => `- ${l}`),
    `Keep everything else exactly as it is in image 1: the composition, framing, camera angle, lighting, people and faces${kept.length ? `, ${kept.slice(0, 10).join(", ")}` : ""}. Same size and shape as image 1. Add nothing that isn't asked for above.`,
  ].join("\n");
}

/** After an edit, the scan the new picture starts with (what we asked for), so editing again is free. */
export function scanAfterEdit(scan: Scan, changes: EditChanges): Scan {
  const byId = new Map(changes.objects.map((c) => [c.id, c]));
  return {
    scene: scan.scene,
    light: changes.light ?? scan.light,
    objects: scan.objects.filter((o) => !byId.get(o.id)?.remove).map((o) => {
      const c = byId.get(o.id);
      if (!c) return o;
      return { ...o, ...(c.color ? { color: c.color } : {}), ...(c.material ? { material: c.material } : {}), ...(c.text !== undefined ? { text: c.text } : {}), ...(c.font ? { font: c.font } : {}) };
    }),
  };
}

const ASPECTS = ["1:1", "4:5", "3:4", "9:16", "16:9", "3:2", "2:3"];
/** The supported shape nearest the picture's own. */
export function aspectFor(width: number, height: number) {
  const r = width > 0 && height > 0 ? width / height : 1;
  return ASPECTS.reduce((best, a) => { const [x, y] = a.split(":").map(Number); return Math.abs(Math.log(x / y / r)) < Math.abs(Math.log(best.r / r)) ? { a, r: x / y } : best; }, { a: "1:1", r: 1 }).a;
}
