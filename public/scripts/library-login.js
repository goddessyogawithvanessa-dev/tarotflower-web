(() => {
  const form = document.querySelector('[data-library-login-form]');
  if (!form) return;

  const status = form.querySelector('[data-library-status]');
  const debugLink = form.querySelector('[data-library-debug-link]');
  const turnstileContainer = form.querySelector('[data-library-turnstile]');
  const submitButton = form.querySelector('button[type="submit"]');
  let widgetId = null;
  let testMode = false;

  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.classList.toggle('is-error', isError);
  };

  const loadTurnstile = (sitekey) => new Promise((resolve, reject) => {
    if (window.turnstile) {
      resolve(window.turnstile);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.dataset.turnstileApi = 'true';
    script.addEventListener('load', () => resolve(window.turnstile), { once: true });
    script.addEventListener('error', reject, { once: true });
    document.head.appendChild(script);
  }).then((turnstile) => {
    widgetId = turnstile.render(turnstileContainer, {
      sitekey,
      action: 'library_login',
      theme: 'light',
    });
  });

  fetch('/api/library/config', { headers: { Accept: 'application/json' } })
    .then((response) => response.json())
    .then((config) => {
      testMode = Boolean(config.testMode);
      if (testMode) {
        turnstileContainer.innerHTML = '<p class="library-test-mode">Local Turnstile test mode is active.</p>';
        return;
      }
      if (!config.turnstileSiteKey) throw new Error('Turnstile is not configured.');
      return loadTurnstile(config.turnstileSiteKey);
    })
    .catch(() => setStatus('The security check could not be loaded. Please try again.', true));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    debugLink.hidden = true;
    submitButton.disabled = true;
    setStatus('Preparing your secure link…');

    const email = new FormData(form).get('email');
    const turnstileToken = testMode
      ? 'test-pass'
      : (widgetId !== null && window.turnstile ? window.turnstile.getResponse(widgetId) : '');

    try {
      const response = await fetch('/api/library/request-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email, turnstileToken }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
      setStatus(result.message);
      if (result.debugMagicLink) {
        debugLink.href = result.debugMagicLink;
        debugLink.hidden = false;
      }
    } catch (error) {
      setStatus(error.message || 'The request could not be completed.', true);
    } finally {
      submitButton.disabled = false;
      if (!testMode && widgetId !== null && window.turnstile) window.turnstile.reset(widgetId);
    }
  });

  const params = new URLSearchParams(window.location.search);
  if (params.get('status') === 'invalid') {
    setStatus('That magic link has expired or has already been used. Request a new one below.', true);
  }
  if (params.get('status') === 'checkout') {
    setStatus('The checkout could not be confirmed. No library access was granted.', true);
  }
})();
