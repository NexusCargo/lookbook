// POST /api/cloudinary-sign
// Body (optional): { tag?: string }
// Auth: Authorization: Bearer <Firebase ID token>
//
// Verifies the caller is a signed-in Firebase user on the ADMIN_EMAILS
// allowlist, then returns a signed Cloudinary upload payload. The
// Cloudinary API secret is used here, server-side, only — it never
// reaches the browser. This is what actually enforces "admin-only
// uploads," not just an unlisted admin.html page.
//
// The optional `tag` gets baked into the signed params so every image
// uploaded for a given stop shares a tag Cloudinary can later group by
// (used by /api/generate-gif.js).

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
  return decoded;
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

  const tag = (req.body && req.body.tag) || undefined;
  const timestamp = Math.round(Date.now() / 1000);
  const paramsToSign = { timestamp, folder: 'ghana-lookbook' };
  if (tag) paramsToSign.tags = tag;

  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    process.env.CLOUDINARY_API_SECRET
  );

  res.status(200).json({
    signature,
    timestamp,
    apiKey: process.env.CLOUDINARY_API_KEY,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    folder: 'ghana-lookbook',
    tag,
  });
}
