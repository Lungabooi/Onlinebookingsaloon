const nodemailer = require('nodemailer');

let transporter;
async function getMailer() {
  if (transporter) return transporter;
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    transporter = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT) || 587, secure: process.env.SMTP_SECURE === 'true', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
    return transporter;
  }
  // If no SMTP configured, do nothing (Netlify environment may not allow testAccount)
  transporter = { sendMail: async () => ({}) };
  return transporter;
}

async function sendVerification(email, token) {
  const trans = await getMailer();
  const verifyUrl = `${process.env.APP_URL || ''}/reset.html?token=${token}`; // using reset.html as simple landing (client handles)
  await trans.sendMail({ from: process.env.EMAIL_FROM || 'no-reply@salon.local', to: email, subject: 'Verify your email', text: `Verify: ${verifyUrl}`, html: `<p>Verify: <a href="${verifyUrl}">${verifyUrl}</a></p>` });
}

module.exports = { getMailer, sendVerification };
