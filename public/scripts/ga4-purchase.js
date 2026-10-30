(() => {
  let started = false;

  const trackVerifiedPurchase = async () => {
    if (started || !window.__tfAnalyticsLoaded || typeof window.gtag !== 'function') return;
    started = true;
    try {
      const response = await fetch('/api/analytics/fire-receipt', {
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      });
      if (!response.ok) throw new Error('Purchase receipt unavailable');
      const purchase = await response.json();
      if (!purchase.transaction_id || !Number.isFinite(Number(purchase.value))
          || !/^[A-Z]{3}$/.test(String(purchase.currency || ''))) return;
      const seenKey = `tf_ga4_purchase_${purchase.transaction_id}`;
      try {
        if (window.sessionStorage.getItem(seenKey)) return;
        window.sessionStorage.setItem(seenKey, '1');
      } catch { /* GA4 also deduplicates repeated transaction IDs. */ }
      window.gtag('event', 'purchase', {
        transaction_id: purchase.transaction_id,
        value: Number(purchase.value),
        currency: purchase.currency,
        items: Array.isArray(purchase.items) ? purchase.items : [],
      });
      document.dispatchEvent(new CustomEvent('tf:ga4-purchase'));
    } catch {
      started = false;
    }
  };

  document.addEventListener('tf:analytics-ready', trackVerifiedPurchase, { once: true });
  trackVerifiedPurchase();
})();
