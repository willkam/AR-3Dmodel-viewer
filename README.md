# 3Dmodel-viewer

Browser 3D viewer (GLB/GLTF/FBX) with materials + basic controls, plus optional mobile AR sharing.

## Local Run

```bash
cd /Users/willkam/Documents/3Dmodel-viewer
python3 -m http.server 5173
```

Open `http://localhost:5173`.

## AR Sharing (Supabase)

This repo supports a minimal Supabase Storage backend to support:
- Desktop: upload `model.glb` (and optional `model.usdz`) to Storage bucket `models`
- Generate QR code
- Mobile: scan QR -> open `ar.html` -> place model in AR

### Setup

1. Create a Supabase project and a Storage bucket named `models` (Public)
2. In `Storage -> Policies`, add a policy for bucket `models` that allows:
   - `SELECT` + `INSERT`
   - Target role: `anon`
   - Definition: `bucket_id = 'models'`
3. In the web UI, click `View in AR`
   - Paste `Supabase Project URL` (example: `https://xxxx.supabase.co`)
   - Paste `Supabase Publishable Key` (`sb_publishable_...`)
   - Choose `model.glb` (USDZ optional)
   - Click `Upload & Generate QR`

### Notes

- iOS AR (Quick Look) works best with `USDZ`. If you only upload `GLB`, iOS may show the model but not allow AR placement.
- For personal testing, delete files periodically in `Storage -> Files`, or add a short-lived policy scheme.
