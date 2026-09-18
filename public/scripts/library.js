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

  const renderProduct = (product) => {
    const isFire = product.slug === 'step-into-your-fire';
    if (isFire) {
      return `
        <article class="library-experience library-experience--fire" data-experience-type="ritual" data-access-status="permanent">
          <div class="library-experience-image">
            <img src="${escapeHtml(product.imagePath)}" alt="Step Into Your Fire ritual artwork" />
          </div>
          <div class="library-experience-copy">
            <p class="library-fire-title">Step Into Your Fire</p>
            <h2>Become the Warrior Goddess</h2>
            <p class="library-experience-description">A ritual for courage &amp; confidence</p>
            <p class="library-experience-status"><span aria-hidden="true">∞</span> Yours <b aria-hidden="true">·</b> Permanent access</p>
            <a class="library-primary-button" href="${escapeHtml(product.experiencePath)}">Enter the Ritual</a>
          </div>
        </article>
      `;
    }

    return `
      <article class="library-experience" data-experience-type="owned" data-access-status="owned">
        <div class="library-experience-image">
          <img src="${escapeHtml(product.imagePath)}" alt="Artwork for ${escapeHtml(product.title)}" />
        </div>
        <div class="library-experience-copy">
          <p class="library-experience-eyebrow">Owned experience</p>
          <h2>${escapeHtml(product.title)}</h2>
          <p class="library-experience-description">${escapeHtml(product.description)}</p>
          <p class="library-experience-status">Yours</p>
          <a class="library-primary-button" href="${escapeHtml(product.experiencePath)}">Open Experience</a>
        </div>
      </article>
    `;
  };

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
      grid.innerHTML = result.products.map(renderProduct).join('');
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
