(() => {
  const page = document.querySelector('[data-library-account-setup]');
  if (!page) return;
  const createForm = page.querySelector('[data-account-create-form]');
  const resendForm = page.querySelector('[data-verification-resend-form]');
  const confirmation = page.querySelector('[data-account-confirmation]');
  const title = page.querySelector('[data-setup-title]');
  const intro = page.querySelector('[data-setup-intro]');
  const status = page.querySelector('[data-library-status]');
  const params = new URLSearchParams(window.location.search);
  const expired = params.get('status') === 'expired';
  let turnstileContainer = expired
    ? resendForm.querySelector('[data-resend-turnstile]')
    : createForm.querySelector('[data-library-turnstile]');
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
  const securityToken = () => testMode
    ? 'test-pass'
    : (widgetId !== null && window.turnstile ? window.turnstile.getResponse(widgetId) : '');
  const resetSecurity = () => {
    if (!testMode && widgetId !== null && window.turnstile) window.turnstile.reset(widgetId);
  };
  const showConfirmation = (result) => {
    createForm.hidden = true;
    resendForm.hidden = true;
    confirmation.hidden = false;
    title.textContent = result.message || 'Almost there! Please check your email.';
    intro.hidden = true;
    setStatus('');
  };

  if (expired) {
    createForm.hidden = true;
    resendForm.hidden = false;
    title.textContent = 'That verification link has expired.';
    intro.textContent = 'For your security, verification links expire after 24 hours. Enter your purchase email and we’ll send a new one.';
  }

  Promise.all([
    fetch('/api/library/config', { headers: { Accept: 'application/json' } }).then((response) => response.json()),
    fetch('/api/library/setup-context', { headers: { Accept: 'application/json' } })
      .then((response) => response.ok ? response.json() : null).catch(() => null),
  ]).then(async ([config, context]) => {
    testMode = Boolean(config.testMode);
    if (context?.email) {
      createForm.querySelector('input[name="email"]').value = context.email;
      resendForm.querySelector('input[name="email"]').value = context.email;
    }
    if (testMode) turnstileContainer.innerHTML = '<p class="library-test-mode">Local Turnstile test mode is active.</p>';
    else {
      if (!config.turnstileSiteKey) throw new Error('Turnstile is not configured.');
      await loadTurnstile(config.turnstileSiteKey);
    }
  }).catch(() => setStatus('The security check could not be loaded. Please try again.', true));

  createForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = createForm.querySelector('button[type="submit"]');
    const data = new FormData(createForm);
    const passwordError = window.TarotFlowerPasswordPolicy?.error(data.get('password'), data.get('confirmPassword'));
    if (passwordError) {
      setStatus(passwordError, true);
      return;
    }
    button.disabled = true;
    setStatus('Creating your account…');
    try {
      const response = await fetch('/api/library/account/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: data.get('email'), password: data.get('password'),
          confirmPassword: data.get('confirmPassword'), turnstileToken: securityToken(),
          destinationPath: params.get('next') || '' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Your account could not be created.');
      showConfirmation(result);
    } catch (error) {
      setStatus(error.message || 'Your account could not be created.', true);
      button.disabled = false;
      resetSecurity();
    }
  });

  resendForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = resendForm.querySelector('button[type="submit"]');
    button.disabled = true;
    setStatus('Sending a new verification email…');
    try {
      const response = await fetch('/api/library/account/resend-verification', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: new FormData(resendForm).get('email'), turnstileToken: securityToken() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'A new verification email could not be sent.');
      showConfirmation(result);
    } catch (error) {
      setStatus(error.message || 'A new verification email could not be sent.', true);
      button.disabled = false;
      resetSecurity();
    }
  });
})();
