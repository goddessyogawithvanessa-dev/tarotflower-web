import { EMAIL_CONSENT_POLICIES } from '../circle/consent.js';

// Private service binding only. No public subscribe endpoint, SMTP send, or
// enrollment in the unrelated Goddess Guide welcome sequence.
export async function handleCircleEmailConsent(request, env) {
  try {
    const raw = await request.text();
    if (raw.length > 8192) return Response.json({ok:false}, {status:413});
    const body = JSON.parse(raw), email = String(body.email || '').trim().toLowerCase();
    const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
    if (!uuid(body.id) || !uuid(body.userId) || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !Object.hasOwn(EMAIL_CONSENT_POLICIES,body.version) || body.text !== EMAIL_CONSENT_POLICIES[body.version] ||
      !Number.isSafeInteger(body.recordedAt) || body.recordedAt <= 0 || body.recordedAt > Date.now()+60000 ||
      typeof body.firstName !== 'string' || body.firstName.length > 80)
      return Response.json({ok:false}, {status:400});
    const at = new Date(body.recordedAt).toISOString(), received = new Date().toISOString();
    const prior = await env.DB.prepare('SELECT e.*,s.email FROM ecosystem_email_consents e JOIN subscribers s ON s.id=e.subscriber_id WHERE e.id=?').bind(body.id).first();
    if (prior && (prior.user_id !== body.userId || prior.email.trim().toLowerCase() !== email || prior.version !== body.version || prior.consented_at !== at))
      return Response.json({ok:false}, {status:409});
    if (prior) return Response.json({ok:true,subscriberId:prior.subscriber_id});
    const unsubscribeToken = [...crypto.getRandomValues(new Uint8Array(32))].map(n=>n.toString(16).padStart(2,'0')).join('');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO subscribers(id,email,first_name,status,unsubscribe_token,created_at,updated_at)
        SELECT ?,?,?,'active',?,?,? WHERE NOT EXISTS (SELECT 1 FROM subscribers WHERE lower(trim(email))=?)`)
        .bind(crypto.randomUUID(),email,body.firstName,unsubscribeToken,received,received,email),
      // A genuinely newer opt-in can renew an unsubscribe, but an old delayed
      // delivery or retry cannot. Unknown/suppressed states fail closed.
      env.DB.prepare(`UPDATE subscribers SET
        first_name=COALESCE(NULLIF(first_name,''),?),
        unsubscribe_token=COALESCE(NULLIF(unsubscribe_token,''),?),
        status=CASE WHEN status IN ('active','pending') OR
          (status='unsubscribed' AND julianday(unsubscribed_at)<julianday(?)) THEN 'active' ELSE status END,
        updated_at=?
        WHERE id=(SELECT id FROM subscribers WHERE lower(trim(email))=? LIMIT 1)
        AND NOT EXISTS (SELECT 1 FROM ecosystem_email_consents WHERE id=?)`)
        .bind(body.firstName,unsubscribeToken,at,received,email,body.id),
      env.DB.prepare(`INSERT OR IGNORE INTO subscriber_consents
        (id,subscriber_id,consent_text,source_path,lead_magnet_slug,ip,user_agent,consented_at)
        SELECT ?,id,?,'https://moonlightcircle.com/join','',NULL,NULL,?
        FROM subscribers WHERE lower(trim(email))=? LIMIT 1`).bind(body.id,body.text,at,email),
      env.DB.prepare(`INSERT OR IGNORE INTO ecosystem_email_consents
        (id,subscriber_id,user_id,version,status,consented_at,received_at,withdrawn_at)
        SELECT ?,id,?,?,CASE WHEN status='active' THEN 'granted' WHEN status='unsubscribed' THEN 'withdrawn' ELSE 'suppressed' END,
          ?,?,CASE WHEN status='unsubscribed' THEN unsubscribed_at ELSE NULL END
        FROM subscribers WHERE lower(trim(email))=? LIMIT 1`)
        .bind(body.id,body.userId,body.version,at,received,email),
      env.DB.prepare(`INSERT OR IGNORE INTO subscriber_tags(subscriber_id,tag,created_at)
        SELECT subscriber_id,'source:moonlight-circle',? FROM ecosystem_email_consents WHERE id=?`).bind(received,body.id),
      env.DB.prepare(`INSERT OR IGNORE INTO subscriber_tags(subscriber_id,tag,created_at)
        SELECT subscriber_id,'ecosystem:vanessa',? FROM ecosystem_email_consents WHERE id=? AND status='granted'`).bind(received,body.id),
      env.DB.prepare(`INSERT OR IGNORE INTO subscriber_events(id,subscriber_id,event_type,metadata_json,created_at)
        SELECT ?,subscriber_id,'moonlight_circle_consent',?,? FROM ecosystem_email_consents WHERE id=?`)
        .bind('circle-consent:'+body.id,JSON.stringify({user_id:body.userId,version:body.version,source:'moonlight-circle'}),received,body.id),
    ]);
    const saved = await env.DB.prepare('SELECT subscriber_id FROM ecosystem_email_consents WHERE id=?').bind(body.id).first();
    return Response.json({ok:true,subscriberId:saved.subscriber_id});
  } catch {
    console.error('Circle email consent could not be recorded');
    return Response.json({ok:false}, {status:503});
  }
}
