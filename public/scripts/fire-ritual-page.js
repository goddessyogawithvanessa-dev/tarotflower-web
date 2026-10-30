(() => {
  const page = document.querySelector('[data-ritual-experience]');
  if (!page) return;

  const productSlug = page.dataset.productSlug;
  const content = page.querySelector('[data-ritual-content]');
  const loading = page.querySelector('[data-ritual-loading]');
  const errorPanel = page.querySelector('[data-ritual-error]');
  const videoTarget = page.querySelector('[data-unified-video-target]');
  const videoLoading = page.querySelector('[data-video-loading]');
  const videoError = page.querySelector('[data-video-error]');
  const printCompanion = page.querySelector('[data-print-companion]');

  printCompanion?.addEventListener('click', () => {
    const printWindow = window.open(printCompanion.dataset.companionUrl, '_blank');
    if (!printWindow) return;
    printWindow.opener = null;
    let printRequested = false;
    const requestPrint = () => {
      if (printRequested || printWindow.closed) return;
      printRequested = true;
      try { printWindow.print(); } catch {}
    };
    try { printWindow.addEventListener('load', requestPrint, { once: true }); } catch {}
    window.setTimeout(requestPrint, 5000);
  });

  const loadVideo = () => fetch('/api/library/video/step-into-your-fire', {
    headers: { Accept: 'application/json' },
  })
    .then(async (response) => {
      if (!response.ok) throw new Error('Video unavailable');
      return response.json();
    })
    .then(({ embedUrl }) => {
      if (!videoTarget || !embedUrl) throw new Error('Video unavailable');
      const frame = document.createElement('iframe');
      frame.className = 'fire-stream-player';
      frame.title = 'Step Into Your Fire complete guided ritual';
      frame.src = embedUrl;
      frame.allow = 'accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture';
      frame.allowFullscreen = true;
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      videoLoading?.remove();
      videoTarget.append(frame);
      videoTarget.classList.add('is-ready');
    })
    .catch(() => {
      if (videoLoading) videoLoading.hidden = true;
      if (videoError) videoError.hidden = false;
    });

  fetch('/api/library/session', { headers: { Accept: 'application/json' } })
    .then(async (response) => {
      if (response.status === 401) {
        window.location.replace('/library/login/');
        return null;
      }
      if (!response.ok) throw new Error('Library unavailable');
      return response.json();
    })
    .then((result) => {
      if (!result) return;
      const product = result.products.find((item) => item.slug === productSlug);
      loading.hidden = true;
      if (!product) {
        errorPanel.hidden = false;
        return;
      }
      content.hidden = false;
      return loadVideo();
    })
    .catch(() => {
      loading.hidden = true;
      errorPanel.hidden = false;
    });
})();
