const dateFormat = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });
export const numberFormat = new Intl.NumberFormat('vi-VN');

let toastTimer;

export function escape(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}
export function money(value) { return numberFormat.format(value) + 'đ'; }
export function date(value) { return dateFormat.format(new Date(value)); }
export function href(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? escape(url.href) : '';
  } catch { return ''; }
}
export function asset(value) {
  return /^assets\/[a-zA-Z0-9/._-]+$/.test(value ?? '') && !value.includes('..') ? escape(value) : href(value);
}
export function picture(image, name, classes = 'product-pic', eager = false) {
  const src = asset(image);
  return src
    ? `<img class="${classes}" src="${src}" alt="${escape(name)}"${eager ? '' : ' loading="lazy"'}>`
    : `<div class="${classes} placeholder">${escape(name)}</div>`;
}
export function button(label, url, primary = false) {
  return `<a class="btn${primary ? ' primary' : ''}" href="#${url}">${label}</a>`;
}
export function page(title, content, wide = false) {
  return `<section class="${wide ? 'frame' : 'narrow'} page"><h1>${title}</h1>${content}</section>`;
}
export function announce(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.textContent = ''; }, 3300);
}

export function renderAndRefocus({ main, render }, { action, value, step }) {
  render();
  const replacement = [...main.querySelectorAll('[data-action]')].find(button =>
    button.dataset.action === action && button.dataset.value === value && button.dataset.step === step && !button.disabled);
  (replacement ?? main).focus({ preventScroll: true });
}
