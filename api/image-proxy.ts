const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
]);

function isPrivateIp(hostname: string) {
  return (
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  );
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const rawUrl = typeof req.query?.url === 'string' ? req.query.url : '';
  if (!rawUrl) {
    res.status(400).json({ error: 'Missing image URL.' });
    return;
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(rawUrl);
  } catch {
    res.status(400).json({ error: 'Invalid image URL.' });
    return;
  }

  if (!['http:', 'https:'].includes(targetUrl.protocol)) {
    res.status(400).json({ error: 'Unsupported image protocol.' });
    return;
  }

  const hostname = targetUrl.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname) || isPrivateIp(hostname)) {
    res.status(400).json({ error: 'Blocked image host.' });
    return;
  }

  try {
    const upstream = await fetch(targetUrl, {
      redirect: 'follow',
      headers: {
        accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
        referer: `${targetUrl.origin}/`,
      },
    });

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: 'Image host rejected the request.' });
      return;
    }

    const contentType = upstream.headers.get('content-type') || '';
    if (!contentType.startsWith('image/') && !contentType.includes('svg+xml')) {
      res.status(415).json({ error: 'Remote URL did not return an image.' });
      return;
    }

    const body = Buffer.from(await upstream.arrayBuffer());

    res.setHeader('Cache-Control', upstream.headers.get('cache-control') || 'public, max-age=86400, stale-while-revalidate=604800');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(body.length));

    const etag = upstream.headers.get('etag');
    if (etag) res.setHeader('ETag', etag);

    const lastModified = upstream.headers.get('last-modified');
    if (lastModified) res.setHeader('Last-Modified', lastModified);

    res.status(200).send(body);
  } catch (error) {
    console.error('Image proxy failed:', error);
    res.status(502).json({ error: 'Unable to load remote image.' });
  }
}
