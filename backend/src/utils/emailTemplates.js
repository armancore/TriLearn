const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')

/** @param {{eyebrow?: string, title: string, preview?: string, content: string}} options */
const base = ({ eyebrow, title, preview, content }) => `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#edf2f7;color:#10233e">
    <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden">
      ${escapeHtml(preview || title)}
    </span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#edf2f7;margin:0;padding:24px 12px">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-collapse:collapse;border:1px solid #dbe4ef">
            <tr>
              <td style="background:#10233e;padding:24px 28px;color:#ffffff;font-family:Arial,sans-serif">
                <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#f4a623;font-weight:700">${escapeHtml(eyebrow || 'TriLearn')}</div>
                <div style="font-size:24px;font-weight:700;margin-top:8px">TriLearn</div>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 28px;font-family:Arial,sans-serif;font-size:15px;line-height:1.65;color:#1f2937">
                <h1 style="margin:0 0 18px;font-size:22px;line-height:1.25;color:#10233e">${escapeHtml(title)}</h1>
                ${content}
              </td>
            </tr>
            <tr>
              <td style="background:#f8fafc;border-top:1px solid #e5edf5;padding:18px 28px;font-family:Arial,sans-serif;font-size:12px;line-height:1.5;color:#64748b">
                This message was sent by TriLearn. If you were not expecting it, you can safely ignore it.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

const button = (/** @type {string | undefined} */ url, /** @type {string | undefined} */ label) => (
  `<a href="${escapeHtml(url)}"
     style="display:inline-block;background:#f4a623;color:#10233e;
            text-decoration:none;padding:12px 20px;border-radius:6px;
            font-weight:700;margin:16px 0">${escapeHtml(label)}</a>`
)

const detailTable = (/** @type {[string, string][]} */ rows) => `
  <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="border-collapse:collapse;margin:16px 0;border:1px solid #e5edf5">
    ${rows.map(([label, value], /** @type {number} */ index) => `
      <tr style="${index % 2 === 1 ? 'background:#f8fafc' : ''}">
        <td style="padding:10px 12px;color:#64748b;width:34%;font-size:14px">${escapeHtml(label)}</td>
        <td style="padding:10px 12px;color:#10233e;font-weight:700;font-size:14px">${escapeHtml(value)}</td>
      </tr>
    `).join('')}
  </table>`

/** @param {{name: string, resetUrl: string}} options */
const passwordResetTemplate = ({ name, resetUrl }) => ({
  subject: 'Reset your TriLearn password',
  html: base({
    eyebrow: 'Account security',
    title: 'Reset your password',
    preview: 'Your TriLearn password reset link expires in 30 minutes.',
    content: `
      <p style="margin:0 0 14px">Hi ${escapeHtml(name)},</p>
      <p style="margin:0 0 14px">We received a request to reset your TriLearn password. Use the secure link below within <strong>30 minutes</strong>.</p>
      ${button(resetUrl, 'Reset password')}
      <p style="margin:14px 0 0;color:#64748b;font-size:13px">If you did not request a reset, no action is needed.</p>`
  }),
  text: `Hi ${name},\n\nReset your password: ${resetUrl}\n\nExpires in 30 minutes.`
})

/** @param {{name: string, email: string, tempPassword: string, verificationUrl?: string}} options */
const welcomeTemplate = ({ name, email, tempPassword, verificationUrl }) => ({
  subject: 'Welcome to TriLearn - your account is ready',
  html: base({
    eyebrow: 'New account',
    title: 'Your TriLearn account is ready',
    preview: 'Sign in with your temporary password and complete your account setup.',
    content: `
      <p style="margin:0 0 14px">Hi ${escapeHtml(name)},</p>
      <p style="margin:0 0 14px">Your TriLearn account has been created. Use these credentials to sign in:</p>
      ${detailTable([
        ['Email', email],
        ['Temporary password', tempPassword]
      ])}
      <p style="margin:0 0 14px;color:#b45309;font-size:13px">You will be asked to change your password on first login.</p>
      ${verificationUrl
        ? `<p style="margin:0 0 8px">Please verify your email address within <strong>24 hours</strong>.</p>${button(verificationUrl, 'Verify email')}`
        : ''}`
  }),
  text: [
    `Hi ${name}`,
    '',
    `Email: ${email}`,
    `Password: ${tempPassword}`,
    '',
    'Change your password on first login.',
    ...(verificationUrl
      ? ['', `Verify your email within 24 hours: ${verificationUrl}`]
      : [])
  ].join('\n')
})

/** @param {{name: string, verificationUrl: string}} options */
const emailVerificationTemplate = ({ name, verificationUrl }) => ({
  subject: 'Verify your TriLearn email',
  html: base({
    eyebrow: 'Email verification',
    title: 'Verify your email address',
    preview: 'Confirm your TriLearn email address within 24 hours.',
    content: `
      <p style="margin:0 0 14px">Hi ${escapeHtml(name)},</p>
      <p style="margin:0 0 14px">Please confirm this email address for your TriLearn account. This link expires in <strong>24 hours</strong>.</p>
      ${button(verificationUrl, 'Verify email')}`
  }),
  text: `Hi ${name},\n\nVerify your email: ${verificationUrl}\n\nExpires in 24 hours.`
})

/** @param {{title: string, content: string, audience: string, type: string}} options */
const noticeTemplate = ({ title, content, audience, type }) => ({
  subject: `[TriLearn Notice] ${title}`,
  html: base({
    eyebrow: audience ? `${type} - ${audience}` : type,
    title,
    preview: content,
    content: `
      <p style="margin:0;color:#1f2937;line-height:1.65">${escapeHtml(content).replaceAll('\n', '<br>')}</p>`
  }),
  text: `${title}\n\n${content}`
})

module.exports = {
  passwordResetTemplate,
  emailVerificationTemplate,
  welcomeTemplate,
  noticeTemplate,
  escapeHtml
}
