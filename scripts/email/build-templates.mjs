// BlinkSpot's auth emails (Kezie, 2026-10-21: "make our email look like the BlinkSpot brand").
// Writes supabase/templates/*.html from one layout. Paste each into Supabase > Authentication >
// Emails (subjects below). Links go through /auth/confirm with the token hash, so they open on any
// device, and say www.blinkspot.io, never the project's Site URL.
//   node scripts/email/build-templates.mjs
import { mkdirSync, writeFileSync } from "node:fs";

const SITE = "https://www.blinkspot.io";
const C = { bg: "#0C0D0F", card: "#131417", line: "#25282D", text: "#ECEDEE", soft: "#A9AEB6", mute: "#6E737B", lime: "#C6F432", ink: "#0C0D0F" };
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const confirm = (type, next) => `${SITE}/auth/confirm?token_hash={{ .TokenHash }}&type=${type}&next=${next}`;

function layout({ preheader, title, body, button, link, note }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};">
<!-- Built by scripts/email/build-templates.mjs in blink-app. Edit there, not here. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg};">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};">
  <tr><td align="center" style="padding:40px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
      <tr><td style="padding:0 4px 24px 4px;">
        <a href="${SITE}" style="text-decoration:none;">
          <img src="${SITE}/brand/app-icon.png" width="40" height="40" alt="BlinkSpot" style="display:inline-block;vertical-align:middle;border:0;border-radius:10px;">
          <span style="display:inline-block;vertical-align:middle;margin-left:10px;font-family:${FONT};font-size:18px;font-weight:700;color:${C.text};letter-spacing:-0.2px;">BlinkSpot</span>
        </a>
      </td></tr>
      <tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:16px;padding:36px 32px;">
        <h1 style="margin:0 0 14px 0;font-family:${FONT};font-size:24px;line-height:1.25;font-weight:700;color:${C.text};letter-spacing:-0.3px;">${title}</h1>
        ${body.map((p) => `<p style="margin:0 0 16px 0;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.soft};">${p}</p>`).join("\n        ")}
        ${button ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 8px 0;">
          <tr><td style="border-radius:10px;background:${C.lime};">
            <a href="${button.href}" style="display:inline-block;padding:14px 26px;font-family:${FONT};font-size:15px;font-weight:700;color:${C.ink};text-decoration:none;border-radius:10px;">${button.label}</a>
          </td></tr>
        </table>
        <p style="margin:18px 0 0 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.mute};">Button not working? Paste this into your browser:<br><a href="${button.href}" style="color:${C.soft};word-break:break-all;">${button.href}</a></p>` : ""}
        ${link ?? ""}
      </td></tr>
      <tr><td style="padding:22px 4px 0 4px;">
        <p style="margin:0 0 6px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.mute};">${note}</p>
        <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.mute};">BlinkSpot · the AI social media studio for your brand · <a href="${SITE}" style="color:${C.soft};text-decoration:none;">blinkspot.io</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
`;
}

const codeBox = (label) => `<p style="margin:22px 0 8px 0;font-family:${FONT};font-size:13px;color:${C.soft};">${label}</p>
        <div style="display:inline-block;padding:14px 22px;border-radius:10px;background:${C.bg};border:1px solid ${C.line};font-family:'SF Mono', Menlo, Consolas, monospace;font-size:26px;font-weight:700;letter-spacing:6px;color:${C.lime};">{{ .Token }}</div>`;

const TEMPLATES = [
  {
    file: "invite.html", subject: "You're invited to BlinkSpot",
    html: layout({
      preheader: "Accept your invite and choose a password.",
      title: "You're invited to BlinkSpot",
      body: ["Someone set up a BlinkSpot account for you. BlinkSpot makes on-brand posts, videos, motion graphics and websites, then schedules them for you.", "Accept the invite and choose your password to get started."],
      button: { label: "Accept the invite", href: confirm("invite", "/reset-password?welcome=1") },
      note: "This invite is for {{ .Email }}. Weren't expecting it? You can ignore this email.",
    }),
  },
  {
    file: "confirm-signup.html", subject: "Confirm your email for BlinkSpot",
    html: layout({
      preheader: "One tap to confirm your email.",
      title: "Confirm your email",
      body: ["Welcome to BlinkSpot. Confirm this is your email and you're in."],
      button: { label: "Confirm my email", href: confirm("email", "/welcome") },
      note: "Didn't sign up for BlinkSpot with {{ .Email }}? You can ignore this email.",
    }),
  },
  {
    file: "magic-link.html", subject: "Your BlinkSpot sign-in link",
    html: layout({
      preheader: "Sign in to BlinkSpot with one tap.",
      title: "Sign in to BlinkSpot",
      body: ["Tap the button to sign in. The link works once and expires soon."],
      button: { label: "Sign in", href: confirm("magiclink", "/studio") },
      note: "Didn't ask to sign in? You can ignore this email; nobody can get in without this link.",
    }),
  },
  {
    file: "reset-password.html", subject: "Reset your BlinkSpot password",
    html: layout({
      preheader: "Choose a new password for BlinkSpot.",
      title: "Reset your password",
      body: ["Someone asked to reset the password for {{ .Email }}. Tap the button to choose a new one."],
      button: { label: "Choose a new password", href: confirm("recovery", "/reset-password") },
      note: "Didn't ask for this? Ignore this email and your password stays the same.",
    }),
  },
  {
    file: "email-change.html", subject: "Confirm your new email for BlinkSpot",
    html: layout({
      preheader: "Confirm the change to your BlinkSpot email.",
      title: "Confirm your new email",
      body: ["You asked to change your BlinkSpot email from {{ .Email }} to {{ .NewEmail }}. Confirm it to finish."],
      button: { label: "Confirm the change", href: confirm("email_change", "/studio/account/settings") },
      note: "Didn't ask for this? Ignore this email and nothing changes. Then change your password to be safe.",
    }),
  },
  {
    file: "reauthentication.html", subject: "Your BlinkSpot code",
    html: layout({
      preheader: "Your BlinkSpot confirmation code.",
      title: "Confirm it's you",
      body: ["Enter this code in BlinkSpot to carry on."],
      link: codeBox("Your code"),
      note: "Didn't ask for a code? You can ignore this email.",
    }),
  },
];

const dir = new URL("../../supabase/templates/", import.meta.url);
mkdirSync(dir, { recursive: true });
for (const t of TEMPLATES) writeFileSync(new URL(t.file, dir), t.html);
writeFileSync(new URL("SUBJECTS.md", dir), `# Auth email subjects\n\nPaste each template into Supabase > Authentication > Emails, with these subjects. Generated by \`scripts/email/build-templates.mjs\`.\n\n| Supabase email | File | Subject |\n|---|---|---|\n${TEMPLATES.map((t) => `| ${({ "invite.html": "Invite user", "confirm-signup.html": "Confirm signup", "magic-link.html": "Magic link", "reset-password.html": "Reset password", "email-change.html": "Change email address", "reauthentication.html": "Reauthentication" })[t.file]} | ${t.file} | ${t.subject} |`).join("\n")}\n`);
console.log(`wrote ${TEMPLATES.length} templates to supabase/templates/`);
