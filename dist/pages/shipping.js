import { money, page } from '../shared/ui.js';

export function render({ catalog }) {
  return page('Giao hàng', `<div class="panel stack"><h2>Phí giao hàng</h2>
    <p>Giao hàng toàn quốc · ${money(catalog.settings.shipping_fee)} mỗi đơn.</p>
    <p>Thời gian nhận hàng tùy khu vực. Tra cứu trạng thái trong mục <a href="#da-dat">Đã đặt</a>.</p></div>`);
}
