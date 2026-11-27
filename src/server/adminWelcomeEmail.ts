import nodemailer from 'nodemailer';

export interface AdminWelcomeDetails {
  firstName: string;
  lastName: string;
  email: string;
  temporaryPassword: string;
  loginUrl: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

export function buildAdminWelcomeEmail(details: AdminWelcomeDetails) {
  const name = `${details.firstName} ${details.lastName}`.trim();
  const text = `Hello ${name},

An administrator account has been created for you on the CIPF voting system.

Role: Administrator
Login email: ${details.email}
Temporary password: ${details.temporaryPassword}
Sign in: ${details.loginUrl}

After signing in, change your temporary password to one only you know. If you were not expecting this account, contact the system owner.

CIPF Voting System`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1a1a1a;line-height:1.6">
    <h1 style="font-size:22px;margin-bottom:8px">Welcome to the CIPF voting system</h1>
    <p>Hello ${escapeHtml(name)},</p>
    <p>An administrator account has been created for you. Use these details to sign in:</p>
    <table role="presentation" style="border-collapse:collapse;width:100%;background:#f7f6f3;border:1px solid #e5e1d8">
      <tr><th style="text-align:left;padding:10px">Role</th><td style="padding:10px">Administrator</td></tr>
      <tr><th style="text-align:left;padding:10px">Login email</th><td style="padding:10px">${escapeHtml(details.email)}</td></tr>
      <tr><th style="text-align:left;padding:10px">Temporary password</th><td style="padding:10px"><code>${escapeHtml(details.temporaryPassword)}</code></td></tr>
    </table>
    <p><a href="${escapeHtml(details.loginUrl)}" style="display:inline-block;background:#1a1a1a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Sign in to your account</a></p>
    <p style="font-size:13px;color:#555">After signing in, change your temporary password to one only you know. If you were not expecting this account, contact the system owner.</p>
  </div>`;
  return { subject: 'Your CIPF voting system admin account', text, html };
}

export async function sendAdminWelcomeEmail(details: AdminWelcomeDetails): Promise<void> {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.MAIL_FROM?.trim();
  const port = Number(process.env.SMTP_PORT || 587);
  if (!host || !from || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('SMTP_HOST, MAIL_FROM, and a valid SMTP_PORT are required to email new administrators.');
  }
  const secure = process.env.SMTP_SECURE === 'true';
  const username = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASS;
  if (Boolean(username) !== Boolean(password)) throw new Error('SMTP_USER and SMTP_PASS must be configured together.');
  const transporter = nodemailer.createTransport({
    host, port, secure, requireTLS: !secure,
    ...(username && password ? { auth: { user: username, pass: password } } : {}),
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000
  });
  await transporter.sendMail({ from, to: details.email, ...buildAdminWelcomeEmail(details) });
}
