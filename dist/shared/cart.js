import { read, scope, write } from '../store.js';
import { announce } from './ui.js';

export const maxQuantity = 99;
export const quickCheckoutRoute = 'thanh-toan/mua-ngay';
const quickPurchaseKey = 'lens-studio:' + scope + ':quick-purchase';
const maxLines = 50;
export const cartState = { submitting: false };

export function cart() { return read('cart', []); }
export function saveCart(lines) {
  write('cart', lines);
  updateCartBadge();
}
export function updateCartBadge() {
  const count = cart().reduce((sum, item) => sum + item.quantity, 0);
  for (const badge of document.querySelectorAll('[data-count]')) {
    badge.textContent = count;
    badge.hidden = !count;
  }
}

export function cartDetails(catalog, lines = cart()) {
  return lines.map(line => {
    const variant = catalog.variants.find(item => item.id === line.variant_id);
    const product = catalog.products.find(item => item.slug === variant?.product_slug);
    return { ...line, variant, product };
  });
}
export function validCart(lines) {
  return lines.length > 0 && lines.length <= maxLines
    && lines.every(line => line.product && Number.isInteger(line.quantity) && line.quantity > 0
      && line.quantity <= Math.min(maxQuantity, line.variant.stock));
}

export function cartKey() {
  return cart().map(item => item.variant_id + ':' + item.quantity).sort().join(',');
}
export function pendingAttempt() {
  const attempt = read('attempt', null);
  return attempt?.cartKey === cartKey() ? attempt : null;
}

export function quickPurchase() {
  try { return JSON.parse(sessionStorage.getItem(quickPurchaseKey)); }
  catch { return null; }
}

export function saveQuickPurchase(purchase) {
  if (purchase) sessionStorage.setItem(quickPurchaseKey, JSON.stringify(purchase));
  else sessionStorage.removeItem(quickPurchaseKey);
}

export function changeQuantity(catalog, id, step) {
  if (cartState.submitting) return;
  const variant = catalog.variants.find(item => item.id === id);
  const lines = cart();
  const line = lines.find(item => item.variant_id === id);
  const quantity = (line?.quantity ?? 0) + step;
  if (quantity < 1 || (step > 0 && quantity > Math.min(maxQuantity, variant?.stock ?? 0))) {
    announce('Đã đạt số lượng tối đa có thể thêm.');
    return;
  }
  if (line) line.quantity = quantity;
  else if (lines.length < maxLines) lines.push({ variant_id: id, quantity });
  else {
    announce('Giỏ đã đạt giới hạn số mặt hàng.');
    return;
  }
  saveCart(lines);
  announce(step > 0 ? 'Đã thêm sản phẩm.' : 'Đã cập nhật số lượng.');
}
