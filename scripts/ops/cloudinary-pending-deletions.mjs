// Removes the Cloudinary copies of deleted accounts (Delete my account, 2026-10-28).
//
// The app has no Cloudinary keys (n8n uploads there), so when an account is deleted its Cloudinary
// files are listed on the closed account's shell (clients.onboarding_notes.cloudinary_pending).
// With CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET set (in .env.local, and in Vercel so new
// deletions do it at once), this deletes them and clears the list. The Privacy Policy promises
// content is gone within 30 days, so run it at least monthly until the keys are in Vercel.
//   node --env-file=.env.local scripts/ops/cloudinary-pending-deletions.mjs
import { createClient } from "@supabase/supabase-js";

const key = process.env.CLOUDINARY_API_KEY, secret = process.env.CLOUDINARY_API_SECRET;
if (!key || !secret) { console.error("Set CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET first."); process.exit(1); }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const auth = `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`;

const { data: shells, error } = await sb.from("clients").select("id, onboarding_notes").is("user_id", null).like("onboarding_notes", "%cloudinary_pending%");
if (error) { console.error(error.message); process.exit(1); }
for (const s of shells ?? []) {
  let notes;
  try { notes = JSON.parse(s.onboarding_notes); } catch { continue; }
  const files = Array.isArray(notes.cloudinary_pending) ? notes.cloudinary_pending : [];
  const left = [];
  for (let i = 0; i < files.length; i += 100) {
    const batch = files.slice(i, i + 100);
    const byKind = new Map();
    for (const f of batch) byKind.set(`${f.cloud}/${f.type}`, [...(byKind.get(`${f.cloud}/${f.type}`) ?? []), f]);
    for (const [k, list] of byKind) {
      const [cloud, type] = k.split("/");
      const q = list.map((f) => `public_ids[]=${encodeURIComponent(f.id)}`).join("&");
      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/resources/${type}/upload?${q}`, { method: "DELETE", headers: { Authorization: auth } });
      if (!res.ok) left.push(...list);
    }
  }
  const next = { ...notes };
  if (left.length) next.cloudinary_pending = left; else delete next.cloudinary_pending;
  await sb.from("clients").update({ onboarding_notes: JSON.stringify(next) }).eq("id", s.id);
  console.log(s.id, `removed ${files.length - left.length} of ${files.length}`);
}
console.log("done");
