import { supabaseAdmin } from "@/lib/supabase-server";
import { paymentProvider } from "@/lib/payments/server";
import { cancelPendingPost, pfmApiKey } from "@/lib/social-schedule";
import { disconnectAccount } from "@/lib/postforme";
import { isAdminEmail } from "@/lib/admin";
import { cloudinaryFiles, type CloudinaryFile } from "@/lib/account-delete";

/**
 * Delete my account (Kezie, 2026-10-28), as the Privacy Policy promises ("When you close your
 * account, we delete your account and content within 30 days… Payment and billing records: as
 * long as tax and accounting law requires"). Done at once, in this order:
 *   1. the plan is cancelled with Paystack (if that fails, nothing is deleted: no charges after);
 *   2. posts queued with PostForMe are cancelled and the social accounts disconnected;
 *   3. every file in storage under the account's, its brands' and the person's folders is removed,
 *      and its Cloudinary copies too (or listed on the closed account until Cloudinary keys exist);
 *   4. every row is deleted: brands, posts, websites, skills, chats, keys, credits, shares;
 *   5. the account row is kept only as an empty shell (no name, email, phone) because payments
 *      hang off it and are kept for tax; AI cost records keep their numbers but lose the person;
 *   6. their place in brands others shared with them goes, and finally the sign-in itself.
 * The owner's account can't be deleted from the app.
 */

const BUCKET = "assets";
type Counts = { brands: number; posts: number; websites: number; files: number; queuedCancelled: number; socialsDisconnected: number; subscriptionCancelled: boolean; cloudinaryDeleted: number; cloudinaryPending: number };
export type DeleteResult = { ok: true; counts: Counts } | { ok: false; status: number; error: string };

/** What deleting would remove, for the confirmation (counts only). */
export async function deletionPreview(userId: string) {
  const { data: client } = await supabaseAdmin.from("clients").select("id, plan_tier, billing_subscription_code, billing_status").eq("user_id", userId).maybeSingle();
  const { data: memberOf } = await supabaseAdmin.from("brand_members").select("brand_id, brand_profiles(brand_name, client_id)").eq("user_id", userId);
  const others = ((memberOf ?? []) as unknown as Array<{ brand_profiles: { brand_name: string; client_id: string } | null }>).filter((m) => m.brand_profiles && m.brand_profiles.client_id !== client?.id).map((m) => m.brand_profiles!.brand_name);
  if (!client) return { brands: [] as string[], shared: [] as string[], posts: 0, websites: 0, credits: 0, plan: null as string | null, subscription: false, memberOf: others };
  const { data: brands } = await supabaseAdmin.from("brand_profiles").select("id, brand_name").eq("client_id", client.id);
  const ids = (brands ?? []).map((b) => b.id as string);
  const [{ count: posts }, { count: websites }, { data: bal }, { data: members }] = await Promise.all([
    supabaseAdmin.from("content").select("id", { count: "exact", head: true }).eq("client_id", client.id),
    supabaseAdmin.from("site_pages").select("id", { count: "exact", head: true }).eq("client_id", client.id),
    supabaseAdmin.from("credit_balances").select("balance").eq("client_id", client.id).maybeSingle(),
    ids.length ? supabaseAdmin.from("brand_members").select("brand_id").in("brand_id", ids).neq("user_id", userId) : Promise.resolve({ data: [] as Array<{ brand_id: string }> }),
  ]);
  const sharedIds = new Set(((members ?? []) as Array<{ brand_id: string }>).map((m) => m.brand_id));
  return {
    brands: (brands ?? []).map((b) => b.brand_name as string),
    shared: (brands ?? []).filter((b) => sharedIds.has(b.id as string)).map((b) => b.brand_name as string),
    posts: posts ?? 0, websites: websites ?? 0, credits: Number(bal?.balance ?? 0),
    plan: client.plan_tier as string | null, subscription: !!client.billing_subscription_code && client.billing_status !== "cancelled",
    memberOf: others,
  };
}

/** Remove every file under a folder of the bucket (folders are only paths, so they go when empty). */
async function purgeFolder(prefix: string): Promise<number> {
  let removed = 0;
  const walk = async (path: string, depth: number): Promise<void> => {
    if (depth > 8) return;
    let offset = 0;
    for (let round = 0; round < 500; round++) {
      const { data, error } = await supabaseAdmin.storage.from(BUCKET).list(path, { limit: 100, offset });
      if (error || !data?.length) return;
      const files = data.filter((f) => f.id).map((f) => `${path}/${f.name}`);
      const dirs = data.filter((f) => !f.id).map((f) => `${path}/${f.name}`);
      if (files.length) {
        const { data: gone } = await supabaseAdmin.storage.from(BUCKET).remove(files);
        removed += gone?.length ?? 0;
        if (!gone?.length) offset += files.length; // couldn't remove: step past them, don't loop
      }
      for (const d of dirs) await walk(d, depth + 1);
      if (!files.length) { offset += dirs.length; if (data.length < 100) return; }
    }
  };
  await walk(prefix, 0);
  return removed;
}

/** Delete Cloudinary files with the Admin API when its keys are set (CLOUDINARY_API_KEY / _SECRET). */
async function deleteCloudinary(files: CloudinaryFile[]): Promise<{ deleted: number; pending: CloudinaryFile[] }> {
  const key = process.env.CLOUDINARY_API_KEY, secret = process.env.CLOUDINARY_API_SECRET;
  if (!files.length) return { deleted: 0, pending: [] };
  if (!key || !secret) return { deleted: 0, pending: files };
  let deleted = 0;
  const pending: CloudinaryFile[] = [];
  const groups = new Map<string, CloudinaryFile[]>();
  for (const f of files) groups.set(`${f.cloud}/${f.type}`, [...(groups.get(`${f.cloud}/${f.type}`) ?? []), f]);
  for (const [k, list] of groups) {
    const [cloud, type] = k.split("/");
    for (let i = 0; i < list.length; i += 100) {
      const batch = list.slice(i, i + 100);
      const q = batch.map((f) => `public_ids[]=${encodeURIComponent(f.id)}`).join("&");
      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/resources/${type}/upload?${q}`, { method: "DELETE", headers: { Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}` }, signal: AbortSignal.timeout(30_000) }).catch(() => null);
      if (res?.ok) deleted += batch.length; else pending.push(...batch);
    }
  }
  return { deleted, pending };
}

/** Delete the signed-in person's account and everything in it. */
export async function deleteAccount(userId: string, email: string): Promise<DeleteResult> {
  if (isAdminEmail(email)) return { ok: false, status: 403, error: "The BlinkSpot owner's account can't be deleted from the app." };
  const counts: Counts = { brands: 0, posts: 0, websites: 0, files: 0, queuedCancelled: 0, socialsDisconnected: 0, subscriptionCancelled: false, cloudinaryDeleted: 0, cloudinaryPending: 0 };
  const { data: client } = await supabaseAdmin.from("clients").select("id, billing_subscription_code, billing_status").eq("user_id", userId).maybeSingle();
  const C = client?.id as string | undefined;

  if (C) {
    // 1. No charges after the account is gone.
    if (client!.billing_subscription_code && client!.billing_status !== "cancelled") {
      const cancelled = await paymentProvider().cancelSubscription(client!.billing_subscription_code as string).catch(() => false);
      if (!cancelled) return { ok: false, status: 409, error: "We couldn't cancel your plan with Paystack, so nothing was deleted. Cancel it in Billing (Manage your plan), then try again, or email info@blinkspot.io." };
      counts.subscriptionCancelled = true;
      await supabaseAdmin.from("clients").update({ billing_status: "cancelled" }).eq("id", C);
    }

    const { data: brands } = await supabaseAdmin.from("brand_profiles").select("id, logo_url").eq("client_id", C);
    const brandIds = (brands ?? []).map((b) => b.id as string);
    counts.brands = brandIds.length;
    const { data: posts } = await supabaseAdmin.from("content").select("id, status, scheduled_at, postforme_tracking_id, image_urls, video_urls, reference_image_url").eq("client_id", C);
    counts.posts = posts?.length ?? 0;
    const { count: websites } = await supabaseAdmin.from("site_pages").select("id", { count: "exact", head: true }).eq("client_id", C);
    counts.websites = websites ?? 0;

    // 2. Nothing goes out after: queued posts cancelled, social accounts disconnected.
    const key = pfmApiKey();
    if (key) {
      for (const p of posts ?? []) {
        if (!p.postforme_tracking_id || p.status === "posted" || (p.scheduled_at && new Date(p.scheduled_at as string).getTime() < Date.now())) continue;
        const r = await cancelPendingPost(key, p.postforme_tracking_id as string).catch(() => ({ outcome: "error" as const }));
        if (r.outcome === "cancelled") counts.queuedCancelled++;
      }
    }
    const { data: socials } = await supabaseAdmin.from("social_accounts").select("postforme_account_id").eq("client_id", C);
    for (const s of socials ?? []) {
      const id = s.postforme_account_id as string | null;
      if (!id) continue;
      // The same social account connected in someone else's workspace stays connected there.
      const { count } = await supabaseAdmin.from("social_accounts").select("id", { count: "exact", head: true }).eq("postforme_account_id", id).neq("client_id", C);
      if (count) continue;
      if (await disconnectAccount(id).then(() => true, () => false)) counts.socialsDisconnected++;
    }

    // 3. Files: storage folders, then Cloudinary copies.
    const { data: productRows } = await supabaseAdmin.from("products").select("image_url").eq("client_id", C);
    const prefixes = [`images/${C}`, `videos/${C}`, `edits/${C}`, `uploads/${C}`, `brands/${userId}`, ...brandIds.flatMap((b) => [`videos/${b}`, `uploads/${b}`, `brands/${b}`])];
    for (const p of prefixes) counts.files += await purgeFolder(p);
    const cdn = cloudinaryFiles([...(posts ?? []).flatMap((p) => [p.image_urls, p.video_urls, p.reference_image_url]), ...(brands ?? []).map((b) => b.logo_url), ...(productRows ?? []).map((p) => p.image_url)]);
    const cd = await deleteCloudinary(cdn);
    counts.cloudinaryDeleted = cd.deleted;
    counts.cloudinaryPending = cd.pending.length;

    // 4. Rows. The account row stays (payments hang off it, cascading), so each table is cleared here.
    const fail = (t: string, e: { message?: string } | null) => (e ? `${t}: ${e.message ?? "failed"}` : null);
    const errs: Array<string | null> = [];
    const del = async (t: string, col: string, v: string | string[]) => {
      if (Array.isArray(v) && !v.length) return;
      const q = supabaseAdmin.from(t).delete();
      const { error } = await (Array.isArray(v) ? q.in(col, v) : q.eq(col, v));
      errs.push(fail(t, error));
    };
    const { data: convs } = await supabaseAdmin.from("conversations").select("id").eq("client_id", C);
    await del("conversation_messages", "conversation_id", (convs ?? []).map((c) => c.id as string));
    for (const t of ["mcp_activity", "api_keys", "conversations", "analytics", "content_schedule", "upscale_jobs", "generation_billing_ledger", "assets"]) await del(t, "client_id", C);
    await del("content", "client_id", C);
    for (const t of ["site_pages", "sites", "social_accounts", "products", "faqs", "assistant_skills", "workflow_runs", "credit_transactions", "credit_balances"]) await del(t, "client_id", C);
    await del("brand_members", "brand_id", brandIds);
    await del("brand_invites", "brand_id", brandIds);
    await del("brand_transfers", "brand_id", brandIds);
    await del("brand_transfers", "from_client", C);
    await del("brand_profiles", "client_id", C);
    const bad = errs.filter(Boolean);
    if (bad.length) { console.error("account delete: rows", C, bad); return { ok: false, status: 500, error: "Something went wrong part way. Your sign-in is still here, so try again; if it keeps failing, email info@blinkspot.io." }; }

    // 5. The empty shell that keeps the payment records for tax, with nothing about the person.
    const { error: shellErr } = await supabaseAdmin.from("clients").update({
      user_id: null, company_name: "Deleted account", contact_name: null, contact_email: null, contact_phone: null, website_url: null,
      social_links: null, approval_contact: null, google_drive_folder_id: null, google_drive_folder_url: null, industry: null,
      billing_status: "cancelled",
      onboarding_notes: JSON.stringify({ deleted_at: new Date().toISOString(), ...(cd.pending.length ? { cloudinary_pending: cd.pending.slice(0, 5000) } : {}) }),
    }).eq("id", C);
    if (shellErr) { console.error("account delete: shell", C, shellErr.message); return { ok: false, status: 500, error: "Something went wrong part way. Your sign-in is still here, so try again; if it keeps failing, email info@blinkspot.io." }; }
    await supabaseAdmin.from("ai_usage").update({ user_id: null }).eq("client_id", C);
  }

  // 6. Their place in other people's brands, invites to them, the free-credit record, the sign-in.
  await supabaseAdmin.from("brand_members").delete().eq("user_id", userId);
  await supabaseAdmin.from("brand_invites").delete().ilike("email", email.trim());
  await supabaseAdmin.from("signup_grants").delete().eq("user_id", userId);
  await supabaseAdmin.from("ai_usage").update({ user_id: null }).eq("user_id", userId);
  const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (authErr) { console.error("account delete: sign-in", userId, authErr.message); return { ok: false, status: 500, error: "Your content was deleted, but closing the sign-in failed. Email info@blinkspot.io and we'll finish it." }; }
  return { ok: true, counts };
}
