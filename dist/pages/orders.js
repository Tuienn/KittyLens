import { isDemo, lookupOrder } from '../store.js';
import { copyOrderCode, orderCard, recent } from '../shared/order.js';
import { escape, page } from '../shared/ui.js';

const orderCode = /^LS-[0-9A-F]{32}$/;
let ordersView = new Map();
let orderMessage = '';
let orderSearch = '';
let loadingLookup = false;

export function cacheOrder(order) {
  ordersView.set(order.code, order);
}

export function enter(context) {
  ordersView = new Map();
  orderMessage = '';
  orderSearch = '';
  void loadRecentOrders(context);
}

export function render() {
  return page('Đơn đã đặt', `<div class="stack">
    <p class="muted">${isDemo ? 'Đơn thử chỉ tra cứu được trên trình duyệt này.' : 'Các đơn bạn đã lưu trên thiết bị này. Bạn có thể tra mã đơn từ thiết bị khác.'}</p>
    <div class="stack" id="order-list">${orderList()}</div>
    <form class="panel stack" id="lookup">
      <h2>Tra cứu bằng mã đơn</h2>
      <label class="field">Mã đơn<input name="code" value="${escape(orderSearch)}" placeholder="LS-…" required maxlength="60" autocapitalize="characters" spellcheck="false"></label>
      <p id="lookup-message" role="status" ${orderMessage ? '' : 'hidden'}>${escape(orderMessage)}</p>
      <button class="btn primary" type="submit" ${loadingLookup ? 'disabled' : ''}>${loadingLookup ? 'Đang tra cứu…' : 'Tra cứu'}</button>
    </form>
  </div>`);
}
function orderList() {
  const codes = [...new Set([...ordersView.keys(), ...recent()])];
  if (!codes.length) return '<p>Bạn chưa có đơn nào trên máy này.</p>';
  return codes.map(code => ordersView.has(code) ? orderCard(ordersView.get(code))
    : `<button class="btn order-code" data-action="lookup" data-value="${escape(code)}">${escape(code)}</button>`).join('');
}
async function loadRecentOrders(context) {
  const view = ordersView;
  await Promise.allSettled(recent().slice(0, 8).map(async code => {
    const order = await lookupOrder(code);
    if (order && !view.has(code)) view.set(code, order);
  }));
  if (context.route !== 'da-dat' || ordersView !== view) return;
  const list = context.main.querySelector('#order-list');
  if (list && !list.contains(document.activeElement)) list.innerHTML = orderList();
}

async function searchOrder(context, code) {
  if (loadingLookup) return;
  orderSearch = code.trim().toUpperCase();
  orderMessage = '';
  if (!orderCode.test(orderSearch)) {
    orderMessage = 'Vui lòng kiểm tra lại định dạng mã đơn.';
    context.render();
    context.main.querySelector('#lookup input')?.focus();
    return;
  }

  const lookupCode = orderSearch;
  loadingLookup = true;
  render();
  try {
    const order = await lookupOrder(lookupCode);
    if (!order) orderMessage = 'Không tìm thấy đơn hàng.';
    else {
      ordersView.set(lookupCode, order);
      orderMessage = 'Đã tìm thấy đơn hàng.';
    }
  } catch (error) {
    orderMessage = error.message;
  } finally {
    loadingLookup = false;
    if (context.route === 'da-dat') {
      context.render();
      context.main.querySelector('#lookup input')?.focus({ preventScroll: true });
    }
  }
}

export const actions = {
  lookup(context, { value }) { return searchOrder(context, value); },
  copy: copyOrderCode
};

export function submit(context, form) {
  return searchOrder(context, new FormData(form).get('code'));
}
