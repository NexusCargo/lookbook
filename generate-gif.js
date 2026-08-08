import admin from 'firebase-admin';
import { v2 as cloudinary } from 'cloudinary';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    ),
  });
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function requireAdmin(req) {
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) throw { status: 401, message: 'Missing bearer token' };

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch (err) {
    throw { status: 401, message: 'Invalid or expired token' };
  }

  const allowedEmails = (process.env.ADMIN_EMAILS || '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

  if (!decoded.email || !allowedEmails.includes(decoded.email.toLowerCase())) {
    throw { status: 403, message: 'Not authorized as admin' };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await requireAdmin(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message || 'Unauthorized' });
  }

  const { tag } = req.body || {};
  if (!tag) {
    return res.status(400).json({ error: 'Missing tag' });
  }

  try {
    const result = await cloudinary.uploader.multi(tag, {
      format: 'gif',
      transformation: [{ width: 1600, crop: 'fill' }],
      delay: 700,
    });
    res.status(200).json({ url: result.url });
  } catch (err) {
    res.status(502).json({ error: err.message || 'Cloudinary multi() failed' });
  }
}
