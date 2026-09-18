export function buildLibraryPurchaseAccessEmail({ ritualAccessUrl, libraryUrl, downloads = [] }) {
  const safeRitualAccessUrl = escapeHtml(ritualAccessUrl);
  const safeLibraryUrl = escapeHtml(libraryUrl);
  const safeDownloads = downloads.map((download) => ({
    label: escapeHtml(download.label),
    url: escapeHtml(download.url),
  }));
  const downloadHtml = safeDownloads.length === 3 ? buildDownloadSection(safeDownloads) : '';
  const downloadText = safeDownloads.length === 3
    ? `\n\nYOURS TO KEEP\n\nI’ve also included your Step Into Your Fire Grimoire, the complete ritual video, and the ritual music for you to download and keep.\n\n${downloads.map((download) => `${download.label}:\n${download.url}`).join('\n\n')}`
    : '';

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <style>
      @media only screen and (max-width: 620px) {
        .fire-shell { padding: 0 !important; }
        .fire-card { border-left: 0 !important; border-right: 0 !important; }
        .fire-pad { padding-left: 24px !important; padding-right: 24px !important; }
        .fire-title { font-size: 35px !important; }
        .fire-button { display: block !important; box-sizing: border-box !important; width: 100% !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#121113;color:#211c19;font-family:Georgia,'Times New Roman',serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#121113;">
      <tr>
        <td class="fire-shell" align="center" style="padding:28px 14px;">
          <table class="fire-card" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:620px;background:#f3ead9;border:1px solid #9b773c;">
            <tr>
              <td class="fire-pad" align="center" style="padding:34px 42px 26px;background:#181416;border-bottom:1px solid #9b773c;">
                <p style="margin:0 0 10px;color:#c5a15c;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.4;letter-spacing:0.26em;text-transform:uppercase;">Tarot Flower</p>
                <p style="margin:0;color:#f3ead9;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;letter-spacing:0.22em;text-transform:uppercase;">Step Into Your Fire</p>
                <p style="margin:18px auto 0;width:44px;border-top:1px solid #8d2f24;font-size:0;line-height:0;">&nbsp;</p>
              </td>
            </tr>
            <tr>
              <td class="fire-pad" style="padding:42px 48px 12px;">
                <h1 class="fire-title" style="margin:0 0 28px;color:#7f2f24;font-family:Georgia,'Times New Roman',serif;font-size:42px;line-height:1.08;font-weight:normal;">Hey, Warrior Goddess,</h1>
                <p style="margin:0 0 18px;color:#211c19;font-size:18px;line-height:1.7;">I’m so excited you’ve decided to join the circle.</p>
                <p style="margin:0;color:#211c19;font-size:18px;line-height:1.7;">Your Step Into Your Fire ritual is ready for you.</p>
              </td>
            </tr>
            <tr>
              <td class="fire-pad" align="center" style="padding:22px 48px 30px;">
                <a class="fire-button" href="${safeRitualAccessUrl}" style="display:inline-block;background:#8d2f24;border:1px solid #8d2f24;color:#fff8eb;text-decoration:none;padding:16px 30px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.2;font-weight:bold;letter-spacing:0.12em;text-transform:uppercase;">BEGIN THE RITUAL</a>
              </td>
            </tr>
            <tr>
              <td class="fire-pad" style="padding:0 48px 34px;">
                <p style="margin:0 0 18px;color:#4d423b;font-size:17px;line-height:1.7;">This is your private access link. It will take you directly into the ritual, where everything you need to prepare and begin is waiting for you.</p>
                <p style="margin:0;color:#4d423b;font-size:17px;line-height:1.7;">Set aside about an hour when you’re ready. Give yourself privacy, gather a few things that feel meaningful to you, and let me guide you from there.</p>
              </td>
            </tr>
            ${downloadHtml}
            <tr>
              <td class="fire-pad" style="padding:30px 48px 10px;border-top:1px solid #c9b48a;">
                <p style="margin:0;color:#4d423b;font-size:17px;line-height:1.7;">If you ever want to return to FIRE, you can access it anytime through My Rituals at Tarot Flower. Your ritual is yours permanently.</p>
              </td>
            </tr>
            <tr>
              <td class="fire-pad" align="center" style="padding:22px 48px 34px;">
                <a class="fire-button" href="${safeLibraryUrl}" style="display:inline-block;background:transparent;border:1px solid #9b773c;color:#6f291f;text-decoration:none;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.2;font-weight:bold;letter-spacing:0.12em;text-transform:uppercase;">MY RITUALS</a>
              </td>
            </tr>
            <tr>
              <td class="fire-pad" style="padding:0 48px 42px;">
                <p style="margin:0 0 18px;color:#4d423b;font-size:17px;line-height:1.7;">And welcome to this circle of women exploring our magic, our bodies, our creativity, and our sacred becoming together. I hope this is only the beginning.</p>
                <p style="margin:0 0 18px;color:#4d423b;font-size:17px;line-height:1.7;">If you have questions, something comes up during the ritual, or you simply want to tell me about your experience, you can always reply directly to this email. I’d love to hear from you.</p>
                <p style="margin:0 0 24px;color:#4d423b;font-size:17px;line-height:1.7;">Let’s make some magic together.</p>
                <p style="margin:0;color:#7f2f24;font-size:18px;line-height:1.6;font-style:italic;">XOXO,<br>Vanessa</p>
              </td>
            </tr>
            <tr>
              <td style="height:7px;background:#8d2f24;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `Hey, Warrior Goddess,\n\nI’m so excited you’ve decided to join the circle.\n\nYour Step Into Your Fire ritual is ready for you.\n\nBEGIN THE RITUAL:\n${ritualAccessUrl}\n\nThis is your private access link. It will take you directly into the ritual, where everything you need to prepare and begin is waiting for you.\n\nSet aside about an hour when you’re ready. Give yourself privacy, gather a few things that feel meaningful to you, and let me guide you from there.${downloadText}\n\nIf you ever want to return to FIRE, you can access it anytime through My Rituals at Tarot Flower. Your ritual is yours permanently.\n\nMY RITUALS:\n${libraryUrl}\n\nAnd welcome to this circle of women exploring our magic, our bodies, our creativity, and our sacred becoming together. I hope this is only the beginning.\n\nIf you have questions, something comes up during the ritual, or you simply want to tell me about your experience, you can always reply directly to this email. I’d love to hear from you.\n\nLet’s make some magic together.\n\nXOXO,\nVanessa`;

  return { html, text };
}

function buildDownloadSection(downloads) {
  const buttons = downloads.map((download) => `
                  <tr>
                    <td align="center" style="padding:0 0 10px;">
                      <a class="fire-button" href="${download.url}" style="display:block;background:#211c19;border:1px solid #9b773c;color:#f3ead9;text-decoration:none;padding:14px 18px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.2;font-weight:bold;letter-spacing:0.11em;text-transform:uppercase;">${download.label}</a>
                    </td>
                  </tr>`).join('');

  return `<tr>
              <td class="fire-pad" style="padding:32px 48px;background:#e9dcc6;border-top:1px solid #c9b48a;border-bottom:1px solid #c9b48a;">
                <p style="margin:0 0 12px;color:#9b773c;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.4;font-weight:bold;letter-spacing:0.22em;text-align:center;text-transform:uppercase;">YOURS TO KEEP</p>
                <p style="margin:0 0 24px;color:#352d28;font-size:17px;line-height:1.7;text-align:center;">I’ve also included your Step Into Your Fire Grimoire, the complete ritual video, and the ritual music for you to download and keep.</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  ${buttons}
                </table>
              </td>
            </tr>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
