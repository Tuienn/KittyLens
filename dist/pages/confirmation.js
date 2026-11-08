import { lookupOrder } from '../store.js';
import { copyOrderCode, latestOrderCode, orderCard, watchPendingOrders } from '../shared/order.js';
import { button, page } from '../shared/ui.js';

let currentOrder;
let stopWatching;
let entry;

export function enter(context) {
  const visit = Symbol();
  entry = visit;
  currentOrder = context.confirmedOrder;
  const code = currentOrder?.code ?? latestOrderCode();
  if (!code) return;

  const updateOrder = order => {
    if (entry !== visit || context.route !== 'xac-nhan' || !order) return;
    currentOrder = order;
    context.render();
  };
  lookupOrder(code).then(order => {
    if (!currentOrder || order?.status !== currentOrder.status) updateOrder(order);
  }).catch(() => {});
  stopWatching = watchPendingOrders(context, () => currentOrder ? [currentOrder] : [], updateOrder);
}

export function leave() {
  entry = null;
  stopWatching?.();
}

export function render() {
  const ordersLink = button('Xem đơn đã đặt', 'da-dat', true);
  return page('Đã tiếp nhận đơn hàng', currentOrder
    ? `<div class="stack">${orderCard(currentOrder)}<div>${ordersLink}</div></div>`
    : `<div class="panel">${ordersLink}</div>`);
}

export const actions = { copy: copyOrderCode };
