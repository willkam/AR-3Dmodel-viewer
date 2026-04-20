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
    setStatus('缺少模型 id。');
    return;
  }
  if (!sbUrl) {
    setStatus('缺少 Supabase URL。请在链接中添加 ?sb=https://你的项目.supabase.co');
    return;
  }

  setStatus('正在获取清单...');

  const manifestUrl = `${sbUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/manifests/${encodeURIComponent(id)}.json`;
  const res = await fetch(manifestUrl, { mode: 'cors' });
  if (!res.ok) {
    setStatus(`未找到模型（${res.status}）。`);
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
      title: 'AR 查看器',
      text: '打开这个 AR 查看页面。',
      url: pageUrl,
    });
    setStatus(ok ? '页面已分享。' : '分享失败。');
  });

  if (shareModelBtn) {
    shareModelBtn.disabled = !(urls.usdz || urls.glb);
    shareModelBtn.addEventListener('click', async () => {
      const best = isIOS() ? (urls.usdz || urls.glb) : (urls.glb || urls.usdz);
      if (!best) return;
      const ok = await shareOrCopy({
        title: '三维模型',
        text: '打开这个模型文件。',
        url: best,
      });
      setStatus(ok ? '模型已分享。' : '分享失败。');
    });
  }

  if (isIOS() && !urls.usdz) {
    setStatus('iOS AR 最佳为 USDZ。本次分享未包含 USDZ。');
  } else {
    setStatus('已就绪。');
  }
}

main().catch((err) => {
  setStatus(`错误：${String(err && err.message ? err.message : err)}`);
});
