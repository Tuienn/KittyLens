import { zaloLink } from '../shared/contact.js';
import { escape, href, page } from '../shared/ui.js';

export function render({ catalog }) {
  const shop = catalog.settings;
  const email = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(shop.contact_email ?? '') ? escape(shop.contact_email) : '';
  const instagram = href(shop.instagram_url);
  const threads = href(shop.threads_url);
  return page('Liên hệ', `<div class="panel stack"><h2>${escape(shop.brand)}</h2>
    <p>${zaloLink()}</p>
    ${email ? `<p>Email <a href="mailto:${email}">${email}</a></p>` : ''}
    ${instagram ? `<p><a href="${instagram}" rel="noopener noreferrer">Instagram</a></p>` : ''}
    ${threads ? `<p><a href="${threads}" rel="noopener noreferrer">Threads</a></p>` : ''}
  </div>`);
}
