import {
  cartState, changeQuantity, maxQuantity, quickCheckoutRoute, quickPurchase, saveQuickPurchase
} from '../shared/cart.js';
import { categories, price } from '../shared/catalog.js';
import { shippingNotice } from '../shared/shipping.js';
import { announce, escape, numberFormat, picture, renderAndRefocus } from '../shared/ui.js';

let selectedVariant;
let galleryIndex = 0;
let quantity = 1;

function quantityLimit(variant) {
  return Math.min(maxQuantity, variant?.stock ?? 0);
}

export function enter() {
  selectedVariant = undefined;
  galleryIndex = 0;
  quantity = 1;
}

export function render({ catalog }, product) {
  const accessory = product.category === 'accessories';
  const variants = catalog.variants.filter(item => item.product_slug === product.slug)
    .sort((a, b) => Number(a.power) - Number(b.power));
  const selected = accessory ? variants.find(item => item.power === null)
    : variants.find(item => item.id === selectedVariant);
  const limit = quantityLimit(selected);
  const disabled = limit < 1;
  const specs = [
    ['Đường kính', product.diameter, ' mm'], ['Đường kính nhuộm', product.colored_diameter, ' mm'],
    ['Độ cong', product.base_curve, ' mm'], ['Độ ngậm nước', product.water_content, '%']
  ].filter(([, value]) => value !== null);
  return `<section class="narrow page">
    <a href="#cua-hang">← Tất cả mẫu</a>
    <div class="detail">
      <div>
        ${picture(product.images[galleryIndex], product.name, 'detail-pic', true)}
        <div class="gallery-controls" role="group" aria-label="Ảnh sản phẩm">
          ${product.images.length > 1 ? product.images.map((_, index) => `<button class="chip" data-action="gallery" data-value="${index}" aria-pressed="${galleryIndex === index}">Ảnh ${index + 1}</button>`).join('') : ''}
        </div>
      </div>
      <div class="detail-copy">
        <p class="eyebrow">${categories[product.category]}</p>
        <h1>${escape(product.name)}</h1>${price(product)}
        <p>${escape(product.description)}</p>
        ${specs.length ? `<dl class="specs">${specs.map(([label, value, unit]) => `<div><dt>${label}</dt><dd>${numberFormat.format(value)}${unit}</dd></div>`).join('')}</dl>` : ''}
        ${accessory ? '' : `
          <h2>Chọn độ cận</h2>
          <p class="muted">Một đôi gồm 2 chiếc cùng độ. Độ gạch ngang đã hết hàng.</p>
          <div class="filters" role="group" aria-label="Độ cận">
            ${variants.map(item => `<button class="chip" data-action="power" data-value="${escape(item.id)}"
              aria-pressed="${selected?.id === item.id}" ${item.stock <= 0 ? 'disabled' : ''}>${numberFormat.format(item.power)}${item.stock <= 0 ? ' · Hết' : ''}</button>`).join('')}
          </div>`}
        <p class="muted">${selected?.stock > 0 ? 'Còn hàng' : accessory || selected ? 'Hết hàng' : 'Chưa chọn độ cận'}</p>
        <div class="quantity" role="group" aria-label="Số lượng mua">
          <span>Số lượng</span>
          <button class="qty-button" data-action="quantity" data-value="${escape(selected?.id)}" data-step="-1"
            aria-label="Giảm số lượng" ${disabled || quantity <= 1 ? 'disabled' : ''}>−</button>
          <output class="detail-quantity" aria-label="Số lượng đang chọn">${quantity}</output>
          <button class="qty-button" data-action="quantity" data-value="${escape(selected?.id)}" data-step="1"
            aria-label="Tăng số lượng" ${disabled || quantity >= limit ? 'disabled' : ''}>+</button>
        </div>
        <div class="detail-actions">
          <button class="btn" data-action="add" data-value="${escape(selected?.id)}" ${disabled ? 'disabled' : ''}>Thêm vào giỏ</button>
          <button class="btn primary" data-action="buyNow" data-value="${escape(selected?.id)}" ${disabled ? 'disabled' : ''}>Mua ngay</button>
        </div>
        ${shippingNotice(catalog.settings)}
      </div>
    </div>
  </section>`;
}

export const actions = {
  gallery(context, action) {
    galleryIndex = Number(action.value);
    renderAndRefocus(context, action);
  },
  power(context, action) {
    selectedVariant = action.value;
    const variant = context.catalog.variants.find(item => item.id === selectedVariant);
    quantity = Math.min(quantity, Math.max(1, quantityLimit(variant)));
    renderAndRefocus(context, action);
  },
  quantity(context, action) {
    const variant = context.catalog.variants.find(item => item.id === action.value);
    const next = quantity + Number(action.step);
    if (next < 1 || next > quantityLimit(variant)) return;
    quantity = next;
    renderAndRefocus(context, action);
  },
  add({ catalog }, { value }) {
    changeQuantity(catalog, value, quantity);
  },
  buyNow({ catalog }, { value }) {
    if (cartState.submitting) return;
    const variant = catalog.variants.find(item => item.id === value);
    if (quantity > quantityLimit(variant)) {
      announce('Số lượng đã chọn vượt quá tồn kho.');
      return;
    }
    const previous = quickPurchase();
    if (previous?.line?.variant_id !== value || previous.line.quantity !== quantity) {
      saveQuickPurchase({ line: { variant_id: value, quantity } });
    }
    location.hash = quickCheckoutRoute;
  }
};
