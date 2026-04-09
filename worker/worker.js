/**
 * Cloudflare Worker (Modules) + R2
 * Endpoints:
 * - POST   /api/create            -> { id, upload: { glb, usdz? }, ar: { url } }
 * - PUT    /api/upload/:id/:name  -> stores file in R2
 * - POST   /api/finalize          -> writes manifest to R2
 * - GET    /api/model/:id         -> returns manifest with asset URLs
 * - GET    /models/:id/:name      -> streams asset from R2
 */

const ALLOWED_EXT = new Set(['glb', 'usdz']);

function json(data, init = {}) {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { ...init, headers });
}

function withCors(req, env, res) {
  const headers = new Headers(res.headers);
  const origin = req.headers.get('origin');

  // Allow cross-origin from any origin by default (safe here because we don't use cookies).
  // If you want to lock it down, set ALLOWED_ORIGINS to a comma-separated list.
  const allowed = String(env.ALLOWED_ORIGINS || '').trim();
  if (allowed) {
    const list = allowed.split(',').map((s) => s.trim()).filter(Boolean);
    if (origin && list.includes(origin)) headers.set('access-control-allow-origin', origin);
  } else {
    headers.set('access-control-allow-origin', origin || '*');
  }

  headers.set('access-control-allow-methods', 'GET,POST,PUT,OPTIONS');
  headers.set('access-control-allow-headers', 'content-type,content-length');
  headers.set('access-control-max-age', '86400');
  headers.set('vary', 'origin');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function bad(message, status = 400) {
  return json({ ok: false, error: message }, { status });
}

function randomId() {
  // 128-bit-ish id, URL safe
  return crypto.randomUUID().replace(/-/g, '');
}

function extOf(name) {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : '';
}

function sanitizeName(name) {
  // Keep it simple: basename only.
  const cleaned = String(name || '').split('/').pop().split('\\').pop();
  return cleaned.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function manifestKey(id) {
  return `manifests/${id}.json`;
}

function modelKey(id, name) {
  return `models/${id}/${name}`;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') {
      return withCors(req, env, new Response(null, { status: 204 }));
    }

    try {
      const path = url.pathname;

      if (path === '/api/create' && req.method === 'POST') {
        const id = randomId();
        const upload = {
          glb: `${url.origin}/api/upload/${id}/model.glb`,
          usdz: `${url.origin}/api/upload/${id}/model.usdz`,
        };
        return withCors(req, env, json({ ok: true, id, upload }));
      }

      if (path === '/api/finalize' && req.method === 'POST') {
        const body = await req.json().catch(() => null);
        if (!body || !body.id || !body.files) return withCors(req, env, bad('Invalid JSON body'));

        const id = String(body.id);
        const files = body.files;

        const glbName = files.glb ? sanitizeName(files.glb) : '';
        const usdzName = files.usdz ? sanitizeName(files.usdz) : '';

        if (!glbName && !usdzName) return withCors(req, env, bad('At least one of files.glb / files.usdz is required'));

        const manifest = {
          id,
          createdAt: new Date().toISOString(),
          files: {},
          urls: {},
        };

        if (glbName) {
          const key = modelKey(id, glbName);
          const head = await env.BUCKET.head(key);
          if (!head) return withCors(req, env, bad(`Missing uploaded file: ${glbName}`, 404));
          manifest.files.glb = glbName;
          manifest.urls.glb = `${url.origin}/models/${id}/${encodeURIComponent(glbName)}`;
        }

        if (usdzName) {
          const key = modelKey(id, usdzName);
          const head = await env.BUCKET.head(key);
          if (!head) return withCors(req, env, bad(`Missing uploaded file: ${usdzName}`, 404));
          manifest.files.usdz = usdzName;
          manifest.urls.usdz = `${url.origin}/models/${id}/${encodeURIComponent(usdzName)}`;
        }

        await env.BUCKET.put(manifestKey(id), JSON.stringify(manifest), {
          httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'no-store' },
        });

        return withCors(req, env, json({ ok: true, manifest }));
      }

      const uploadMatch = path.match(/^\/api\/upload\/([a-f0-9]{32})\/([^/]+)$/i);
      if (uploadMatch && req.method === 'PUT') {
        const id = uploadMatch[1];
        const name = sanitizeName(uploadMatch[2]);
        const ext = extOf(name);
        if (!ALLOWED_EXT.has(ext)) return withCors(req, env, bad(`Unsupported file type: .${ext}`, 415));

        const length = Number(req.headers.get('content-length') || '0');
        const maxBytes = Number(env.MAX_UPLOAD_BYTES || 50 * 1024 * 1024);
        if (length && length > maxBytes) return withCors(req, env, bad(`File too large (max ${maxBytes} bytes)`, 413));

        if (!req.body) return withCors(req, env, bad('Missing request body'));

        const key = modelKey(id, name);
        const contentType = ext === 'glb' ? 'model/gltf-binary' : 'model/vnd.usdz+zip';

        await env.BUCKET.put(key, req.body, {
          httpMetadata: {
            contentType,
            cacheControl: 'public, max-age=3600',
          },
        });

        return withCors(req, env, json({ ok: true, id, name }));
      }

      const modelMatch = path.match(/^\/api\/model\/([a-f0-9]{32})$/i);
      if (modelMatch && req.method === 'GET') {
        const id = modelMatch[1];
        const obj = await env.BUCKET.get(manifestKey(id));
        if (!obj) return withCors(req, env, bad('Not found', 404));
        const text = await obj.text();
        return withCors(req, env, new Response(text, {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
          },
        }));
      }

      const assetMatch = path.match(/^\/models\/([a-f0-9]{32})\/(.+)$/i);
      if (assetMatch && req.method === 'GET') {
        const id = assetMatch[1];
        const name = sanitizeName(decodeURIComponent(assetMatch[2]));
        const key = modelKey(id, name);
        const obj = await env.BUCKET.get(key);
        if (!obj) return withCors(req, new Response('Not found', { status: 404 }));

        const headers = new Headers();
        obj.writeHttpMetadata(headers);
        headers.set('etag', obj.httpEtag);
        headers.set('cache-control', 'public, max-age=3600');

        // For model-viewer and some viewers.
        headers.set('access-control-allow-origin', '*');

        return new Response(obj.body, { status: 200, headers });
      }

      return withCors(req, env, new Response('Not found', { status: 404 }));
    } catch (err) {
      return withCors(req, env, json({ ok: false, error: String(err && err.message ? err.message : err) }, { status: 500 }));
    }
  },
};
