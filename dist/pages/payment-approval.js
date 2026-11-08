import { confirmPayment, reviewPayment } from '../store.js';
import { statuses } from '../shared/order.js';
import { escape, money, page } from '../shared/ui.js';

export const approvalPrefix = 'xac-nhan-thanh-toan/';
const tokenPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
let order;
let loading;
let error;

function tokenFrom(route) {
  return route.slice(approvalPrefix.length);
}

export async function enter(context) {
  const route = context.route;
  order = null;
  loading = tokenPattern.test(tokenFrom(route));
  error = '';
  if (!loading) return;
  try {
    const result = await reviewPayment(tokenFrom(route));
    if (context.route === route) order = result;
  } catch {
    if (context.route === route) error = 'Không tải được đơn. Vui lòng mở lại liên kết.';
  } finally {
    if (context.route === route) {
      loading = false;
      context.render();
    }
  }
}

export function render() {
  if (!order) return page('Xác nhận thanh toán', `<p class="panel">${error || (loading ? 'Đang tải đơn hàng…' : 'Liên kết xác nhận không hợp lệ.')}</p>`);
  return page('Xác nhận thanh toán', `<div class="panel stack">
    <p>Mã đơn <strong class="order-code">${escape(order.code)}</strong></p>
    ${order.payment_ref ? `<p>Mã thanh toán <strong>${escape(order.payment_ref)}</strong></p>` : ''}
    <p>${order.payment_method === 'cod' ? 'Tiền cọc COD' : 'Số tiền chuyển khoản'} <strong>${money(order.pay_now)}</strong></p>
    <p role="status"><span class="status">${statuses[order.status]}</span></p>
    ${order.status === 'pending' ? `<p>Đối chiếu số tiền và mã thanh toán trong tài khoản ngân hàng trước khi xác nhận.</p>
    <button class="btn primary" data-action="confirm" ${loading ? 'disabled' : ''}>${loading ? 'Đang xác nhận…' : order.pay_now > 0 ? 'Xác nhận đã nhận tiền' : 'Xác nhận đơn hàng'}</button>` : ''}
    ${error ? `<p class="error" role="alert">${error}</p>` : ''}
  </div>`);
}

export const actions = {
  async confirm(context) {
    if (loading || order?.status !== 'pending') return;
    const route = context.route;
    loading = true;
    error = '';
    context.render();
    try {
      const result = await confirmPayment(tokenFrom(route));
      if (context.route === route) order = result;
    } catch {
      if (context.route === route) error = 'Chưa xác nhận được. Hãy thử lại hoặc kiểm tra trạng thái trong Supabase.';
    } finally {
      if (context.route === route) {
        loading = false;
        context.render();
      }
    }
  }
};
