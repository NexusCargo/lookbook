// POST /api/generate-gif
// Body: { tag: string }   e.g. "stop-castles" — set on upload by
//                          /api/cloudinary-sign.js
// Auth: Authorization: Bearer <Firebase ID token>
//
// Same admin check as cloudinary-sign.js, then calls Cloudinary's
// Multi API to combine every image sharing `tag` into one animated
// GIF and returns its delivery URL. The caller (admin.html) stores
// that URL on the stop's `gif_url` field in Firestore.
//
// Note: Cloudinary's multi() groups ALL images currently carrying the
// tag, in upload order — so re-running this after adding more images
// to the same stop regenerates the GIF with the new set included.

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
      delay: 700, // ms between frames
    });
    res.status(200).json({ url: result.url });
  } catch (err) {
    // Common cause: fewer than 2 images currently carry this tag.
    res.status(502).json({ error: err.message || 'Cloudinary multi() failed' });
  }
}
