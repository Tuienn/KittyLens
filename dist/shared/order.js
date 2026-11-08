import { isDemo, lookupOrder, read, scope, write } from '../store.js';
import { announce, date, escape, money, numberFormat } from './ui.js';

export const statuses = {
  pending: 'Chờ thanh toán', confirmed: 'Đã xác nhận', shipping: 'Đang giao',
  completed: 'Hoàn tất', expired: 'Hết hạn', cancelled: 'Đã hủy'
};

export function recent() { return read('recent', []); }

const paymentKey = 'lens-studio:' + scope + ':payment:';

export function rememberOrder({ code, payment_memo: memo }) {
  write('recent', [code, ...recent().filter(previous => previous !== code)].slice(0, 30));
  try {
    sessionStorage.setItem(paymentKey + 'latest', code);
    if (memo) sessionStorage.setItem(paymentKey + code, memo);
  } catch {}
}

export function latestOrderCode() {
  try { return sessionStorage.getItem(paymentKey + 'latest'); }
  catch { return null; }
}

function paymentMemo(order) {
  if (order.payment_memo) return order.payment_memo;
  try { return sessionStorage.getItem(paymentKey + order.code); }
  catch { return null; }
}

export function isPending(order) {
  return order?.status === 'pending' && Date.parse(order.expires_at) > Date.now();
}

export function watchPendingOrders(context, getOrders, updateOrder) {
  if (isDemo) return () => {};
  const route = context.route;
  let stopped = false;
  let timer;
  const refresh = async () => {
    if (stopped || context.route !== route) return;
    if (!document.hidden) {
      const pending = getOrders().filter(order => order.status === 'pending');
      await Promise.allSettled(pending.map(async order => {
        const updated = await lookupOrder(order.code);
        if (stopped || context.route !== route || !updated || updated.status === order.status) return;
        updateOrder(updated);
        if (updated.status === 'confirmed') announce('Shop đã xác nhận đơn hàng.');
      }));
    }
    if (!stopped && context.route === route) timer = setTimeout(refresh, 8000);
  };
  timer = setTimeout(refresh, 4000);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

export async function showPaymentQrs(root) {
  const images = [...root.querySelectorAll('img[data-vietqr]')];
  if (!images.length) return;
  try {
    const { VietQR } = await import('../vendor/vietqr.js');
    const vietqr = new VietQR();
    await Promise.all(images.map(async image => {
      const { bank, accountNumber, accountName, amount, memo } = image.dataset;
      const response = await vietqr.genQRCodeBase64({ bank, accountNumber, accountName, amount, memo, media: 'svg' });
      const src = response?.data?.data?.qrDataURL;
      if (!src?.startsWith('data:image/svg+xml') || !image.isConnected) return;
      image.src = src;
      image.hidden = false;
    }));
  } catch {
    // The printed bank details remain available if the QR cannot be drawn.
  }
}

export function summary(amounts, showPayment = false, showDelivery = false) {
  return `<dl class="summary">
    <div><dt>Tạm tính</dt><dd>${money(amounts.subtotal)}</dd></div>
    <div><dt>Phí giao hàng</dt><dd>${Number(amounts.shipping_fee) === 0 ? 'Miễn phí' : money(amounts.shipping_fee)}</dd></div>
    <div class="total"><dt>Tổng cộng</dt><dd>${money(amounts.total)}</dd></div>
    ${showPayment ? `<div><dt>Cần chuyển khoản</dt><dd>${money(amounts.pay_now)}</dd></div>` : ''}
    ${showDelivery ? `<div><dt>Trả khi nhận hàng</dt><dd>${money(amounts.pay_on_delivery)}</dd></div>` : ''}
  </dl>`;
}

export function orderCard(order) {
  const pending = isPending(order);
  const status = order.status === 'pending' && !pending ? 'expired' : order.status;
  const memo = pending ? paymentMemo(order) : null;
  const qr = memo && order.bank?.bin && order.pay_now > 0
    ? `<img class="payment-qr" width="224" height="224" alt="${isDemo ? 'Mã QR minh họa' : 'Mã VietQR thanh toán'}" hidden data-vietqr
        data-bank="${escape(order.bank.bin)}" data-account-number="${escape(order.bank.account)}"
        data-account-name="${escape(order.bank.holder)}" data-amount="${escape(order.pay_now)}" data-memo="${escape(memo)}">` : '';
  const transferInfo = isDemo ? `
    <p><strong>QR minh họa.</strong> Mã dùng tài khoản giả và số điện thoại mẫu.</p>
    ${qr}
    <p>Nội dung chuyển khoản mẫu <strong class="order-code">${escape(memo)}</strong></p>` : order.bank ? `
    ${qr}
    <dl class="summary">
      <div><dt>Ngân hàng</dt><dd>${escape(order.bank.name)}</dd></div>
      <div><dt>Số tài khoản</dt><dd>${escape(order.bank.account)}</dd></div>
      <div><dt>Chủ tài khoản</dt><dd>${escape(order.bank.holder)}</dd></div>
    </dl>
    <p>Nội dung chuyển khoản <strong class="order-code">${escape(memo ?? order.payment_ref ?? order.code)}</strong></p>`
    : '<p>Thông tin tài khoản nhận tiền hiện chưa có.</p>';
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
