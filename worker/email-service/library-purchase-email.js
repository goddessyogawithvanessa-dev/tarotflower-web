import { renderEmail } from './tarot-email-suite.js';

export function buildLibraryPurchaseAccessEmail({ libraryUrl }) {
  return renderEmail('fire', {
    library_url: libraryUrl,
  });
}
