import { asset, button, picture } from '../shared/ui.js';

export function render({ catalog }) {
  const banners = catalog.settings.banners.filter(asset);
  return `<section class="narrow page">
    <div class="carousel" role="region" aria-label="Ảnh nổi bật">
      ${banners.length ? `<div class="carousel-viewport" tabindex="0" aria-label="Cuộn để xem các banner">
        ${banners.map((image, index) => `<div class="hero-slide">${picture(image, 'Banner cửa hàng ' + (index + 1), 'hero-image', index === 0)}</div>`).join('')}
      </div>`
        : '<div class="hero-fallback"><p class="eyebrow">Lens ngày · Lens tháng · Dụng cụ</p></div>'}
      ${banners.length > 1 ? `
        <button class="carousel-arrow prev" data-action="slide" data-step="-1" aria-label="Ảnh trước">‹</button>
        <button class="carousel-arrow next" data-action="slide" data-step="1" aria-label="Ảnh sau">›</button>` : ''}
    </div>
    <div class="home-intro">
      <p class="eyebrow">Hỗ trợ cận · Ship toàn quốc</p>
      <h1>Lens cho mỗi ngày</h1>
      ${button('Xem tất cả mẫu', 'cua-hang', true)}
    </div>
    <h2>Hướng dẫn đặt hàng</h2>
    <div class="steps">
      <div class="panel"><span class="eyebrow">01</span><h3>Chọn sản phẩm</h3><p>Chọn mẫu lens và độ cận bạn muốn.</p></div>
      <div class="panel"><span class="eyebrow">02</span><h3>Điền thông tin</h3><p>Nhập họ tên, số điện thoại và địa chỉ nhận hàng.</p></div>
      <div class="panel"><span class="eyebrow">03</span><h3>Thanh toán</h3><p>Chuyển khoản toàn bộ hoặc chọn COD có cọc.</p></div>
    </div>
  </section>`;
}

export const actions = {
  slide({ main }, { step }) {
    const viewport = main.querySelector('.carousel-viewport');
    const count = viewport.children.length;
    const current = Math.round(viewport.scrollLeft / viewport.clientWidth);
    const next = (current + Number(step) + count) % count;
    viewport.scrollTo({ left: next * viewport.clientWidth });
  }
};
