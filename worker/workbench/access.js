export async function handleWorkbenchRequest(request, env) {
  if (!['GET', 'HEAD', 'POST'].includes(request.method)) {
    return workbenchResponse('Method not allowed.', 405, { allow: 'GET, HEAD, POST' });
  }

  if (!env.EMAIL_SERVICE?.fetch) {
    return workbenchResponse('The Workbench data service is unavailable.', 503);
  }

  const serviceUrl = new URL('https://email.internal/api/admin/campaign/review');
  let email = '';
  let actionNotice = '';
  if (request.method === 'POST') {
    const form = await request.formData();
    const action = String(form.get('action') || 'subscriber-search');
    if (action === 'newsletter-create') {
      const result = await env.EMAIL_SERVICE.fetch('https://email.internal/api/admin/newsletters/draft', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          subject: String(form.get('subject') || ''),
          preview_text: String(form.get('preview_text') || ''),
          html_template: String(form.get('html_template') || ''),
          text_template: String(form.get('text_template') || ''),
        }),
      });
      const payload = await result.json();
      actionNotice = result.ok ? 'Newsletter draft created. Review its preview and pre-send checks before approval.'
        : String(payload.error || 'The newsletter draft could not be created.');
    } else if (action === 'newsletter-approve') {
      const campaignId = encodeURIComponent(String(form.get('campaign_id') || ''));
      const result = await env.EMAIL_SERVICE.fetch(`https://email.internal/api/admin/newsletters/${campaignId}/approve`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
      });
      const payload = await result.json();
      actionNotice = result.ok
        ? `Campaign approved once: ${payload.eligibleRecipientCount} eligible subscriber(s) plus the automatic owner copy are queued.`
        : String(payload.error || 'The campaign could not be approved.');
    } else {
      email = String(form.get('email') || '').trim().toLowerCase();
    }
  }

  const [dashboard, emailOverview, newsletterOverview, libraryOverview] = await Promise.all([
    env.EMAIL_SERVICE.fetch(serviceUrl, {
      method: email ? 'POST' : 'GET',
      headers: email
        ? { accept: 'text/html', 'content-type': 'application/json' }
        : { accept: 'text/html' },
      body: email ? JSON.stringify({ email }) : undefined,
    }),
    env.EMAIL_SERVICE.fetch('https://email.internal/api/admin/business/overview', {
      method: 'GET',
      headers: { accept: 'application/json' },
    }),
    env.EMAIL_SERVICE.fetch('https://email.internal/api/admin/newsletters', {
      method: 'GET', headers: { accept: 'application/json' },
    }),
    loadLibraryOverview(env),
  ]);
  const contentType = dashboard.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    return workbenchResponse('The Workbench data service returned an unexpected response.', 502);
  }

  if (!emailOverview.ok || !String(emailOverview.headers.get('content-type') || '').includes('application/json')) {
    return workbenchResponse('The Workbench subscriber service returned an unexpected response.', 502);
  }
  if (!newsletterOverview.ok || !String(newsletterOverview.headers.get('content-type') || '').includes('application/json')) {
    return workbenchResponse('The Workbench newsletter service returned an unexpected response.', 502);
  }

  const source = await dashboard.text();
  const businessData = {
    library: libraryOverview,
    email: await emailOverview.json(),
    newsletters: await newsletterOverview.json(),
  };
  const html = decorateCampaignReview(source, businessData, actionNotice);
  const headers = new Headers(dashboard.headers);
  headers.set('content-type', 'text/html; charset=utf-8');
  headers.set('cache-control', 'private, no-store, max-age=0');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-frame-options', 'DENY');
  headers.set('referrer-policy', 'no-referrer');
  headers.set('x-robots-tag', 'noindex, nofollow, noarchive');

  return new Response(request.method === 'HEAD' ? null : html, {
    status: dashboard.status,
    headers,
  });
}

function decorateCampaignReview(source, businessData, actionNotice = '') {
  const businessOverview = businessOverviewHtml(businessData);
  return source
    .replace('<title>Tarot Flower Campaign Review</title>', '<title>Tarot Flower Workbench</title>')
    .replace(
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">\n  <meta name="robots" content="noindex, nofollow, noarchive">',
    )
    .replace(
      '</style>',
      `    html { scroll-behavior: smooth; }
    .workbench-header { display: flex; justify-content: space-between; gap: 1.5rem; align-items: flex-start; padding-bottom: 1.5rem; border-bottom: 1px solid #ead7cb; }
    .workbench-title { margin: 0; }
    .workbench-kicker { margin: 0 0 0.35rem; color: #8a2e25; font-size: 0.78rem; font-family: Arial, sans-serif; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; }
    .workbench-subtitle { margin: 0.45rem 0 0; color: #725c50; font-size: 1.05rem; }
    .workbench-nav { display: flex; gap: 0.6rem; flex-wrap: wrap; justify-content: flex-end; }
    .workbench-nav form { margin: 0; }
    .workbench-nav a, .workbench-nav button { display: inline-block; padding: 0.55rem 0.75rem; border: 1px solid #d8c3b8; color: #5f3b2e; background: #fff; text-decoration: none; font-family: Arial, sans-serif; font-size: 0.82rem; cursor: pointer; }
    .workbench-nav a:hover, .workbench-nav a:focus-visible, .workbench-nav button:hover, .workbench-nav button:focus-visible { border-color: #5f3b2e; outline: none; }
    .workbench-intro { max-width: 50rem; }
    .workbench-section { scroll-margin-top: 1rem; }
    .metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: 0.8rem; }
    .metric { background: #fff; border: 1px solid #ead7cb; padding: 1rem; }
    .metric-label { margin: 0; color: #725c50; font-family: Arial, sans-serif; font-size: 0.76rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
    .metric-value { display: block; margin-top: 0.25rem; color: #5f3b2e; font-size: 1.65rem; line-height: 1.15; }
    .status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr)); gap: 1rem; }
    .status-card { background: #fff; border: 1px solid #ead7cb; padding: 1rem; }
    .status-card h3 { margin-top: 0; }
    .status-label { display: inline-block; margin: 0 0 0.65rem; padding: 0.2rem 0.45rem; background: #f8eee8; color: #5f3b2e; font: 700 0.72rem Arial, sans-serif; letter-spacing: 0.05em; text-transform: uppercase; }
    .status-label--attention { background: #fce8e6; color: #8a2e25; }
    .status-label--connected { background: #eaf3e8; color: #355b32; }
    .compact-list { margin: 0.6rem 0 0; padding-left: 1.15rem; }
    .compact-list li + li { margin-top: 0.35rem; }
    .section-note { margin: -0.5rem 0 1rem; color: #725c50; }
    .source-state { font-family: Arial, sans-serif; font-size: 0.82rem; }
    .attention-panel { border-left: 4px solid #8a2e25; }
    .campaign-heading { margin-top: 3rem; padding-top: 2rem; border-top: 1px solid #ead7cb; }
    .table-scroll { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
    @media (max-width: 640px) {
      main { padding: 1.25rem 0.75rem 3rem; }
      .workbench-header { display: block; }
      .workbench-nav { justify-content: flex-start; margin-top: 1rem; }
      .grid { grid-template-columns: 1fr; }
      .metric-grid, .status-grid { grid-template-columns: 1fr; }
      h1 { font-size: 2rem; }
      table { min-width: 34rem; }
      .grid table { min-width: 0; }
      input { box-sizing: border-box; }
    }
  </style>`,
    )
    .replace(
      /\s*<main>\s*<h1>Campaign Review<\/h1>/,
      `  <main>
    <header class="workbench-header">
      <div>
        <p class="workbench-kicker">Private owner access</p>
        <h1 class="workbench-title">Tarot Flower Workbench</h1>
        <p class="workbench-subtitle">Campaign Review</p>
      </div>
      <nav class="workbench-nav" aria-label="Workbench navigation">
        <a href="#overview" aria-current="page">Overview</a>
        <a href="#fire-purchases">FIRE</a>
        <a href="#subscribers">Subscribers</a>
        <a href="#qa-debug">QA / Debug</a>
        <a href="#newsletter-campaigns">Newsletters</a>
        <form method="post" action="/api/workbench/logout"><button type="submit">Sign Out</button></form>
      </nav>
    </header>
    <p class="workbench-intro muted">A private view of the business systems connected to Tarot Flower, with campaign drafting and one-time approval controls.</p>
    ${actionNotice ? `<p class="status-card status-label--connected" role="status">${escapeHtml(actionNotice)}</p>` : ''}
    ${businessOverview}`,
    )
    .replace('<section>\n      <h2>Summary Counts</h2>', '<section id="email-campaigns" class="workbench-section campaign-heading">\n      <h2>Email Campaigns</h2>\n      <p class="section-note">Delivery reporting, campaign health, subscriber search, and individual subscriber details.</p>\n      <h3>Summary Counts</h3>')
    .replace('method="get" action="/api/admin/campaign/review"', 'method="post" action="/workbench/"')
    .replace('action="/api/admin/campaign/review"', 'action="/workbench/"');
}

async function loadLibraryOverview(env) {
  if (!env.LIBRARY_DB?.prepare) throw new Error('Library database is unavailable');
  const fireProductId = 'ritual-step-into-the-fire-test';
  const ownerEmail = String(env.WORKBENCH_OWNER_EMAIL || '').trim().toLowerCase();
  const productionPurchase = (alias = 'p') => `(${alias}.stripe_checkout_session_id LIKE 'cs_live_%'
    AND lower(${alias}.customer_email) <> ?2)`;
  const productionCustomer = (emailColumn) => `EXISTS (SELECT 1 FROM purchases p
    WHERE lower(p.customer_email)=lower(${emailColumn}) AND p.payment_status='paid'
      AND ${productionPurchase('p')})`;
  const [salesSummary, revenueRows, recentSales, entitlementSummary, customerSummary, activity,
    attention, oracleProducts, oracleOrders, purchaseClassifications] = await Promise.all([
    env.LIBRARY_DB.prepare(`SELECT COUNT(*) AS paid_sales,
      SUM(CASE WHEN purchased_at >= unixepoch() - 2592000 THEN 1 ELSE 0 END) AS sales_30d
      FROM purchases p WHERE product_id=?1 AND payment_status='paid' AND ${productionPurchase()}`).bind(fireProductId, ownerEmail).first(),
    env.LIBRARY_DB.prepare(`SELECT lower(currency) AS currency, SUM(amount_total) AS amount_total,
      SUM(CASE WHEN purchased_at >= unixepoch() - 2592000 THEN amount_total ELSE 0 END) AS amount_30d
      FROM purchases p WHERE product_id=?1 AND payment_status='paid' AND ${productionPurchase()}
      GROUP BY lower(currency) ORDER BY currency`).bind(fireProductId, ownerEmail).all(),
    env.LIBRARY_DB.prepare(`SELECT p.customer_email,p.purchased_at,p.amount_total,p.currency,p.payment_status,
      p.access_claimed_at,pr.title,
      CASE WHEN ${productionPurchase()} THEN 'production'
        WHEN lower(p.customer_email)=?2 OR p.stripe_checkout_session_id LIKE 'cs_test_%' THEN 'QA/test'
        ELSE 'review' END AS record_type,
      CASE WHEN e.customer_email IS NULL THEN 'missing' WHEN e.revoked_at IS NULL THEN 'active' ELSE 'revoked' END AS entitlement_status,
      CASE WHEN pae.sent_at IS NOT NULL THEN 'sent' WHEN pae.failed_at IS NOT NULL THEN 'failed' ELSE 'pending' END AS access_email_status
      FROM purchases p JOIN products pr ON pr.id=p.product_id
      LEFT JOIN entitlements e ON e.customer_email=p.customer_email AND e.product_id=p.product_id
      LEFT JOIN purchase_access_emails pae ON pae.stripe_checkout_session_id=p.stripe_checkout_session_id
      WHERE p.product_id=?1 ORDER BY p.purchased_at DESC LIMIT 25`).bind(fireProductId, ownerEmail).all(),
    env.LIBRARY_DB.prepare(`SELECT
      SUM(CASE WHEN e.revoked_at IS NULL THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN e.revoked_at IS NOT NULL THEN 1 ELSE 0 END) AS revoked
      FROM entitlements e JOIN purchases p ON p.stripe_checkout_session_id=e.source_checkout_session_id
      WHERE e.product_id=?1 AND ${productionPurchase()}`).bind(fireProductId, ownerEmail).first(),
    env.LIBRARY_DB.prepare(`SELECT COUNT(*) AS customers,
      SUM(CASE WHEN email_verified_at IS NOT NULL THEN 1 ELSE 0 END) AS verified,
      SUM(CASE WHEN created_at >= unixepoch() - 2592000 THEN 1 ELSE 0 END) AS new_30d,
      (SELECT COUNT(DISTINCT customer_email) FROM sessions
        WHERE last_seen_at >= unixepoch() - 2592000 AND ${productionCustomer('customer_email')}) AS active_30d
      FROM customers c WHERE ${productionCustomer('c.email')}`).bind(fireProductId, ownerEmail).first(),
    env.LIBRARY_DB.prepare(`SELECT s.customer_email,s.last_seen_at,s.auth_method,c.email_verified_at
      FROM sessions s JOIN customers c ON c.email=s.customer_email
      WHERE s.revoked_at IS NULL AND s.expires_at>unixepoch() AND ${productionCustomer('s.customer_email')}
      ORDER BY s.last_seen_at DESC LIMIT 15`).bind(fireProductId, ownerEmail).all(),
    env.LIBRARY_DB.prepare(`SELECT
      (SELECT COUNT(*) FROM purchase_access_emails pae JOIN purchases p USING(stripe_checkout_session_id)
        WHERE pae.sent_at IS NULL AND pae.failed_at IS NOT NULL AND ${productionPurchase()}) AS failed_access_emails,
      (SELECT COUNT(*) FROM purchase_access_emails pae JOIN purchases p USING(stripe_checkout_session_id)
        WHERE pae.sent_at IS NULL AND pae.failed_at IS NOT NULL AND NOT (${productionPurchase()})) AS test_failed_access_emails,
      (SELECT COUNT(*) FROM purchases p LEFT JOIN entitlements e ON e.customer_email=p.customer_email AND e.product_id=p.product_id
        WHERE p.payment_status='paid' AND e.customer_email IS NULL AND ${productionPurchase()}) AS missing_entitlements,
      (SELECT COUNT(*) FROM entitlements e JOIN purchases p ON p.stripe_checkout_session_id=e.source_checkout_session_id
        WHERE e.revoked_at IS NOT NULL AND ${productionPurchase()}) AS revoked_entitlements`).bind(fireProductId, ownerEmail).first(),
    env.LIBRARY_DB.prepare(`SELECT id,slug,title FROM products
      WHERE lower(id) LIKE '%oracle%' OR lower(slug) LIKE '%oracle%' OR lower(title) LIKE '%oracle%'`).all(),
    env.LIBRARY_DB.prepare(`SELECT p.customer_email,p.purchased_at,p.amount_total,p.currency,pr.title
      FROM purchases p JOIN products pr ON pr.id=p.product_id
      WHERE (lower(pr.id) LIKE '%oracle%' OR lower(pr.slug) LIKE '%oracle%' OR lower(pr.title) LIKE '%oracle%')
        AND p.payment_status='paid' AND ${productionPurchase()} ORDER BY p.purchased_at DESC LIMIT 25`).bind(fireProductId, ownerEmail).all(),
    env.LIBRARY_DB.prepare(`SELECT
      SUM(CASE WHEN ${productionPurchase()} THEN 1 ELSE 0 END) AS production,
      SUM(CASE WHEN lower(p.customer_email)=?2 OR p.stripe_checkout_session_id LIKE 'cs_test_%' THEN 1 ELSE 0 END) AS qa_test,
      SUM(CASE WHEN NOT (${productionPurchase()})
        AND lower(p.customer_email)<>?2 AND p.stripe_checkout_session_id NOT LIKE 'cs_test_%' THEN 1 ELSE 0 END) AS review
      FROM purchases p WHERE p.product_id=?1 AND p.payment_status='paid'`).bind(fireProductId, ownerEmail).first(),
  ]);
  return {
    salesSummary: salesSummary || {},
    revenue: revenueRows.results || [],
    recentSales: recentSales.results || [],
    entitlements: entitlementSummary || {},
    customers: customerSummary || {},
    activity: activity.results || [],
    attention: attention || {},
    oracleProducts: oracleProducts.results || [],
    oracleOrders: oracleOrders.results || [],
    purchaseClassifications: purchaseClassifications || {},
  };
}

function businessOverviewHtml(data) {
  const library = data.library || {};
  const email = data.email || {};
  const newsletters = data.newsletters || {};
  const failedDeliveries = number(email.attention?.activeProductionFailedDeliveries);
  const historicalProductionFailures = number(email.attention?.historicalProductionFailedDeliveries);
  const testDeliveryFailures = number(email.attention?.testFailedDeliveries);
  const failedAccessEmails = number(library.attention?.failed_access_emails);
  const testAccessEmailFailures = number(library.attention?.test_failed_access_emails);
  const missingEntitlements = number(library.attention?.missing_entitlements);
  const attentionTotal = failedDeliveries + failedAccessEmails + missingEntitlements;
  const revenue = (library.revenue || []).map((row) => money(row.amount_total, row.currency)).join(' + ') || '—';
  const recentRevenue = (library.revenue || []).map((row) => money(row.amount_30d, row.currency)).join(' + ') || '—';
  const oracleConnected = (library.oracleProducts || []).length > 0;
  return `
    <section id="overview" class="workbench-section">
      <h2>Business Overview</h2>
      <div class="metric-grid">
        ${metric('FIRE sales', number(library.salesSummary?.paid_sales), `${number(library.salesSummary?.sales_30d)} in the last 30 days`)}
        ${metric('FIRE revenue', revenue, `${recentRevenue} in the last 30 days`)}
        ${metric('New leads', number(email.summary?.newLeads30d), 'First-time subscribers in the last 30 days')}
        ${metric('Customer activity', number(library.customers?.active_30d), 'Library customers active in the last 30 days')}
        ${metric('Needs attention', attentionTotal, 'Failed deliveries or missing access records')}
      </div>
    </section>

    <section class="workbench-section">
      <h2>Needs Attention</h2>
      <div class="panel attention-panel">
        <ul class="compact-list">
          <li><strong>${failedDeliveries}</strong> active production campaign email failures from the last 30 days.</li>
          <li><strong>${failedAccessEmails}</strong> failed customer access emails.</li>
          <li><strong>${missingEntitlements}</strong> paid purchases without an entitlement record.</li>
          <li class="muted"><strong>${historicalProductionFailures}</strong> older production and <strong>${testDeliveryFailures + testAccessEmailFailures}</strong> QA/test email failures remain available for troubleshooting and are excluded from this total.</li>
          <li>Contact, reading, and mentorship requests cannot appear here because those systems do not persist inquiries in a connected database.</li>
        </ul>
      </div>
    </section>

    <section id="newsletter-campaigns" class="workbench-section">
      <h2>Newsletter Campaigns</h2>
      <p class="section-note">Create a draft, preview it, then approve the entire eligible audience once. Approval queues automatic batched delivery; it does not require per-recipient approval.</p>
      <div class="status-grid">
        ${connectionCard('Sender identity', newsletters.sender?.authenticationVerified ? 'Verified' : 'Blocked', `${newsletters.sender?.from || 'Not configured'} · Reply-To ${newsletters.sender?.replyTo || 'not configured'}`)}
        ${connectionCard('Delivery reporting', 'Acceptance only', 'Gmail SMTP acceptance is recorded. Inbox placement, bounces, and complaints are not claimed without provider evidence.')}
        ${connectionCard('Tracking', 'Disabled', 'No tracking pixel and no click rewriting. Open/click tracking requires a separate privacy decision.')}
      </div>
      <h3>Prepare a Newsletter</h3>
      <form method="post" action="/workbench/" class="panel">
        <input type="hidden" name="action" value="newsletter-create">
        <label>Subject<br><input name="subject" maxlength="200" required style="width:100%"></label><br><br>
        <label>Preview text<br><input name="preview_text" maxlength="300" style="width:100%"></label><br><br>
        <label>Approved HTML (must include {{unsubscribe_url}})<br><textarea name="html_template" rows="12" required style="width:100%;box-sizing:border-box"></textarea></label><br><br>
        <label>Approved plain text (must include {{unsubscribe_url}})<br><textarea name="text_template" rows="8" required style="width:100%;box-sizing:border-box"></textarea></label><br><br>
        <button type="submit">Create Draft</button>
      </form>
      <h3>Campaign History</h3>
      ${newsletterCampaignTable(newsletters.campaigns || [])}
    </section>

    <section id="fire-purchases" class="workbench-section">
      <h2>FIRE Purchases</h2>
      <p class="section-note">Source: production Tarot Flower Library database. Amounts are payment totals recorded by the FIRE Stripe webhook.</p>
      ${htmlTable(
        ['customer', 'record', 'purchase date', 'amount', 'payment', 'entitlement', 'access email', 'access claimed'],
        library.recentSales || [],
        [
          (row) => row.customer_email,
          (row) => row.record_type,
          (row) => dateTime(row.purchased_at),
          (row) => money(row.amount_total, row.currency),
          (row) => row.payment_status,
          (row) => row.entitlement_status,
          (row) => row.access_email_status,
          (row) => row.access_claimed_at ? dateTime(row.access_claimed_at) : 'not yet',
        ],
      )}
      <h3>Recent Library Activity</h3>
      ${htmlTable(
        ['customer', 'last active', 'sign-in method', 'account'],
        library.activity || [],
        [
          (row) => row.customer_email,
          (row) => dateTime(row.last_seen_at),
          (row) => row.auth_method,
          (row) => row.email_verified_at ? 'verified' : 'not verified',
        ],
      )}
    </section>

    <section id="oracle" class="workbench-section">
      <h2>Sacred Becoming Oracle</h2>
      <div class="metric-grid">
        ${metric('Waitlist signups', number(email.summary?.oracleWaitlist), 'Connected to the subscriber database')}
        ${metric('Actual orders', oracleConnected ? number(library.oracleOrders?.length) : 'Not connected', oracleConnected ? 'Connected Library product' : 'No Oracle checkout is implemented')}
      </div>
      <h3>Recent Waitlist Activity</h3>
      ${htmlTable(
        ['email', 'name', 'status', 'source', 'joined'],
        email.oracleWaitlist || [],
        [row => row.email, row => row.first_name || '—', row => row.status, row => row.source_path, row => dateTime(row.consented_at)],
      )}
      <div class="status-card">
        <span class="status-label ${oracleConnected ? 'status-label--connected' : ''}">${oracleConnected ? 'Connected' : 'Not implemented'}</span>
        <h3>Oracle orders</h3>
        <p>${oracleConnected
          ? 'A registered Oracle product was found in the Library database; recorded paid orders are shown above.'
          : 'The Oracle is currently a waitlist offering. No Oracle product or order pipeline exists in the Library database, so zero orders would be misleading.'}</p>
      </div>
    </section>

    <section id="services" class="workbench-section">
      <h2>Readings &amp; Mentorship</h2>
      <div class="status-grid">
        ${connectionCard('Tarot readings', 'Payment link exists · Not connected',
          'The public booking page sends customers to a $100 Stripe Payment Link. Those payments are not written to the Tarot Flower Library database, and no booking or scheduling records are stored here.')}
        ${connectionCard('Sacred Becoming Mentorship', 'Payment link exists · Not connected',
          'The mentorship page sends customers to a $2,500 Stripe Payment Link. Those payments are not written to the Library database, and no application or session records are stored here.')}
        ${connectionCard('Contact inquiries', 'Email only · Not retained',
          'Tarot Flower contact submissions are sent to vanessa@tarotflower.com. The message is not persisted, so the Workbench cannot list or count inquiries.')}
      </div>
    </section>

    <section id="subscribers" class="workbench-section">
      <h2>Subscribers</h2>
      <p class="section-note">People may appear in more than one segment when they have given consent for multiple offerings.</p>
      <div class="metric-grid">
        ${metric('Newsletter', number(email.summary?.newsletter), 'Tarot Flower newsletter consent')}
        ${metric('Goddess Guide', number(email.summary?.goddessGuide), 'Guide leads and welcome sequence')}
        ${metric('Oracle Waitlist', number(email.summary?.oracleWaitlist), 'Oracle launch updates')}
        ${metric('All active', number(email.summary?.activeSubscribers), 'Unique active subscriber records')}
      </div>
      <h3>Recent Signup Activity</h3>
      ${htmlTable(
        ['email', 'name', 'segment', 'source', 'consented'],
        email.recentSignups || [],
        [row => row.email, row => row.first_name || '—', row => segmentName(row.lead_magnet_slug), row => row.source_path, row => dateTime(row.consented_at)],
      )}
      <h3>Newsletter Send Audience</h3>
      <p class="section-note">Read-only selection preview. Requires an active subscriber, explicit Tarot Flower newsletter consent, the newsletter segment tag, and production classification. Results are unique by subscriber.</p>
      ${htmlTable(
        ['email', 'name', 'status'],
        email.newsletterAudience || [],
        [row => row.email, row => row.first_name || '—', row => row.status],
      )}
    </section>

    <section id="qa-debug" class="workbench-section">
      <h2>QA / Debugging</h2>
      <p class="section-note">Historical QA and test records remain available here for troubleshooting but are excluded from production counts, recent activity, audience selection, and campaign metrics.</p>
      <div class="metric-grid">
        ${metric('Subscriber QA', classificationCount(email.qaDebug?.classifications, 'qa'), 'Explicitly classified QA records')}
        ${metric('Subscriber tests', classificationCount(email.qaDebug?.classifications, 'test'), 'Explicitly classified automated or development tests')}
        ${metric('Needs review', classificationCount(email.qaDebug?.classifications, 'review') + number(library.purchaseClassifications?.review), 'Unclassified subscriber or purchase records')}
        ${metric('FIRE QA / tests', number(library.purchaseClassifications?.qa_test), 'Excluded from production FIRE KPIs')}
      </div>
      <h3>Subscriber QA / Test Records</h3>
      ${htmlTable(
        ['email', 'name', 'status', 'classification', 'reason', 'created'],
        email.qaDebug?.records || [],
        [row => row.email, row => row.first_name || '—', row => row.status, row => row.classification, row => row.reason_code, row => dateTime(row.created_at)],
      )}
    </section>

    <section id="notifications" class="workbench-section">
      <h2>Owner Notifications</h2>
      <div class="status-grid">
        ${notificationCard('Contact forms', 'Enabled', 'New Tarot Flower and Goddess Yoga Retreats inquiries are emailed to vanessa@tarotflower.com.')}
        ${notificationCard('Oracle waitlist', 'Enabled for a new enrollment', 'A new Oracle enrollment generates an owner email. Repeat signups do not create duplicate alerts.')}
        ${notificationCard('Newsletter & Goddess Guide', 'Missing', 'Signups are saved and enrolled, but no owner notification is sent.')}
        ${notificationCard('FIRE purchases', 'Missing in Tarot Flower code', 'Customers receive access email. The application does not send a separate owner purchase alert; Stripe account notifications are outside this codebase.')}
        ${notificationCard('Readings & mentorship', 'Stripe-dependent', 'The site has no owner notification or database record for these Payment Links. Any alert currently depends on Stripe account settings.')}
      </div>
    </section>`;
}

function metric(label, value, detail) {
  return `<div class="metric"><p class="metric-label">${escapeHtml(label)}</p><strong class="metric-value">${escapeHtml(value)}</strong><span class="muted">${escapeHtml(detail)}</span></div>`;
}

function newsletterCampaignTable(campaigns) {
  if (!campaigns.length) return '<p class="muted">No newsletter campaigns have been created.</p>';
  return `<div class="table-scroll" tabindex="0"><table><thead><tr>
    <th>subject</th><th>created / sent</th><th>status</th><th>subscribers</th><th>accepted</th>
    <th>failed</th><th>unsubscribes</th><th>bounces</th><th>complaints</th><th>owner copy</th><th>actions</th>
  </tr></thead><tbody>${campaigns.map((campaign) => `<tr>
    <td>${escapeHtml(campaign.subject)}</td>
    <td>${escapeHtml(dateTime(campaign.approved_at || campaign.created_at))}</td>
    <td>${escapeHtml(campaign.status)}</td>
    <td>${escapeHtml(number(campaign.eligible_recipient_count))}</td>
    <td>${escapeHtml(number(campaign.provider_accepted_count))} <span class="muted">provider-accepted</span></td>
    <td>${escapeHtml(number(campaign.failed_count))}</td>
    <td>${escapeHtml(number(campaign.unsubscribe_count))}</td>
    <td>${escapeHtml(number(campaign.bounce_count))} <span class="muted">not available</span></td>
    <td>${escapeHtml(number(campaign.complaint_count))} <span class="muted">not available</span></td>
    <td>${escapeHtml(campaign.owner_copy_status)}</td>
    <td><a href="/workbench/newsletters/${encodeURIComponent(campaign.id)}/preview/" target="_blank" rel="noopener">Preview</a>
      ${campaign.status === 'draft' ? `<form method="post" action="/workbench/" style="display:inline">
        <input type="hidden" name="action" value="newsletter-approve">
        <input type="hidden" name="campaign_id" value="${escapeHtml(campaign.id)}">
        <button type="submit">Approve Entire Campaign Once</button>
      </form>` : ''}</td>
  </tr>`).join('')}</tbody></table></div>`;
}

function connectionCard(title, status, description) {
  return `<div class="status-card"><span class="status-label">${escapeHtml(status)}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p></div>`;
}

function notificationCard(title, status, description) {
  const attention = status === 'Missing';
  return `<div class="status-card"><span class="status-label ${attention ? 'status-label--attention' : ''}">${escapeHtml(status)}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p></div>`;
}

function htmlTable(headers, rows, valueReaders) {
  if (!rows.length) return '<p class="muted">No connected records found.</p>';
  return `<div class="table-scroll" tabindex="0"><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${valueReaders.map((reader) => `<td>${escapeHtml(reader(row))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function money(minorAmount, currency) {
  const amount = Number(minorAmount || 0) / 100;
  const code = String(currency || 'usd').toUpperCase();
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(amount); }
  catch { return `${amount.toFixed(2)} ${code}`; }
}

function dateTime(value) {
  if (value === null || value === undefined || value === '') return '—';
  const numeric = Number(value);
  const date = Number.isFinite(numeric) && String(value).match(/^\d+$/)
    ? new Date(numeric * 1000)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC';
}

function segmentName(value) {
  return ({
    'tarot-newsletter': 'Newsletter',
    'goddess-embodiment-guide': 'Goddess Guide',
    'oracle-waitlist': 'Oracle Waitlist',
  })[value] || value || 'Other';
}

function number(value) {
  const result = Number(value || 0);
  return Number.isFinite(result) ? result : 0;
}

function classificationCount(rows, classification) {
  const row = (rows || []).find((entry) => entry.classification === classification);
  return number(row?.count);
}

function escapeHtml(value) {
  return String(value ?? '—')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function workbenchResponse(message, status, extraHeaders = {}) {
  return new Response(message, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'private, no-store, max-age=0',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'x-robots-tag': 'noindex, nofollow, noarchive',
      ...extraHeaders,
    },
  });
}
