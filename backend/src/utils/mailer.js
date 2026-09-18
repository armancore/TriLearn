const nodemailer = require('nodemailer')
const https = require('https')
const logger = require('./logger')

const parseBoolean = (/** @type {string | null | undefined} */ value, /** @type {boolean} */ fallback) => {
  if (value === undefined || value === null || value === '') {
    return fallback
  }

  return String(value).trim().toLowerCase() === 'true'
}

const createTransport = () => nodemailer.createTransport({
  host: process.env.RESEND_SMTP_HOST,
  port: Number(process.env.RESEND_SMTP_PORT) || 587,
  secure: parseBoolean(process.env.RESEND_SMTP_SECURE, process.env.RESEND_SMTP_PORT === '465'),
  // Fail fast on SMTP connectivity issues so API handlers don't hang for long.
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 15_000,
  auth: {
    user: process.env.RESEND_SMTP_USER,
    pass: process.env.RESEND_SMTP_PASS
  }
})

const sendViaResendApi = async (/** @type {import("nodemailer").SendMailOptions} */ { to, subject, html, text }) => {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim()
  if (!apiKey) {
    return false
  }

  const from = process.env.MAIL_FROM || 'TriLearn <no-reply@trilearn.app>'
  const recipients = Array.isArray(to) ? to : [to]
  const payload = JSON.stringify({
    from,
    to: recipients,
    subject,
    html,
    text
  })

  return new Promise((resolve, reject) => {
    const request = https.request('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 15000
    }, (response) => {
      let responseBody = ''
      response.on('data', (chunk) => {
        responseBody += chunk
      })
      response.on('end', () => {
        if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
          resolve(true)
          return
        }

        reject(new Error(`Resend API responded ${response.statusCode}${responseBody ? `: ${responseBody}` : ''}`))
      })
    })

    request.on('timeout', () => {
      request.destroy(new Error('Resend API request timed out'))
    })
    request.on('error', (error) => reject(error))
    request.write(payload)
    request.end()
  })
}

const sendMail = async (/** @type {import("nodemailer").SendMailOptions} */ { to, subject, html, text }) => {
  if (await sendViaResendApi(/** @type {import("nodemailer").SendMailOptions} */ { to, subject, html, text })) {
    return
  }

  if (!process.env.RESEND_SMTP_PASS) {
    logger.warn('Email not sent - RESEND_API_KEY and RESEND_SMTP_PASS not configured')
    return
  }

  const transporter = createTransport()

  await transporter.sendMail({
    from: process.env.MAIL_FROM || 'TriLearn <no-reply@trilearn.app>',
    to,
    subject,
    html,
    text
  })
}

module.exports = { sendMail }
