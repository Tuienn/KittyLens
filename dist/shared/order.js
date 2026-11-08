import { read, write } from '../store.js';
import { announce, date, escape, money, numberFormat } from './ui.js';

const statuses = {
  pending: 'Chờ thanh toán', confirmed: 'Đã xác nhận', shipping: 'Đang giao',
  completed: 'Hoàn tất', expired: 'Hết hạn', cancelled: 'Đã hủy'
};

export function recent() { return read('recent', []); }

export function rememberOrder(code) {
  write('recent', [code, ...recent().filter(previous => previous !== code)].slice(0, 30));
}

export function summary(amounts, showPayment = false, showDelivery = false) {
  return `<dl class="summary">
    <div><dt>Tạm tính</dt><dd>${money(amounts.subtotal)}</dd></div>
    <div><dt>Phí giao hàng</dt><dd>${money(amounts.shipping_fee)}</dd></div>
    <div class="total"><dt>Tổng cộng</dt><dd>${money(amounts.total)}</dd></div>
    ${showPayment ? `<div><dt>Cần chuyển khoản</dt><dd>${money(amounts.pay_now)}</dd></div>` : ''}
    ${showDelivery ? `<div><dt>Trả khi nhận hàng</dt><dd>${money(amounts.pay_on_delivery)}</dd></div>` : ''}
  </dl>`;
}

export function orderCard(order) {
  const pending = order.status === 'pending' && Date.parse(order.expires_at) > Date.now();
  const status = order.status === 'pending' && !pending ? 'expired' : order.status;
  const transferInfo = order.bank ? `
    <dl class="summary">
      <div><dt>Ngân hàng</dt><dd>${escape(order.bank.name)}</dd></div>
      <div><dt>Số tài khoản</dt><dd>${escape(order.bank.account)}</dd></div>
      <div><dt>Chủ tài khoản</dt><dd>${escape(order.bank.holder)}</dd></div>
    </dl>
    <p>Nội dung chuyển khoản <strong class="order-code">${escape(order.code)}</strong></p>`
    : '<p>Bản xem trước. Không chuyển tiền cho đơn thử.</p>';
  return `<article class="panel stack">
    <span class="status">${statuses[status]}</span>
    <h2 class="order-code">${escape(order.code)}</h2>
    <p class="muted">${date(order.created_at)} · ${order.payment_method === 'cod' ? 'COD có cọc' : 'Chuyển khoản'}</p>
    <ul class="order-lines">${order.items.map(item => `<li>${escape(item.name)}${item.power == null ? '' : ' · Độ ' + numberFormat.format(item.power)} × ${item.quantity} · ${money(item.unit_price * item.quantity)}</li>`).join('')}</ul>
    ${summary(order, pending, order.payment_method === 'cod' && !['expired', 'cancelled'].includes(status))}
    ${pending ? `<div class="notice stack"><h3>Hướng dẫn chuyển khoản</h3>
      ${order.pay_now === 0 ? '<p>Đơn này không cần chuyển khoản. Shop sẽ kiểm tra và xác nhận.</p>' : transferInfo}
      <p>Giữ hàng đến ${date(order.expires_at)}. Shop xác nhận sau khi đối soát.</p>
    </div>` : ''}
    <div><button class="btn" data-action="copy" data-value="${escape(order.code)}">Sao chép mã đơn</button></div>
  </article>`;
}

export async function copyOrderCode(_context, { value }) {
  try {
    await navigator.clipboard.writeText(value);
    announce('Đã sao chép mã đơn.');
  } catch {
    announce('Hãy bôi đen mã đơn để sao chép.');
  }
}
