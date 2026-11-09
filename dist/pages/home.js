import { asset, button, picture } from '../shared/ui.js';

const profileImage = 'assets/lens-shop-profile.png';

export function render({ catalog }) {
  const banners = catalog.settings.banners
    .filter(image => image !== 'assets/reference/banner-2.jpg')
    .map(image => image === 'assets/reference/banner-1.jpg' ? profileImage : image)
    .filter(asset);
  return `<section class="home narrow page">
    <div class="home-content">
      <div class="home-intro">
        <h1>Lens cho mỗi ngày</h1>
        <p class="home-description">Tổng kho Kính áp tròng uy tín - chất lượng, hỗ trợ cận và ship toàn quốc</p>
        ${button('Xem tất cả mẫu', 'cua-hang', true)}
      </div>
      <h2>Hướng dẫn đặt hàng</h2>
      <div class="steps">
        <div class="panel"><span class="eyebrow">01</span><h3>Chọn sản phẩm</h3><p>Chọn mẫu lens và độ cận bạn muốn.</p></div>
        <div class="panel"><span class="eyebrow">02</span><h3>Điền thông tin</h3><p>Nhập họ tên, số điện thoại và địa chỉ nhận hàng.</p></div>
        <div class="panel"><span class="eyebrow">03</span><h3>Thanh toán</h3><p>Chuyển khoản toàn bộ hoặc chọn COD có cọc.</p></div>
      </div>
    </div>
    <div class="carousel" role="region" aria-label="Ảnh nổi bật">
      ${banners.length ? `<div class="carousel-viewport" tabindex="0" aria-label="Cuộn để xem các banner">
        ${banners.map((image, index) => `<div class="hero-slide">${picture(image, image === profileImage ? 'Trang Lens Shop – Tổng Kho Kính Áp Tròng' : 'Banner cửa hàng ' + (index + 1), image === profileImage ? 'hero-image profile-image' : 'hero-image', index === 0)}</div>`).join('')}
      </div>`
        : '<div class="hero-fallback"><p class="eyebrow">Lens ngày · Lens tháng · Dụng cụ</p></div>'}
      ${banners.length > 1 ? `
        <button class="carousel-arrow prev" data-action="slide" data-step="-1" aria-label="Ảnh trước">‹</button>
        <button class="carousel-arrow next" data-action="slide" data-step="1" aria-label="Ảnh sau">›</button>` : ''}
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
