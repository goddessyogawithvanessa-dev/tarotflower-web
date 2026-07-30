(() => {
  const shell = document.querySelector('[data-library-shell]');
  if (!shell) return;
  const loading = shell.querySelector('[data-library-loading]');
  const grid = shell.querySelector('[data-library-grid]');
  const empty = shell.querySelector('[data-library-empty]');
  const logoutButton = document.querySelector('[data-library-logout]');

  const escapeHtml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

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
      loading.hidden = true;
      if (!result.products.length) {
        empty.hidden = false;
        return;
      }
      grid.innerHTML = result.products.map((product) => `
        <article class="library-product">
          <img src="${escapeHtml(product.imagePath)}" alt="Artwork for ${escapeHtml(product.title)}" />
          <div class="library-product-copy">
            <p class="library-kicker">Owned ritual</p>
            <h2>${escapeHtml(product.title)}</h2>
            <p>${escapeHtml(product.description)}</p>
            <a class="shop-button" href="${escapeHtml(product.experiencePath)}">Enter the Ritual</a>
          </div>
        </article>
      `).join('');
      grid.hidden = false;
    })
    .catch(() => {
      loading.textContent = 'Your library could not be opened. Please request a new secure link.';
    });

  logoutButton?.addEventListener('click', async () => {
    logoutButton.disabled = true;
    try {
      await fetch('/api/library/logout', { method: 'POST', headers: { Accept: 'application/json' } });
    } finally {
      window.location.replace('/library/login/');
    }
  });
})();
