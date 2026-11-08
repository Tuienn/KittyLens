import { orderAmounts, placeOrder, write } from '../store.js';
import {
  cart, cartDetails, cartKey, cartState, pendingAttempt, quickCheckoutRoute, quickPurchase,
  saveCart, saveQuickPurchase, subtotal, validCart
} from '../shared/cart.js';
import { rememberOrder, summary } from '../shared/order.js';
import { button, escape, money, numberFormat, page } from '../shared/ui.js';

function selection(route) {
  if (route !== quickCheckoutRoute) return { items: cart(), retry: pendingAttempt() };
  const quick = quickPurchase();
  return { quick, items: quick?.line ? [quick.line] : [], retry: quick?.attempt };
}

export function render({ catalog, route }) {
  const { items, retry } = selection(route);
  const lines = cartDetails(catalog, items);
  const direct = route === quickCheckoutRoute;
  const line = lines[0];
  const back = direct
    ? button('Về sản phẩm', escape(line?.product?.slug ?? 'cua-hang'))
    : button('Về giỏ hàng', 'gio-hang');
  const invalid = direct ? 'Sản phẩm hoặc số lượng đã chọn không còn khả dụng.' : 'Vui lòng kiểm tra lại giỏ hàng.';
  if (!validCart(lines) && !retry) return page('Thanh toán', `<div class="panel stack"><p>${invalid}</p><div>${back}</div></div>`);
  if (!catalog.settings.accepting_orders && !retry) return page('Thanh toán', `<div class="panel stack"><p>Cửa hàng hiện chưa nhận đơn.</p><div>${back}</div></div>`);
  return page('Thanh toán', `<form class="panel stack" id="checkout">
    ${direct && line?.product ? `<div class="notice">
      <strong>${escape(line.product.name)}</strong>
      ${line.variant.power == null ? '' : ` · Độ ${numberFormat.format(line.variant.power)}`}
      · Số lượng ${line.quantity}
    </div>` : ''}
    <h2>Thông tin giao hàng</h2>
    <label class="field">Họ và tên<input name="name" required minlength="2" maxlength="100" autocomplete="name"></label>
    <label class="field">Số điện thoại<input type="tel" name="phone" required maxlength="25" autocomplete="tel"></label>
    <label class="field">Địa chỉ nhận hàng<textarea name="address" required minlength="8" maxlength="400" rows="3" autocomplete="street-address"></textarea></label>
    <fieldset class="panel">
      <legend>Phương thức thanh toán</legend>
      <label class="radio"><input type="radio" name="payment" value="transfer" checked> Chuyển khoản toàn bộ</label>
      <label class="radio"><input type="radio" name="payment" value="cod"> COD, cọc tối đa ${money(catalog.settings.cod_deposit)}</label>
    </fieldset>
    <div id="checkout-amounts">${summary(orderAmounts(subtotal(lines), catalog.settings, 'transfer'), true)}</div>
    ${retry ? '<p class="notice">Bạn có thể gửi lại yêu cầu trước đó để kiểm tra kết quả mà không tạo trùng đơn.</p>' : ''}
    <p class="error" id="checkout-error" role="alert" hidden></p>
    <button class="btn primary" type="submit" ${cartState.submitting ? 'disabled' : ''}>${cartState.submitting ? 'Đang tạo đơn…' : 'Đặt hàng'}</button>
  </form>`);
}

function checkoutError(main, message) {
  const error = main.querySelector('#checkout-error');
  if (error) {
    error.textContent = message;
    error.hidden = false;
  }
}
export async function submit(context, form) {
  if (cartState.submitting) return;
  const data = new FormData(form);
  const phone = data.get('phone').replace(/[\s.()-]/g, '');
  if (!/^(0[0-9]{9}|\+84[0-9]{9})$/.test(phone)) {
    checkoutError(context.main, 'Nhập số điện thoại 10 chữ số hoặc định dạng +84.');
    form.elements.phone.focus();
    return;
  }
  const route = context.route;
  const { quick, items, retry } = selection(route);
  if (!retry && !validCart(cartDetails(context.catalog, items))) {
    checkoutError(context.main, 'Vui lòng kiểm tra lại sản phẩm và số lượng.');
    return;
  }
  const attempt = retry ?? { id: crypto.randomUUID(), ...(!quick && { cartKey: cartKey() }) };
  const submit = form.querySelector('button[type=submit]');
  try {
    if (quick) saveQuickPurchase({ ...quick, attempt });
    else write('attempt', attempt);
    cartState.submitting = true;
    submit.disabled = true;
    submit.textContent = 'Đang tạo đơn…';
    const order = await placeOrder({
      p_request_id: attempt.id,
      p_customer_name: data.get('name'),
      p_phone: phone,
      p_address: data.get('address'),
      p_payment_method: data.get('payment'),
      p_items: items
    });
    rememberOrder(order.code);
    if (quick) saveQuickPurchase(null);
    else {
      if (cartKey() === attempt.cartKey) saveCart([]);
      if (pendingAttempt()?.id === attempt.id || cart().length === 0) write('attempt', null);
    }
    context.confirmOrder(order, route);
    context.refreshCatalog();
  } catch (error) {
    if (error.rejected) {
      if (quick) saveQuickPurchase({ line: quick.line });
      else write('attempt', null);
      if (context.route === route) checkoutError(context.main, error.message);
      context.refreshCatalog();
    } else if (context.route === route) {
      checkoutError(context.main, 'Chưa xác nhận được kết quả. Gửi lại để kiểm tra mà không tạo trùng đơn.');
    }
  } finally {
    cartState.submitting = false;
    const activeSubmit = context.main.querySelector('#checkout button[type=submit]');
    if (activeSubmit) {
      activeSubmit.disabled = false;
      activeSubmit.textContent = 'Đặt hàng';
    }
  }
}

export function change({ main, catalog, route }, input) {
  if (input.name !== 'payment' || input.form?.id !== 'checkout') return;
  const method = input.value;
  main.querySelector('#checkout-amounts').innerHTML = summary(
    orderAmounts(subtotal(cartDetails(catalog, selection(route).items)), catalog.settings, method), true, method === 'cod');
}
