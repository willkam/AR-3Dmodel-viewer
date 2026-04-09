# Cloudflare Worker + R2 (Upload + Share)

This Worker stores uploaded `model.glb` and optional `model.usdz` into R2, then serves them back via `/models/...` for `model-viewer` AR.

## Cloudflare Dashboard Setup

1. Create an R2 bucket
   - Cloudflare Dashboard -> R2 -> Create bucket
   - Bucket name example: `model-viewer`

2. Create a Worker
   - Workers & Pages -> Create -> Worker
   - Use **Modules** syntax (default in the new editor)
   - Paste contents of `worker.js`

3. Bind R2 bucket to the Worker
   - Worker -> Settings -> Bindings -> R2 bucket
   - Variable name: `BUCKET`
   - Bucket: select the bucket you created

4. Optional: limit which origins can call the API
   - Worker -> Settings -> Variables
   - Add `ALLOWED_ORIGINS` (comma-separated), example:
     - `https://willkam.github.io, http://localhost:5173`
   - If set, it must match the browser `Origin` exactly (scheme + host + optional port).

5. Optional: set max upload size
   - Worker -> Settings -> Variables
   - Add `MAX_UPLOAD_BYTES`, example:
     - `50000000`

6. Optional (recommended): auto-delete test uploads
   - R2 -> your bucket -> Lifecycle rules
   - Add a rule to delete objects under `models/` and `manifests/` after 1 day

## Endpoints

- `POST /api/create`
  - Returns an `id` and upload URLs.
- `PUT /api/upload/:id/model.glb`
- `PUT /api/upload/:id/model.usdz`
- `POST /api/finalize` with JSON body:

```json
{
  "id": "<id>",
  "files": {
    "glb": "model.glb",
    "usdz": "model.usdz"
  }
}
```

- `GET /api/model/:id`
- `GET /models/:id/<filename>`
