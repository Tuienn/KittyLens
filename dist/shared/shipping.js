import { money } from './ui.js';

// Keep this threshold in sync with the place_order shipping policy.
export const freeShippingPairs = 3;

export function lensPairCount(lines) {
  return lines.reduce((count, { product, quantity }) => count
    + (product && product.category !== 'accessories' ? quantity : 0), 0);
}

export function shippingNotice(settings, lensPairs) {
  const transfer = money(settings.shipping_fee);
  const cod = money(settings.cod_shipping_fee);
  const fee = transfer === cod ? transfer : `${transfer} khi chuyển khoản, ${cod} khi COD`;
  const progress = lensPairs === undefined ? '' : lensPairs >= freeShippingPairs
    ? ' Đơn của bạn đã được miễn phí giao hàng.'
    : ` Thêm ${freeShippingPairs - lensPairs} đôi lens nữa để được miễn phí giao hàng.`;
  return `<p class="notice"><strong>Miễn phí giao hàng từ ${freeShippingPairs} đôi lens.</strong>
    Dưới ${freeShippingPairs} đôi: phí giao hàng ${fee}.${progress}</p>`;
}
