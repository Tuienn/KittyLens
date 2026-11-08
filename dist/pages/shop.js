import { categories, price } from '../shared/catalog.js';
import { escape, page, picture, renderAndRefocus } from '../shared/ui.js';

let selectedCategory = 'all';

export function render({ catalog }) {
  const products = catalog.products.filter(product => selectedCategory === 'all' || product.category === selectedCategory);
  return page('Cửa hàng', `
    <div class="filters" aria-label="Lọc sản phẩm" role="group">
      ${Object.entries(categories).map(([id, label]) => `<button class="chip" data-action="filter" data-value="${id}" aria-pressed="${selectedCategory === id}">${label}</button>`).join('')}
    </div>
    ${products.length ? `<div class="grid">${products.map((product, index) => `
      <a class="product" href="#${escape(product.slug)}">
        ${picture(product.images[0], '', 'product-pic', index < 6)}
        <div class="product-copy"><p class="eyebrow">${categories[product.category]}</p><h2>${escape(product.name)}</h2>${price(product)}</div>
      </a>`).join('')}</div>` : '<p class="notice">Danh mục này chưa có sản phẩm.</p>'}`, true);
}

export const actions = {
  filter(context, action) {
    selectedCategory = action.value;
    renderAndRefocus(context, action);
  }
};
