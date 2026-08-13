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
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Extract form data — can be either nested or flat
    const formData = req.body.data || req.body;

    // Validate required fields
    if (!formData.name || !formData.email || !formData.message) {
      return res.status(400).json({ 
        error: 'Missing required fields: name, email, message' 
      });
    }

    // Build the submission document — matches admin dashboard structure
    const submission = {
      name: formData.name.trim(),
      email: formData.email.trim(),
      message: formData.message.trim(),
      startDate: formData.startDate || '',
      endDate: formData.endDate || '',
      company: formData.company || '',
      createdAt: new Date(), // Firestore timestamp
      read: false,           // Admin dashboard marks as read/unread
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown'
    };

    // Write to Firestore
    const docRef = await db.collection('inquiries').add(submission);

    // Send email notification (optional — can be disabled if email not configured)
    if (process.env.EMAIL_USER && process.env.ADMIN_EMAIL) {
      try {
        const emailBody = `
New Inquiry Submission
${'-'.repeat(50)}

Name: ${submission.name}
Email: ${submission.email}
Company: ${submission.company || '(not provided)'}

Travel Dates: ${submission.startDate || '(not provided)'} to ${submission.endDate || '(not provided)'}

Message:
${submission.message}

${'-'.repeat(50)}
Submitted at: ${new Date().toISOString()}
Inquiry ID: ${docRef.id}
        `.trim();

        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: process.env.ADMIN_EMAIL,
          subject: `New Ghana Lookbook Inquiry: ${submission.name}`,
          text: emailBody
        });
      } catch (emailError) {
        // Log email error but don't fail the submission
        console.warn('Email sending failed (non-critical):', emailError.message);
      }
    }

    res.status(200).json({ 
      success: true, 
      id: docRef.id,
      message: 'Inquiry submitted successfully. We\'ll follow up within 24 hours.'
    });

  } catch (error) {
    console.error('Submission error:', error);
    
    // Return more detailed error for debugging
    res.status(500).json({ 
      error: 'Submission failed. Please try again in a moment.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
