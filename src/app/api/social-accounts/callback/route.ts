import { NextResponse } from "next/server";

/**
 * Back from PostForMe's connect screen. Only sends people back to Settings.
 *
 * 2026-10-28 (launch security check): this used to save the connection itself, with the admin key,
 * from whatever client_id and account id were in the link, so anyone could open it with someone
 * else's client_id and swap which account their posts go to. Nothing linked to it any more (the
 * studio's Settings syncs connections from PostForMe for the signed-in person, by the brand tag on
 * the connection: /api/social-accounts/sync), but PostForMe's dashboard may still send people here,
 * so it stays as a plain redirect with the outcome.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const failed = params.get("error") || params.get("success") === "false";
  const to = new URL("/studio/account/settings", base);
  if (failed) to.searchParams.set("error", (params.get("error") || "connect_failed").slice(0, 120));
  else to.searchParams.set("success", "account_connected");
  to.hash = "socials";
  return NextResponse.redirect(to);
}
