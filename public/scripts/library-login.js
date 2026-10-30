(() => {
  const form = document.querySelector('[data-library-login-form]');
  if (!form) return;

  const status = form.querySelector('[data-library-status]');
  const turnstileContainer = form.querySelector('[data-library-turnstile]');
  const submitButton = form.querySelector('button[type="submit"]');
  const emailInput = form.querySelector('input[name="email"]');
  const loginEndpoint = form.dataset.loginEndpoint || '/api/library/login';
  const defaultRedirect = form.dataset.defaultRedirect || '/library/';
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
    submitButton.disabled = true;
    setStatus('Signing you in…');

    const data = new FormData(form);
    const turnstileToken = testMode
      ? 'test-pass'
      : (widgetId !== null && window.turnstile ? window.turnstile.getResponse(widgetId) : '');

    try {
      const params = new URLSearchParams(window.location.search);
      const response = await fetch(loginEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          email: data.get('email'),
          password: data.get('password'),
          turnstileToken,
          destinationPath: params.get('next') || '',
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
      window.location.assign(result.redirect || defaultRedirect);
    } catch (error) {
      setStatus(error.message || 'The request could not be completed.', true);
    } finally {
      submitButton.disabled = false;
      if (!testMode && widgetId !== null && window.turnstile) window.turnstile.reset(widgetId);
    }
  });

  const params = new URLSearchParams(window.location.search);
  if (params.get('status') === 'invalid') {
    setStatus('That older email link has expired. Sign in below, or create a password if this is your first visit.', true);
  }
  if (params.get('status') === 'checkout') {
    setStatus('The checkout could not be confirmed. No library access was granted.', true);
  }
  if (params.get('status') === 'claim-used') {
    setStatus('That checkout link has already been used. Sign in below to open your rituals.', true);
  }
  if (params.get('status') === 'purchase') {
    setStatus('Your purchase is in My Library. Sign in to continue.');
  }
  if (params.get('status') === 'password-ready') {
    setStatus('Your password is ready. Sign in to continue.');
  }

  if (loginEndpoint === '/api/library/login') {
    fetch('/api/library/setup-context', { headers: { Accept: 'application/json' } })
      .then((response) => response.ok ? response.json() : null)
      .then((context) => { if (context?.email && emailInput && !emailInput.value) emailInput.value = context.email; })
      .catch(() => {});
  }
})();
