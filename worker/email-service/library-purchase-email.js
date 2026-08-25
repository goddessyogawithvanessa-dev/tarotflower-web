export function buildLibraryPurchaseAccessEmail({ productTitle, libraryUrl }) {
  const safeTitle = escapeHtml(productTitle);
  const safeLibraryUrl = escapeHtml(libraryUrl);
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f6f0e7;color:#26211d;font-family:Georgia,'Times New Roman',serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f0e7;padding:40px 18px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fffdf8;border:1px solid #e5d8c7;">
            <tr>
              <td style="padding:42px 44px 16px;text-align:center;color:#9b4b31;font:600 13px/1.4 Arial,sans-serif;letter-spacing:0.18em;text-transform:uppercase;">Tarot Flower</td>
            </tr>
            <tr>
              <td style="padding:4px 44px 8px;text-align:center;">
                <h1 style="margin:0;color:#26211d;font-size:34px;line-height:1.18;font-weight:600;">${safeTitle} is ready.</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 44px 8px;color:#554c45;font-size:18px;line-height:1.65;text-align:center;">
                <p style="margin:0 0 18px;">Your ritual is now available in your private Ritual Library.</p>
                <p style="margin:0 0 18px;"><strong style="color:#26211d;">Your access is permanent.</strong> You can return to the ritual whenever you need it.</p>
                <p style="margin:0;">When you return, request a secure sign-in link using the same email address you used at checkout.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 44px 30px;text-align:center;">
                <a href="${safeLibraryUrl}" style="display:inline-block;background:#b76543;color:#fffdf8;text-decoration:none;padding:15px 28px;border-radius:2px;font:700 14px/1 Arial,sans-serif;letter-spacing:0.06em;">OPEN MY RITUAL LIBRARY</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 44px 42px;color:#766b63;font:14px/1.6 Arial,sans-serif;text-align:center;">
                <p style="margin:0;">Need help? Reply to this email or write to <a href="mailto:contact@tarotflower.com" style="color:#9b4b31;">contact@tarotflower.com</a>.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `${productTitle} is ready.\n\nYour ritual is now available in your private Ritual Library.\n\nYour access is permanent. You can return to the ritual whenever you need it.\n\nWhen you return, request a secure sign-in link using the same email address you used at checkout.\n\nOpen My Ritual Library:\n${libraryUrl}\n\nNeed help? Reply to this email or write to contact@tarotflower.com.`;

  return { html, text };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
