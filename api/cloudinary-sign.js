import admin from 'firebase-admin';
import { v2 as cloudinary } from 'cloudinary';

let initError = null;

if (!admin.apps.length) {
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT env var is missing');
    const serviceAccount = JSON.parse(raw);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (err) {
    // Don't crash the whole module on import — surface this as a clean 500 instead
    initError = `Firebase admin init failed: ${err.message}`;
    console.error(initError);
  }
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

  if (initError) {
    return res.status(500).json({ error: initError });
  }

  const missingCloudinaryVars = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']
    .filter((key) => !process.env[key]);
  if (missingCloudinaryVars.length) {
    return res.status(500).json({
      error: `Missing Cloudinary env vars: ${missingCloudinaryVars.join(', ')}`,
    });
  }

  try {
    await requireAdmin(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message || 'Unauthorized' });
  }

  const { tag, paramsToSign: widgetParams } = req.body || {};
  if (!tag) {
    return res.status(400).json({ error: 'Missing tag' });
  }

  const timestamp = Math.round(Date.now() / 1000);
  const folder = 'lookbook';

  // If the widget sent its own params_to_sign (the real params it's about to
  // upload with — this includes things like `source: uw` that the Cloudinary
  // widget adds automatically), sign exactly those so the signature matches
  // what Cloudinary recomputes on its end. Force folder/tags server-side so
  // the client can't smuggle in different values.
  const paramsToSign = widgetParams
    ? { ...widgetParams, folder, tags: tag }
    : { timestamp, folder, tags: tag };

  try {
    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      process.env.CLOUDINARY_API_SECRET
    );

    res.status(200).json({
      signature,
      timestamp: paramsToSign.timestamp || timestamp,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      folder,
      tag,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to sign upload' });
  }
}
