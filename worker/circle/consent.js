export const EMAIL_CONSENT_VERSION = '2026-09-23';
export const EMAIL_CONSENT_TEXT = 'Yes, keep me in the Circle. I’d like to receive Moonlight Circle updates, Goddess Circle invitations, retreats, rituals, new offerings, and occasional news from Vanessa’s world. I can unsubscribe anytime.';
// Retain released versions here when wording changes, so queued historical
// choices can still be delivered with the exact wording originally accepted.
export const EMAIL_CONSENT_POLICIES = Object.freeze({[EMAIL_CONSENT_VERSION]:EMAIL_CONSENT_TEXT});

// The database record is also a durable delivery outbox. A failed email-service
// call must neither lose consent nor stop an otherwise eligible person joining.
export async function syncCircleEmailConsents(env, userId = null) {
  if (!env.EMAIL_SERVICE) return;
  const rows = (await env.LIBRARY_DB.prepare(`SELECT e.*,c.display_name
    FROM circle_email_consents e JOIN customers c ON c.user_id=e.user_id
    WHERE e.status='granted' AND e.synced_at IS NULL AND e.next_attempt_at<=?
    AND (? IS NULL OR e.user_id=?) ORDER BY e.recorded_at LIMIT 20`)
    .bind(Date.now(), userId, userId).all()).results || [];
  for (const row of rows) {
    try {
      const response = await env.EMAIL_SERVICE.fetch('https://email.internal/api/circle-email-consent', {
        method: 'POST', headers: {'content-type':'application/json'},
        body: JSON.stringify({id:row.id,userId:row.user_id,email:row.email,firstName:row.display_name || '',
          version:row.version,text:row.consent_text,recordedAt:row.recorded_at}),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error('Consent delivery unavailable');
      const receipt = await response.json();
      if (!receipt.ok || typeof receipt.subscriberId !== 'string' || !receipt.subscriberId) throw new Error('Invalid consent receipt');
      await env.LIBRARY_DB.prepare('UPDATE circle_email_consents SET synced_at=?,subscriber_id=? WHERE id=? AND synced_at IS NULL')
        .bind(Date.now(), receipt.subscriberId, row.id).run();
    } catch {
      const delay = Math.min(86400000, 300000 * 2 ** Math.min(row.attempts, 9));
      await env.LIBRARY_DB.prepare('UPDATE circle_email_consents SET attempts=attempts+1,next_attempt_at=? WHERE id=? AND synced_at IS NULL')
        .bind(Date.now()+delay, row.id).run();
      console.error('Circle email consent sync pending; scheduled retry');
    }
  }
}
