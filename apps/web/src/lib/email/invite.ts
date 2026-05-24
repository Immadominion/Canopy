/**
 * Transactional email via Resend.
 *
 * All emails are sent from the configured RESEND_FROM_EMAIL address.
 * Errors are logged but never surfaced to callers — the invite row is the
 * source of truth; a failed email can be retried by re-inviting.
 */

import { Resend } from "resend";

import { env } from "@/lib/env";

let _resend: Resend | null = null;

function getResend(): Resend {
    if (!_resend) {
        _resend = new Resend(env.RESEND_API_KEY);
    }
    return _resend;
}

export interface InviteEmailParams {
    to: string;
    inviterName: string;
    orgName: string;
    role: string;
    acceptUrl: string;
}

/**
 * Send a team invitation email.
 * Returns true if the email was dispatched, false on failure.
 */
export async function sendInviteEmail(params: InviteEmailParams): Promise<boolean> {
    try {
        const { error } = await getResend().emails.send({
            from: env.RESEND_FROM_EMAIL,
            to: params.to,
            subject: `You've been invited to join ${params.orgName} on Canopy`,
            html: buildInviteHtml(params),
        });

        if (error) {
            console.error("[email] invite send failed", { to: params.to, error });
            return false;
        }
        return true;
    } catch (err) {
        console.error("[email] invite send threw", { to: params.to, err });
        return false;
    }
}

function buildInviteHtml(params: InviteEmailParams): string {
    const roleLabel = params.role.charAt(0).toUpperCase() + params.role.slice(1);
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Canopy Invitation</title>
  <style>
    body { margin: 0; padding: 0; background: #000; color: #e0e0e0; font-family: 'Helvetica Neue', Arial, sans-serif; }
    .container { max-width: 520px; margin: 40px auto; padding: 32px; border: 1px solid #333; }
    .logo { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: #888; margin-bottom: 32px; }
    h1 { font-size: 20px; font-weight: 600; color: #fff; margin: 0 0 12px; }
    p { font-size: 14px; line-height: 1.6; color: #aaa; margin: 0 0 20px; }
    .role-badge { display: inline-block; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: #888; border: 1px solid #333; padding: 3px 8px; margin-bottom: 24px; }
    .cta { display: inline-block; background: #D71921; color: #fff; text-decoration: none; padding: 12px 24px; font-size: 13px; letter-spacing: 0.05em; text-transform: uppercase; }
    .footer { margin-top: 40px; font-size: 11px; color: #555; letter-spacing: 0.04em; }
    .footer a { color: #555; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">Canopy</div>
    <h1>You've been invited</h1>
    <p>
      <strong style="color:#fff">${escapeHtml(params.inviterName)}</strong> has invited you to join
      <strong style="color:#fff">${escapeHtml(params.orgName)}</strong> on Canopy.
    </p>
    <div class="role-badge">${escapeHtml(roleLabel)}</div>
    <br />
    <a href="${escapeHtml(params.acceptUrl)}" class="cta">Accept invitation</a>
    <div class="footer">
      <p>This invitation expires in 7 days. If you did not expect this email,
      you can safely ignore it.</p>
      <p><a href="${escapeHtml(params.acceptUrl)}">${escapeHtml(params.acceptUrl)}</a></p>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
