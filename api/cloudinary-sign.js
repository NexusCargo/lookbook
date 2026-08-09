import crypto from 'crypto';

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return res.status(500).json({ error: 'Missing Cloudinary config' });
  }

  const { tag } = req.body;

  if (!tag) {
    return res.status(400).json({ error: 'Tag required' });
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const stringToSign = `tags=${tag}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash('sha1').update(stringToSign).digest('hex');

  res.json({
    cloudName,
    apiKey,
    timestamp,
    signature,
    tag
  });
}
