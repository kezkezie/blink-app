/**
 * Instagram Posting Diagnostic
 *
 * Run: node scripts/diagnose-instagram.mjs
 *
 * Checks:
 *   1. PostForMe account list — confirms Instagram is connected with a valid account ID
 *   2. Supabase social_accounts — confirms the DB row has a postforme_account_id
 *   3. Test post to Instagram — fires a real (immediate) post with a safe test image
 *      to isolate whether the failure is auth, media, or tier
 *
 * Use a test/staging Instagram account if possible. The test post will go live.
 */

import { createClient } from "@supabase/supabase-js";

const POSTFORME_API_KEY = "pfm_live_Fvnv7viUB3MuSxBxYLFD94";
const SUPABASE_URL = "https://hzkufspjozkgmloznkvp.supabase.co";
const SUPABASE_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6a3Vmc3Bqb3prZ21sb3pua3ZwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc0ODcyNSwiZXhwIjoyMDg2MzI0NzI1fQ.LDz1EhuESwMxzWY9cdupa9Ym0ox6nt6FyASrmNIg5cQ";

// A safe public test image (Unsplash — publicly accessible, no copyright issues)
const TEST_IMAGE_URL =
  "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1080&h=1080&fit=crop";

const sep = () => console.log("\n" + "─".repeat(60));

// ─── STEP 1: List PostForMe Accounts ─────────────────────────────
async function listPostForMeAccounts() {
  sep();
  console.log("STEP 1: Fetching PostForMe connected accounts...");

  const res = await fetch("https://api.postforme.dev/v1/social-accounts", {
    headers: {
      Authorization: `Bearer ${POSTFORME_API_KEY}`,
      "Content-Type": "application/json",
    },
  });

  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    console.error("PostForMe returned non-JSON:", raw.substring(0, 200));
    return null;
  }

  if (!res.ok) {
    console.error("PostForMe error:", data);
    return null;
  }

  const accounts = data.data || data;
  console.log(`Found ${accounts.length} connected account(s):\n`);

  const instagramAccounts = [];
  for (const acc of accounts) {
    const isIg = acc.platform?.toLowerCase() === "instagram";
    const marker = isIg ? "*** INSTAGRAM ***" : "";
    console.log(
      `  [${acc.platform?.toUpperCase()}] id=${acc.id} | status=${acc.status} | name=${acc.name || "(no name)"} ${marker}`
    );
    if (isIg) instagramAccounts.push(acc);
  }

  if (instagramAccounts.length === 0) {
    console.log(
      "\n  ✗ No Instagram account found in PostForMe.\n  → Fix: Connect Instagram in Settings → Social Accounts.\n  → Requirement: Account must be Business/Creator + linked to a Facebook Page."
    );
  } else {
    for (const acc of instagramAccounts) {
      console.log(`\n  Instagram account details:`);
      console.log(`    id:       ${acc.id}`);
      console.log(`    status:   ${acc.status}`);
      console.log(`    platform: ${acc.platform}`);
      console.log(`    name:     ${acc.name || "(none)"}`);
      if (acc.status !== "connected") {
        console.log(
          `\n  ✗ Status is not "connected" — this account is ${acc.status}. Reconnect in Settings.`
        );
      } else {
        console.log(`\n  ✓ Instagram account is connected in PostForMe.`);
      }
    }
  }

  return instagramAccounts;
}

// ─── STEP 2: Check Supabase social_accounts rows ─────────────────
async function checkSupabaseAccounts() {
  sep();
  console.log("STEP 2: Checking Supabase social_accounts rows...");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from("social_accounts")
    .select("id, client_id, platform, postforme_account_id, is_active")
    .eq("platform", "instagram");

  if (error) {
    console.error("Supabase error:", error.message);
    return;
  }

  if (!data || data.length === 0) {
    console.log(
      "  ✗ No Instagram rows in social_accounts table.\n  → Fix: Go to Settings and press 'Sync Accounts' after reconnecting Instagram."
    );
    return;
  }

  console.log(`  Found ${data.length} Instagram row(s) in Supabase:\n`);
  for (const row of data) {
    const hasId = !!row.postforme_account_id;
    console.log(`  client_id: ${row.client_id}`);
    console.log(`  is_active: ${row.is_active}`);
    console.log(
      `  postforme_account_id: ${row.postforme_account_id || "(NULL)"} ${hasId ? "✓" : "✗ NULL — press Sync Accounts in Settings"}`
    );
    console.log("");
  }
}

// ─── STEP 3: Fire a test post ────────────────────────────────────
async function fireTestPost(instagramAccountId) {
  sep();
  console.log(`STEP 3: Firing test post to Instagram (account: ${instagramAccountId})...`);
  console.log(`        Image: ${TEST_IMAGE_URL}`);
  console.log(`        NOTE: This will post live to Instagram!\n`);

  const payload = {
    social_accounts: [instagramAccountId],
    caption: "🧪 BlinkSpot diagnostic test — ignore this post.",
    media: [{ url: TEST_IMAGE_URL }],
  };

  const res = await fetch("https://api.postforme.dev/v1/social-posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${POSTFORME_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    console.error("PostForMe returned non-JSON:", raw.substring(0, 300));
    return;
  }

  console.log(`  HTTP status: ${res.status}`);

  if (res.ok) {
    console.log("\n  ✓ POST SUCCEEDED! PostForMe accepted the post.");
    console.log(`  Post ID: ${data.id || "(no id)"}`);
    console.log("\n  → Instagram posting is working. The issue may be upstream (media URL, content type, or past auth state).");
  } else {
    console.log("\n  ✗ POST FAILED. Raw PostForMe error:");
    console.log(JSON.stringify(data, null, 4));

    // Diagnose based on error
    const msg = JSON.stringify(data).toLowerCase();
    if (msg.includes("invalid social accounts") || msg.includes("not owned")) {
      console.log("\n  DIAGNOSIS: The account ID is stale or revoked.");
      console.log("  FIX: Disconnect and reconnect Instagram in Settings, then Sync Accounts.");
    } else if (msg.includes("business") || msg.includes("creator") || msg.includes("professional")) {
      console.log("\n  DIAGNOSIS: Instagram account is not a Business/Creator account.");
      console.log("  FIX: Switch to Professional account in the Instagram app, then reconnect.");
    } else if (msg.includes("media") || msg.includes("url") || msg.includes("image")) {
      console.log("\n  DIAGNOSIS: Media URL issue. Instagram may not be able to fetch the image.");
      console.log("  FIX: Ensure Cloudinary URLs are publicly accessible (no auth required).");
    } else if (msg.includes("tier") || msg.includes("plan") || msg.includes("quickstart") || msg.includes("upgrade")) {
      console.log("\n  DIAGNOSIS: PostForMe Quickstart tier limitation.");
      console.log("  FIX: Upgrade PostForMe plan to enable Instagram posting.");
    } else if (res.status === 401 || res.status === 403) {
      console.log("\n  DIAGNOSIS: API key issue — check POSTFORME_API_KEY in .env.local.");
    }
  }
}

// ─── MAIN ────────────────────────────────────────────────────────
async function main() {
  console.log("BlinkSpot — Instagram Posting Diagnostic");
  console.log("==========================================");

  const igAccounts = await listPostForMeAccounts();
  await checkSupabaseAccounts();

  const connected = igAccounts?.filter((a) => a.status === "connected") ?? [];

  if (connected.length === 0) {
    sep();
    console.log(
      "STEP 3 SKIPPED — No connected Instagram account in PostForMe. Fix steps 1/2 first."
    );
  } else {
    const confirm = process.argv.includes("--post");
    if (!confirm) {
      sep();
      console.log("STEP 3 SKIPPED — Pass --post flag to fire the test post:");
      console.log("  node scripts/diagnose-instagram.mjs --post");
    } else {
      await fireTestPost(connected[0].id);
    }
  }

  sep();
  console.log("Done.");
}

main().catch(console.error);
