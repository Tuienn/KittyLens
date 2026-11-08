import { orderAmounts } from '../store.js';
import {
  cart, cartDetails, cartState, changeQuantity, maxQuantity, pendingAttempt, saveCart, subtotal, validCart
} from '../shared/cart.js';
import { price } from '../shared/catalog.js';
import { summary } from '../shared/order.js';
import { announce, button, escape, numberFormat, page, picture, renderAndRefocus } from '../shared/ui.js';

export function render({ catalog }) {
  const lines = cartDetails(catalog);
  if (!lines.length) return page('Giỏ hàng', `<div class="panel stack"><p>Giỏ hàng đang trống.</p><div>${button('Xem cửa hàng', 'cua-hang', true)}</div></div>`);
  return page('Giỏ hàng', `<div class="stack">
    ${lines.map(({ variant_id: id, product, variant, quantity }) => `<article class="cart-row panel">
      ${picture(product?.images[0], '', 'product-pic')}
      <div class="cart-content">
        <h2>${escape(product?.name ?? 'Sản phẩm đã ngừng bán')}</h2>
        ${variant?.power != null ? `<p class="muted">Độ ${numberFormat.format(variant.power)}</p>` : ''}
        ${product ? price(product) : ''}
        ${quantity > (variant?.stock ?? 0) ? '<p class="error">Vượt số lượng còn hàng.</p>' : ''}
        <div class="cart-actions">
          <div class="quantity" aria-label="Số lượng">
            <button class="qty-button" data-action="quantity" data-value="${escape(id)}" data-step="-1" aria-label="Giảm số lượng" ${quantity <= 1 ? 'disabled' : ''}>−</button>
            <span>${quantity}</span>
            <button class="qty-button" data-action="quantity" data-value="${escape(id)}" data-step="1" aria-label="Tăng số lượng" ${quantity >= Math.min(maxQuantity, variant?.stock ?? 0) ? 'disabled' : ''}>+</button>
          </div>
          <button class="text-button" data-action="remove" data-value="${escape(id)}">Xóa</button>
        </div>
      </div>
    </article>`).join('')}
    <div class="panel stack">
      ${summary(orderAmounts(subtotal(lines), catalog.settings, 'transfer'))}
      ${validCart(lines) || pendingAttempt() ? button('Tiến hành thanh toán', 'thanh-toan', true)
        : '<p class="notice">Cập nhật số lượng sản phẩm để tiếp tục.</p>'}
    </div>
  </div>`);
}

export const actions = {
  quantity(context, action) {
    changeQuantity(context.catalog, action.value, Number(action.step));
    renderAndRefocus(context, action);
  },
  remove(context, action) {
    if (cartState.submitting) return;
    saveCart(cart().filter(item => item.variant_id !== action.value));
    announce('Đã xóa khỏi giỏ.');
    renderAndRefocus(context, action);
  }
};
