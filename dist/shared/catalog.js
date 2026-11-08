import { money } from './ui.js';

export const categories = { all: 'Tất cả', monthly: 'Lens tháng', daily: 'Lens ngày', accessories: 'Dụng cụ' };
export function price(product) {
  return `<p class="price">${money(product.price)} <span class="muted">/ ${product.category === 'accessories' ? 'cái' : 'đôi'}</span></p>`;
}
