import { copyOrderCode, orderCard } from '../shared/order.js';
import { button, page } from '../shared/ui.js';

export function render({ confirmedOrder }) {
  const ordersLink = button('Xem đơn đã đặt', 'da-dat', true);
  return page('Đã tiếp nhận đơn hàng', confirmedOrder
    ? `<div class="stack">${orderCard(confirmedOrder)}<div>${ordersLink}</div></div>`
    : `<div class="panel">${ordersLink}</div>`);
}

export const actions = { copy: copyOrderCode };
