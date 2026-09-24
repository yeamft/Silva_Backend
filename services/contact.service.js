const env = require("../config/env");
const mail = require("./mail.service");

function resolveContactInbox() {
  if (env.CONTACT_EMAIL) return env.CONTACT_EMAIL;
  const from = env.MAIL_FROM || "";
  const match = from.match(/<([^>]+)>/);
  if (match?.[1] && !match[1].includes("localhost")) return match[1];
  if (env.SMTP_USER) return env.SMTP_USER;
  return null;
}

async function submitInquiry({ name, email, organization, message, website }) {
  // Honeypot filled → pretend success without sending
  if (website) {
    return { ok: true };
  }

  const inbox = resolveContactInbox();
  const orgLine = organization ? organization : "—";
  const subject = `Cropfort contact: ${name}`;
  const text = [
    "New contact inquiry from the Cropfort landing page.",
    "",
    `Name: ${name}`,
    `Email: ${email}`,
    `Organization: ${orgLine}`,
    "",
    "Message:",
    message,
  ].join("\n");
  const html = `
    <p>New contact inquiry from the Cropfort landing page.</p>
    <ul>
      <li><strong>Name:</strong> ${escapeHtml(name)}</li>
      <li><strong>Email:</strong> ${escapeHtml(email)}</li>
      <li><strong>Organization:</strong> ${escapeHtml(orgLine)}</li>
    </ul>
    <p><strong>Message</strong></p>
    <p style="white-space:pre-wrap;">${escapeHtml(message)}</p>
  `;

  if (!inbox) {
    console.log("[contact] No CONTACT_EMAIL configured — logging inquiry only");
    console.log(text);
    return { ok: true, delivered: false };
  }

  await mail.sendMail({ to: inbox, subject, text, html });
  return { ok: true, delivered: true };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = { submitInquiry, resolveContactInbox };
