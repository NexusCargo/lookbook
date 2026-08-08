// GET /api/config
// Returns the public (non-secret) config the client needs to boot:
// Firebase project config and Cloudinary cloud name. Neither is
// actually secret — both are meant to be visible in a client bundle —
// but serving them from one place means dev/staging/prod can point at
// different projects purely by changing env vars in Vercel, with
// nothing to edit in the HTML/JS source itself.

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'public, max-age=300'); // 5 min edge cache

  res.status(200).json({
    firebaseConfig: {
      apiKey: process.env.FIREBASE_API_KEY,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN,
      projectId: process.env.FIREBASE_PROJECT_ID,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.FIREBASE_APP_ID,
    },
    cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME,
  });
}
