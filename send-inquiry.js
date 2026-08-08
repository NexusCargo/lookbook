
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, startDate, endDate, message, company } = req.body || {};

  if (company) {
    return res.status(200).json({ ok: true });
  }

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'A valid email is required' });
  }

  const safeName = name.trim().slice(0, 200);
  const safeMessage = (message || '').trim().slice(0, 2000);
  const safeStart = (startDate || '').slice(0, 20);
  const safeEnd = (endDate || '').slice(0, 20);

  try {
    await resend.emails.send({
      from: 'Ghana Lookbook <inquiries@thegoldcoast.com>',
      to: process.env.INQUIRY_TO_EMAIL,
      reply_to: email,
      subject: `New trip inquiry from ${safeName}`,
      text: [
        `Name: ${safeName}`,
        `Email: ${email}`,
        safeStart || safeEnd ? `Dates: ${safeStart || '—'} to ${safeEnd || '—'}` : null,
        safeMessage ? `Message:\n${safeMessage}` : null,
      ].filter(Boolean).join('\n\n'),
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('send-inquiry failed:', err);
    res.status(502).json({ error: 'Failed to send inquiry' });
  }
}
