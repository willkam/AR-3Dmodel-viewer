function qs() {
  return new URLSearchParams(location.search);
}

function setStatus(text) {
  const el = document.getElementById('status');
  if (el) el.textContent = text;
}

function guessApiBase() {
  const p = qs();
  const sb = p.get('sb');
  if (sb) return sb.replace(/\/$/, '');
  const saved = localStorage.getItem('sbUrl');
  if (saved) return saved.replace(/\/$/, '');
  return '';
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function isInAppBrowser() {
  const ua = navigator.userAgent || '';
  return /MicroMessenger|QQ\/|Weibo|DingTalk|AlipayClient|Taobao|toutiao|aweme/i.test(ua);
}

async function shareOrCopy({ title, text, url }) {
  const shareData = { title, text, url };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
      return true;
    }
  } catch {
    // Fall back to copy.
  }
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const p = qs();
  const id = p.get('id');
  const sbUrl = guessApiBase();
  const bucket = p.get('bucket') || 'models';

  if (!id) {
    setStatus('Missing model id.');
    return;
  }
  if (!sbUrl) {
    setStatus('Missing Supabase URL. Append ?sb=https://YOUR_PROJECT.supabase.co to the URL.');
    return;
  }

  setStatus('Fetching manifest...');

  const manifestUrl = `${sbUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/manifests/${encodeURIComponent(id)}.json`;
  const res = await fetch(manifestUrl, { mode: 'cors' });
  if (!res.ok) {
    setStatus(`Model not found (${res.status}).`);
    return;
  }

  const manifest = await res.json();
  const urls = manifest.urls || {};

  const mv = document.getElementById('mv');
  if (!mv) return;

  // Prefer iOS Quick Look via USDZ when available.
  if (urls.glb) mv.setAttribute('src', urls.glb);
  if (urls.usdz) mv.setAttribute('ios-src', urls.usdz);

  const iosHint = document.getElementById('iosHint');
  if (iosHint && isIOS() && isInAppBrowser()) iosHint.classList.remove('hidden');

  const usdzRow = document.getElementById('usdzRow');
  const usdzLink = document.getElementById('usdzLink');
  if (usdzRow && usdzLink && urls.usdz) {
    usdzRow.classList.remove('hidden');
    usdzLink.href = urls.usdz;
  }

  const sharePageBtn = document.getElementById('sharePageBtn');
  const shareModelBtn = document.getElementById('shareModelBtn');
  const pageUrl = location.href;

  sharePageBtn?.addEventListener('click', async () => {
    const ok = await shareOrCopy({
      title: 'AR Viewer',
      text: 'Open this AR viewer page.',
      url: pageUrl,
    });
    setStatus(ok ? 'Shared page.' : 'Share failed.');
  });

  if (shareModelBtn) {
    shareModelBtn.disabled = !(urls.usdz || urls.glb);
    shareModelBtn.addEventListener('click', async () => {
      const best = isIOS() ? (urls.usdz || urls.glb) : (urls.glb || urls.usdz);
      if (!best) return;
      const ok = await shareOrCopy({
        title: '3D Model',
        text: 'Open the model file.',
        url: best,
      });
      setStatus(ok ? 'Shared model.' : 'Share failed.');
    });
  }

  if (isIOS() && !urls.usdz) {
    setStatus('iOS AR works best with USDZ. This share has no USDZ file.');
  } else {
    setStatus('Ready.');
  }
}

main().catch((err) => {
  setStatus(`Error: ${String(err && err.message ? err.message : err)}`);
});
