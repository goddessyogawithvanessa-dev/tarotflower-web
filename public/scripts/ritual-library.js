(() => {
  const page = document.querySelector('[data-ritual-experience]');
  if (!page) return;
  const productSlug = page.dataset.productSlug;
  const content = page.querySelector('[data-ritual-content]');
  const loading = page.querySelector('[data-ritual-loading]');
  const errorPanel = page.querySelector('[data-ritual-error]');
  const previousButton = page.querySelector('[data-ritual-previous]');
  const progress = page.querySelector('[data-ritual-progress]');
  const steps = [...page.querySelectorAll('[data-ritual-step]')];
  let currentStep = 0;

  function showStep(index, direction = 1) {
    if (index < 0 || index >= steps.length) return;
    const outgoing = steps[currentStep];
    if (outgoing && !outgoing.hidden) {
      outgoing.classList.remove('is-visible');
      outgoing.classList.add(direction > 0 ? 'is-leaving-forward' : 'is-leaving-back');
    }

    window.setTimeout(() => {
      for (const step of steps) {
        step.hidden = true;
        step.classList.remove('is-visible', 'is-leaving-forward', 'is-leaving-back');
        step.setAttribute('aria-hidden', 'true');
      }
      currentStep = index;
      const incoming = steps[currentStep];
      incoming.hidden = false;
      incoming.setAttribute('aria-hidden', 'false');
      incoming.classList.add('is-entering');
      window.scrollTo({ top: 0, behavior: 'instant' });
      window.requestAnimationFrame(() => {
        incoming.classList.remove('is-entering');
        incoming.classList.add('is-visible');
      });
      previousButton.hidden = currentStep === 0;
      if (progress) progress.textContent = `${currentStep + 1} / ${steps.length}`;
      page.dataset.ritualComplete = currentStep === steps.length - 1 ? 'true' : 'false';
      const heading = incoming.querySelector('h1, h2');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
    }, outgoing && !outgoing.hidden ? 420 : 0);
  }

  page.addEventListener('click', (event) => {
    const next = event.target.closest('[data-ritual-next]');
    if (next) showStep(currentStep + 1, 1);
    if (event.target.closest('[data-ritual-previous]')) showStep(currentStep - 1, -1);
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
      if (!product) {
        loading.hidden = true;
        errorPanel.hidden = false;
        return;
      }
      loading.hidden = true;
      content.hidden = false;
      showStep(0);
    })
    .catch(() => {
      loading.hidden = true;
      errorPanel.hidden = false;
    });
})();
