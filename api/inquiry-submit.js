import nodemailer from 'nodemailer';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp();
const db = getFirestore(app);

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { data } = req.body;
    
    if (!data) {
      return res.status(400).json({ error: 'No data provided' });
    }

    const timestamp = Date.now();
    const submission = {
      data,
      timestamp,
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress
    };

    await db.collection('inquiries').add(submission);

    const emailBody = Object.entries(data)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.ADMIN_EMAIL,
      subject: 'New Inquiry Submission',
      text: emailBody
    });

    res.status(200).json({ success: true, id: submission.timestamp });
  } catch (error) {
    console.error('Submission error:', error);
    res.status(500).json({ error: 'Submission failed' });
  }
}
