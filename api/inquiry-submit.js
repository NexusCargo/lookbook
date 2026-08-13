import nodemailer from 'nodemailer';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

const app = initializeApp();
const db = getFirestore(app);

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Only these fields are ever read from the request body. Anything else the
// client sends (including the honeypot field, handled separately below) is
// ignored rather than stored or emailed.
const FIELD_LIMITS = {
  name: 200,
  email: 320,
  startDate: 20,
  endDate: 20,
  message: 5000
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return xff.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function cleanField(value, maxLen) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};

  // Honeypot: real visitors never fill this hidden field. Bots that submit
  // every field they find often do. Report success without writing
  // anything, so the bot has no signal to adapt on.
  if (body.company) {
    return res.status(200).json({ success: true });
  }

  const name = cleanField(body.name, FIELD_LIMITS.name);
  const email = cleanField(body.email, FIELD_LIMITS.email);
  const startDate = cleanField(body.startDate, FIELD_LIMITS.startDate);
  const endDate = cleanField(body.endDate, FIELD_LIMITS.endDate);
  const message = cleanField(body.message, FIELD_LIMITS.message);

  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required.' });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'That email address doesn\'t look right.' });
  }
  if (startDate && !DATE_RE.test(startDate)) {
    return res.status(400).json({ error: 'Invalid start date.' });
  }
  if (endDate && !DATE_RE.test(endDate)) {
    return res.status(400).json({ error: 'Invalid end date.' });
  }

  const ip = getClientIp(req);

  try {
    // Lightweight, serverless-friendly rate limit: reject a second
    // submission from the same IP within 60 seconds. Requires a composite
    // Firestore index on (ip ASC, timestamp ASC) — see README note.
    const oneMinuteAgo = Timestamp.fromMillis(Date.now() - 60 * 1000);
    const recent = await db.collection('inquiries')
      .where('ip', '==', ip)
      .where('timestamp', '>', oneMinuteAgo)
      .limit(1)
      .get();
    if (!recent.empty) {
      return res.status(429).json({ error: 'Please wait a moment before submitting again.' });
    }

    const submission = {
      name,
      email,
      startDate,
      endDate,
      message,
      timestamp: FieldValue.serverTimestamp(),
      read: false,
      ip
    };

    const docRef = await db.collection('inquiries').add(submission);

    // Firestore write is the source of truth for the admin panel — it has
    // already succeeded at this point. Email is a best-effort notification
    // on top of that, so a mail failure shouldn't make the submission look
    // like it failed to the visitor.
    try {
      const emailBody = [
        `Name: ${name}`,
        `Email: ${email}`,
        startDate ? `Earliest travel date: ${startDate}` : null,
        endDate ? `Latest travel date: ${endDate}` : null,
        '',
        message || '(no message)'
      ].filter(line => line !== null).join('\n');

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: process.env.ADMIN_EMAIL,
        subject: `New inquiry from ${name}`,
        text: emailBody
      });
    } catch (mailError) {
      console.error('Inquiry saved but notification email failed:', mailError);
    }

    res.status(200).json({ success: true, id: docRef.id });
  } catch (error) {
    console.error('Submission error:', error);
    res.status(500).json({ error: 'Submission failed' });
  }
}
