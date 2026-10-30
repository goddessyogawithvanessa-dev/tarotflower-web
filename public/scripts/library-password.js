(() => {
  const page = document.querySelector('[data-library-password-page]');
  if (!page) return;
  const purpose = page.dataset.purpose === 'reset' ? 'reset' : 'setup';
  const requestForm = page.querySelector('[data-password-request-form]');
  const setForm = page.querySelector('[data-password-set-form]');
  const status = page.querySelector('[data-library-status]');
  const intro = page.querySelector('[data-password-intro]');
  const turnstileContainer = page.querySelector('[data-library-turnstile]');
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token') || '';
  const requestEndpoint = page.dataset.passwordRequestEndpoint || '/api/library/password/request';
  const setEndpoint = page.dataset.passwordSetEndpoint || '/api/library/password/set';
  const defaultRedirect = page.dataset.defaultRedirect || '/library/';
  let widgetId = null;
  let testMode = false;

  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.classList.toggle('is-error', isError);
  };
  const loadTurnstile = (sitekey) => new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.addEventListener('load', () => resolve(window.turnstile), { once: true });
    script.addEventListener('error', reject, { once: true });
    document.head.appendChild(script);
  }).then((turnstile) => {
    widgetId = turnstile.render(turnstileContainer, { sitekey, action: 'library_login', theme: 'light' });
  });

  const configureRequest = async () => {
    const config = await fetch('/api/library/config', { headers: { Accept: 'application/json' } }).then((response) => response.json());
    testMode = Boolean(config.testMode);
    if (testMode) turnstileContainer.innerHTML = '<p class="library-test-mode">Local Turnstile test mode is active.</p>';
    else await loadTurnstile(config.turnstileSiteKey);
    const context = requestEndpoint === '/api/library/password/request'
      ? await fetch('/api/library/setup-context', { headers: { Accept: 'application/json' } })
        .then((response) => response.ok ? response.json() : null).catch(() => null)
      : null;
    const emailInput = requestForm?.querySelector('input[name="email"]');
    if (context?.email && emailInput) emailInput.value = context.email;
    if (params.get('status') === 'check-email') setStatus('Check your email and open the private setup link. It expires in 15 minutes.');
    if (params.get('status') === 'request') setStatus('Create a password to enter your purchased rituals.');
  };

  if (token && setForm) {
    requestForm.hidden = true;
    setForm.hidden = false;
    fetch(`/api/library/password/info?token=${encodeURIComponent(token)}`, { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'This private link is no longer valid.');
        if (result.purpose !== purpose) throw new Error('Please use the correct password email.');
        setForm.querySelector('input[name="email"]').value = result.email;
        intro.textContent = purpose === 'reset' ? 'Choose a new password for My Library.' : 'Your email is verified. Choose the password you’ll use for My Library.';
      })
      .catch((error) => {
        setForm.hidden = true;
        requestForm.hidden = false;
        setStatus(error.message, true);
        configureRequest().catch(() => setStatus('The security check could not be loaded. Please try again.', true));
      });
  } else {
    configureRequest().catch(() => setStatus('The security check could not be loaded. Please try again.', true));
  }

  requestForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = requestForm.querySelector('button[type="submit"]');
    button.disabled = true;
    setStatus('Preparing your private email…');
    const email = new FormData(requestForm).get('email');
    const turnstileToken = testMode ? 'test-pass' : (widgetId !== null && window.turnstile ? window.turnstile.getResponse(widgetId) : '');
    try {
      const response = await fetch(requestEndpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email, purpose, turnstileToken, destinationPath: params.get('next') || '' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
      setStatus(result.message);
    } catch (error) {
      setStatus(error.message || 'The request could not be completed.', true);
    } finally {
      button.disabled = false;
      if (!testMode && widgetId !== null && window.turnstile) window.turnstile.reset(widgetId);
    }
  });

  setForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = setForm.querySelector('button[type="submit"]');
    const data = new FormData(setForm);
    const passwordError = window.TarotFlowerPasswordPolicy?.error(data.get('password'), data.get('confirmPassword'));
    if (passwordError) {
      setStatus(passwordError, true);
      return;
    }
    button.disabled = true;
    setStatus('Saving your password…');
    try {
      const response = await fetch(setEndpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ token, password: data.get('password'), confirmPassword: data.get('confirmPassword'), destinationPath: params.get('next') || '' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Your password could not be saved.');
      window.location.assign(result.redirect || defaultRedirect);
    } catch (error) {
      setStatus(error.message || 'Your password could not be saved.', true);
      button.disabled = false;
    }
  });
})();
