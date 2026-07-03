const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(request) });
    }

    try {
      if (request.method === 'POST' && url.pathname.endsWith('/subscribe')) {
        return withCors(request, await subscribe(request, env, ctx));
      }

      if (request.method === 'GET' && url.pathname.endsWith('/confirm')) {
        return await confirmSubscriber(url, env, ctx);
      }

      if (request.method === 'GET' && url.pathname.endsWith('/unsubscribe')) {
        return unsubscribePage(url);
      }

      if (request.method === 'POST' && url.pathname.endsWith('/unsubscribe')) {
        return withCors(request, await unsubscribe(request, env));
      }

      if (url.pathname.endsWith('/admin/subscribers')) {
        requireAdmin(request, env);
        return withCors(request, await listSubscribers(env));
      }

      if (request.method === 'POST' && url.pathname.endsWith('/admin/newsletter')) {
        requireAdmin(request, env);
        return withCors(request, await queueNewsletter(request, env, ctx));
      }

      return json({ error: 'Not found' }, 404);
    } catch (error) {
      const status = error.status || 500;
      return withCors(request, json({ error: error.message || 'Unexpected error' }, status));
    }
  },

  async queue(batch, env) {
    for (const message of batch.messages) {
      await processEmailJob(message.body, env);
      message.ack();
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(queueDueSequenceSteps(env));
  },
};

async function subscribe(request, env, ctx) {
  const body = await readBody(request);
  const email = normalizeEmail(body.email);
  if (!email) return json({ error: 'Please enter a valid email address.' }, 400);

  const firstName = cleanText(body.first_name, 80);
  const leadMagnet = cleanText(body.lead_magnet, 80) || 'first-3-card-pull';
  const sourcePath = cleanText(body.source_path, 240) || '/';
  const now = new Date().toISOString();
  const existing = await findSubscriberByEmail(env, email);
  const subscriber = existing || {
    id: crypto.randomUUID(),
    email,
    confirm_token: token(),
    unsubscribe_token: token(),
  };

  await env.DB.prepare(`
    INSERT INTO subscribers (
      id, email, first_name, status, source_path, lead_magnet_slug,
      confirm_token, unsubscribe_token, consent_ip, consent_user_agent,
      consented_at, created_at, updated_at
    ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      first_name = excluded.first_name,
      source_path = excluded.source_path,
      lead_magnet_slug = excluded.lead_magnet_slug,
      consent_ip = excluded.consent_ip,
      consent_user_agent = excluded.consent_user_agent,
      consented_at = excluded.consented_at,
      updated_at = excluded.updated_at
  `).bind(
    subscriber.id,
    email,
    firstName,
    sourcePath,
    leadMagnet,
    subscriber.confirm_token,
    subscriber.unsubscribe_token,
    request.headers.get('cf-connecting-ip') || '',
    request.headers.get('user-agent') || '',
    now,
    now,
    now
  ).run();

  await tagSubscriber(env, subscriber.id, `lead:${leadMagnet}`);
  await recordEvent(env, subscriber.id, 'subscribed', { sourcePath, leadMagnet });

  ctx.waitUntil(sendConfirmation(env, subscriber.id));

  return json({
    ok: true,
    message: 'Almost there. Check your inbox to confirm your email and receive the guide.',
  });
}

async function confirmSubscriber(url, env, ctx) {
  const confirmToken = url.searchParams.get('token') || '';
  const subscriber = await env.DB.prepare(
    'SELECT * FROM subscribers WHERE confirm_token = ? LIMIT 1'
  ).bind(confirmToken).first();

  if (!subscriber) {
    return htmlPage('Confirmation link expired', 'This confirmation link was not found.');
  }

  const now = new Date().toISOString();
  await env.DB.prepare(`
    UPDATE subscribers
    SET status = 'active', confirmed_at = COALESCE(confirmed_at, ?), updated_at = ?
    WHERE id = ?
  `).bind(now, now, subscriber.id).run();

  await recordEvent(env, subscriber.id, 'confirmed', {});
  await enrollWelcomeSequence(env, subscriber.id);
  ctx.waitUntil(queueLeadMagnetDelivery(env, subscriber.id));

  return htmlPage(
    'You are confirmed',
    'Your free tarot guide is on its way. You can close this page now.'
  );
}

function unsubscribePage(url) {
  const tokenParam = escapeHtml(url.searchParams.get('token') || '');
  return new Response(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Unsubscribe</title></head>
<body>
  <main style="font-family: Georgia, serif; max-width: 680px; margin: 48px auto; padding: 0 20px;">
    <h1>Unsubscribe</h1>
    <p>Confirm below and you will stop receiving Tarot Flower emails.</p>
    <form method="post" action="/api/email/unsubscribe">
      <input type="hidden" name="token" value="${tokenParam}">
      <button type="submit">Unsubscribe me</button>
    </form>
  </main>
</body>
</html>`, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

async function unsubscribe(request, env) {
  const body = await readBody(request);
  const unsubscribeToken = body.token || '';
  const now = new Date().toISOString();
  const result = await env.DB.prepare(`
    UPDATE subscribers
    SET status = 'unsubscribed', unsubscribed_at = ?, updated_at = ?
    WHERE unsubscribe_token = ?
  `).bind(now, now, unsubscribeToken).run();

  if (!result.meta.changes) return json({ error: 'Unsubscribe link was not found.' }, 404);
  return json({ ok: true, message: 'You have been unsubscribed.' });
}

async function listSubscribers(env) {
  const rows = await env.DB.prepare(`
    SELECT email, first_name, status, source_path, lead_magnet_slug, consented_at, confirmed_at, unsubscribed_at
    FROM subscribers
    ORDER BY created_at DESC
    LIMIT 1000
  `).all();
  return json({ subscribers: rows.results || [] });
}

async function queueNewsletter(request, env, ctx) {
  const body = await request.json();
  const subject = cleanText(body.subject, 180);
  const html = String(body.html || '');
  const text = String(body.text || '');
  if (!subject || !html || !text) return json({ error: 'Subject, html, and text are required.' }, 400);

  const broadcastId = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO broadcasts (id, subject, html, text, status, created_at, queued_at)
    VALUES (?, ?, ?, ?, 'queued', ?, ?)
  `).bind(broadcastId, subject, html, text, new Date().toISOString(), new Date().toISOString()).run();

  const subscribers = await env.DB.prepare(
    "SELECT id FROM subscribers WHERE status = 'active'"
  ).all();

  for (const subscriber of subscribers.results || []) {
    ctx.waitUntil(env.EMAIL_QUEUE.send({
      type: 'broadcast',
      subscriberId: subscriber.id,
      subject,
      html,
      text,
    }));
  }

  return json({ ok: true, broadcast_id: broadcastId, queued: subscribers.results?.length || 0 });
}

async function sendConfirmation(env, subscriberId) {
  const subscriber = await findSubscriberById(env, subscriberId);
  if (!subscriber || subscriber.status === 'unsubscribed') return;

  const confirmUrl = `${env.SITE_URL}/api/email/confirm?token=${subscriber.confirm_token}`;
  await sendEmail(env, subscriber, {
    jobType: 'confirmation',
    subject: 'Confirm your Tarot Flower email',
    html: renderTemplate('<p>Please confirm your email to receive your free guide:</p><p><a href="{{confirm_url}}">Confirm my email</a></p>', { confirm_url: confirmUrl }),
    text: renderTemplate('Please confirm your email to receive your free guide:\n\n{{confirm_url}}', { confirm_url: confirmUrl }),
  });
}

async function queueLeadMagnetDelivery(env, subscriberId) {
  const subscriber = await findSubscriberById(env, subscriberId);
  if (!subscriber || subscriber.status !== 'active') return;

  const leadMagnet = await env.DB.prepare(
    'SELECT * FROM lead_magnets WHERE slug = ? LIMIT 1'
  ).bind(subscriber.lead_magnet_slug || 'first-3-card-pull').first();
  const downloadUrl = `${env.LEAD_MAGNET_BUCKET_URL}/${leadMagnet?.file_key || 'lead-magnets/first-3-card-pull.pdf'}`;

  await env.EMAIL_QUEUE.send({
    type: 'lead_magnet',
    subscriberId,
    subject: leadMagnet?.delivery_subject || 'Your free Tarot Flower guide',
    html: '<p>Your free tarot guide is ready: <a href="{{lead_magnet_url}}">download it here</a>.</p>',
    text: 'Your free tarot guide is ready: {{lead_magnet_url}}',
    context: { lead_magnet_url: downloadUrl },
  });
}

async function enrollWelcomeSequence(env, subscriberId) {
  const tags = await env.DB.prepare(
    'SELECT tag FROM subscriber_tags WHERE subscriber_id = ?'
  ).bind(subscriberId).all();
  const tagNames = new Set((tags.results || []).map((row) => row.tag));

  const sequences = await env.DB.prepare(
    'SELECT * FROM email_sequences WHERE is_active = 1'
  ).all();

  for (const sequence of sequences.results || []) {
    if (!tagNames.has(sequence.trigger_tag)) continue;
    const steps = await env.DB.prepare(
      'SELECT * FROM email_sequence_steps WHERE sequence_id = ? ORDER BY step_order'
    ).bind(sequence.id).all();

    for (const step of steps.results || []) {
      const dueAt = new Date(Date.now() + step.delay_hours * 60 * 60 * 1000).toISOString();
      await env.DB.prepare(`
        INSERT OR IGNORE INTO subscriber_sequence_steps (subscriber_id, step_id, due_at)
        VALUES (?, ?, ?)
      `).bind(subscriberId, step.id, dueAt).run();
    }
  }
}

async function queueDueSequenceSteps(env) {
  const due = await env.DB.prepare(`
    SELECT sss.subscriber_id, sss.step_id, ess.subject, ess.html_template, ess.text_template
    FROM subscriber_sequence_steps sss
    JOIN email_sequence_steps ess ON ess.id = sss.step_id
    JOIN subscribers s ON s.id = sss.subscriber_id
    WHERE sss.status = 'pending' AND sss.due_at <= ? AND s.status = 'active'
    LIMIT 100
  `).bind(new Date().toISOString()).all();

  for (const row of due.results || []) {
    await env.EMAIL_QUEUE.send({
      type: 'sequence',
      subscriberId: row.subscriber_id,
      stepId: row.step_id,
      subject: row.subject,
      html: row.html_template,
      text: row.text_template,
    });
    await env.DB.prepare(`
      UPDATE subscriber_sequence_steps SET status = 'queued' WHERE subscriber_id = ? AND step_id = ?
    `).bind(row.subscriber_id, row.step_id).run();
  }
}

async function processEmailJob(job, env) {
  const subscriber = await findSubscriberById(env, job.subscriberId);
  if (!subscriber || subscriber.status !== 'active') return;

  const leadMagnetUrl = `${env.LEAD_MAGNET_BUCKET_URL}/lead-magnets/first-3-card-pull.pdf`;
  const context = {
    first_name: subscriber.first_name || 'beautiful soul',
    lead_magnet_url: leadMagnetUrl,
    unsubscribe_url: `${env.SITE_URL}/api/email/unsubscribe?token=${subscriber.unsubscribe_token}`,
    ...(job.context || {}),
  };

  await sendEmail(env, subscriber, {
    jobType: job.type,
    subject: job.subject,
    html: renderTemplate(job.html, context) + unsubscribeFooter(context.unsubscribe_url),
    text: renderTemplate(job.text, context) + `\n\nUnsubscribe: ${context.unsubscribe_url}`,
  });

  if (job.stepId) {
    await env.DB.prepare(`
      UPDATE subscriber_sequence_steps
      SET status = 'sent', sent_at = ?
      WHERE subscriber_id = ? AND step_id = ?
    `).bind(new Date().toISOString(), subscriber.id, job.stepId).run();
  }
}

async function sendEmail(env, subscriber, email) {
  const jobId = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO email_jobs (id, subscriber_id, job_type, subject, html, text)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(jobId, subscriber.id, email.jobType, email.subject, email.html, email.text).run();

  await env.EMAIL.send({
    to: subscriber.email,
    from: env.EMAIL_FROM,
    replyTo: env.EMAIL_REPLY_TO,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });

  await env.DB.prepare(`
    UPDATE email_jobs SET status = 'sent', sent_at = ? WHERE id = ?
  `).bind(new Date().toISOString(), jobId).run();
  await recordEvent(env, subscriber.id, 'email_sent', { jobType: email.jobType, subject: email.subject });
}

async function readBody(request) {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return await request.json();
  const formData = await request.formData();
  return Object.fromEntries(formData.entries());
}

async function findSubscriberByEmail(env, email) {
  return await env.DB.prepare('SELECT * FROM subscribers WHERE email = ? LIMIT 1').bind(email).first();
}

async function findSubscriberById(env, id) {
  return await env.DB.prepare('SELECT * FROM subscribers WHERE id = ? LIMIT 1').bind(id).first();
}

async function tagSubscriber(env, subscriberId, tag) {
  await env.DB.prepare(
    'INSERT OR IGNORE INTO subscriber_tags (subscriber_id, tag) VALUES (?, ?)'
  ).bind(subscriberId, tag).run();
}

async function recordEvent(env, subscriberId, eventType, metadata) {
  await env.DB.prepare(`
    INSERT INTO subscriber_events (id, subscriber_id, event_type, metadata_json)
    VALUES (?, ?, ?, ?)
  `).bind(crypto.randomUUID(), subscriberId, eventType, JSON.stringify(metadata || {})).run();
}

function requireAdmin(request, env) {
  const expected = env.ADMIN_TOKEN;
  const actual = request.headers.get('authorization') || '';
  if (!expected || actual !== `Bearer ${expected}`) {
    const error = new Error('Unauthorized');
    error.status = 401;
    throw error;
  }
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function token() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function renderTemplate(template, context) {
  return String(template || '').replace(/\{\{([a-z0-9_]+)\}\}/gi, (_, key) => {
    return escapeHtml(context[key] || '');
  });
}

function unsubscribeFooter(url) {
  return `<p style="font-size:12px;color:#777;margin-top:32px;">You are receiving this because you subscribed to Tarot Flower. <a href="${escapeHtml(url)}">Unsubscribe</a>.</p>`;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS,
  });
}

function htmlPage(title, message) {
  return new Response(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body>
  <main style="font-family: Georgia, serif; max-width: 680px; margin: 48px auto; padding: 0 20px;">
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
  </main>
</body>
</html>`, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function corsHeaders(request) {
  const origin = request.headers.get('origin') || '';
  const headers = {
    ...JSON_HEADERS,
    vary: 'Origin',
  };
  if (origin.endsWith('tarotflower.com') || origin.includes('localhost')) {
    headers['access-control-allow-origin'] = origin;
    headers['access-control-allow-methods'] = 'GET,POST,OPTIONS';
    headers['access-control-allow-headers'] = 'content-type,authorization';
  }
  return headers;
}

function withCors(request, response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request))) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
