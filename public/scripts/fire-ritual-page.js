(() => {
  const page = document.querySelector('[data-ritual-experience]');
  if (!page) return;

  const productSlug = page.dataset.productSlug;
  const content = page.querySelector('[data-ritual-content]');
  const loading = page.querySelector('[data-ritual-loading]');
  const errorPanel = page.querySelector('[data-ritual-error]');
  const videoCta = page.querySelector('[data-video-cta]');
  const videoTarget = page.querySelector('[data-unified-video-target]');

  videoCta?.addEventListener('click', () => {
    if (!videoTarget) return;
    const videoPlayer = videoTarget instanceof HTMLVideoElement
      ? videoTarget
      : videoTarget.querySelector('video');
    const focusTarget = videoPlayer || videoTarget;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    focusTarget.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    focusTarget.focus({ preventScroll: true });
    if (videoPlayer) {
      videoPlayer.play().catch(() => {});
    }
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
    })
    .catch(() => {
      loading.hidden = true;
      errorPanel.hidden = false;
    });
})();
