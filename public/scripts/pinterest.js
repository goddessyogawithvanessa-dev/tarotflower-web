(() => {
  if (window.TarotFlowerPinterest) return;
  const config = document.querySelector('[data-pinterest-tag]');
  const tagId = config?.dataset.pinterestTag;
  const key = 'tf_pinterest_consent_v1';
  let accepted = false;
  let started = false;
  const readCookie = () => document.cookie.split(';').map(c => c.trim())
    .find(c => c.startsWith('tf_pinterest_consent='))?.split('=')[1] || null;
  const read = () => {
    try { return localStorage.getItem(key) || readCookie(); } catch { return readCookie(); }
  };
  const configured = () => /^\d+$/.test(tagId || '');
  const allowed = () => accepted && !navigator.globalPrivacyControl && configured();
  const track = (event, data = {}) => {
    if (!allowed() || !started) return false;
    window.pintrk('track', event, data);
    return true;
  };
  const fireItem = { product_id: 'step-into-your-fire', product_name: 'Step Into Your Fire', product_quantity: 1 };
  const start = () => {
    if (!allowed() || started) return;
    started = true;
    if (!window.pintrk) {
      const pin = window.pintrk = function () { pin.queue.push(Array.from(arguments)); };
      pin.queue = []; pin.version = '3.0';
      const script = document.createElement('script');
      script.async = true; script.src = 'https://s.pinimg.com/ct/core.js';
      document.head.appendChild(script);
    }
    window.pintrk('setconsent', true);
    window.pintrk('load', tagId);
    window.pintrk('page');
    if (location.pathname.replace(/\/$/, '') === '/step-into-your-fire') {
      track('pagevisit', { line_items: [fireItem] });
    }
    // Only the server can issue a receipt after verifying a paid Stripe session.
    // Consume it on the public completion bridge so private library pages stay tracker-free.
    if (location.pathname.replace(/\/$/, '') === '/fire-purchase-complete') {
      fetch('/api/pinterest/fire-receipt', { credentials: 'same-origin', cache: 'no-store' })
        .then(r => r.ok ? r.json() : null).then(receipt => {
          if (!receipt?.event_id || !allowed()) return;
          const seen = 'tf_pin_purchase_' + receipt.event_id;
          try { if (sessionStorage.getItem(seen)) return; } catch { /* Stable event ID also enables Pinterest deduplication. */ }
          if (track('checkout', receipt)) {
            try { sessionStorage.setItem(seen, '1'); } catch { /* No personal data stored. */ }
            document.dispatchEvent(new CustomEvent('tf:pinterest-purchase'));
          }
        }).catch(() => { /* Tracking never blocks purchased access. */ });
    }
  };
  const clear = () => {
    const names = document.cookie.split(';').map(c => c.trim().split('=')[0]);
    names.filter(n => /^(_pin|_derived_epik|_epik|_pinterest|tf_pinterest)/.test(n)).forEach(name => {
      ['', location.hostname, '.tarotflower.com'].forEach(domain => {
        document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${domain ? '; Domain=' + domain : ''}`;
      });
    });
  };
  const choose = choice => {
    accepted = choice === 'accepted' && !navigator.globalPrivacyControl;
    try { localStorage.setItem(key, accepted ? 'accepted' : 'declined'); } catch { /* Page-only choice. */ }
    if (!accepted) clear();
    document.cookie = `tf_pinterest_consent=${accepted ? 'accepted' : 'declined'}; Max-Age=15552000; Path=/; Secure; SameSite=Lax`;
    if (accepted) start();
    else if (started) { window.pintrk('setconsent', false); location.reload(); }
  };
  window.TarotFlowerPinterest = {
    track,
    choose,
    isConfigured: configured,
    hasChoice: () => ['accepted','declined'].includes(read()) || !!navigator.globalPrivacyControl,
  };
  document.addEventListener('click', event => {
    const link = event.target.closest('a[data-pinterest-fire-checkout]');
    if (link && !link.hasAttribute('aria-disabled')) track('initiatecheckout', { line_items: [fireItem] });
  });
  document.addEventListener('tf:oracle-subscribed', () => track('lead', { lead_type: 'Sacred Becoming Oracle waitlist' }));
  accepted = read() === 'accepted' && !navigator.globalPrivacyControl;
  if (navigator.globalPrivacyControl) clear();
  start();
})();
