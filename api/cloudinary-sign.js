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

  // 🔍 DEBUG: Log what we got from the token
  console.log('🔐 Token decoded:', {
    uid: decoded.uid,
    email: decoded.email,
    email_verified: decoded.email_verified,
    hasAdminClaim: decoded.admin || false,
    allClaims: Object.keys(decoded)
  });

  // ✅ IMPROVED: Check custom claim first, then fallback to email list
  const allowedEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

  console.log('📋 Allowed admin emails from env:', allowedEmails);

  // Check custom claim (preferred method)
  if (decoded.admin === true) {
    console.log('✅ User authorized via custom claim');
    return;
  }

  // Fallback: check email list
  if (decoded.email) {
    const userEmail = decoded.email.toLowerCase();
    console.log(`📧 Checking user email: "${userEmail}" against allowed list`);
    
    if (allowedEmails.includes(userEmail)) {
      console.log('✅ User email found in admin list');
      return;
    }
  }

  // Neither method worked
  throw {
    status: 403,
    message: `Not authorized as admin. Email: ${decoded.email || 'NOT_PROVIDED'}`
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await requireAdmin(req);
  } catch (err) {
    console.error('❌ Auth error:', err);
    return res.status(err.status || 401).json({ error: err.message || 'Unauthorized' });
  }

  const { tag } = req.body || {};
  if (!tag) {
    return res.status(400).json({ error: 'Missing tag' });
  }

  const timestamp = Math.round(Date.now() / 1000);
  const folder = 'lookbook';
  const paramsToSign = { timestamp, folder, tags: tag };

  try {
    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      process.env.CLOUDINARY_API_SECRET
    );

    res.status(200).json({
      signature,
      timestamp,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      folder,
      tag,
    });
  } catch (err) {
    console.error('❌ Signature error:', err);
    res.status(500).json({ error: err.message || 'Failed to sign upload' });
  }
}
