import { shippingNotice } from '../shared/shipping.js';
import { page } from '../shared/ui.js';

export function render({ catalog }) {
  return page('Giao hàng', `<div class="panel stack"><h2>Phí giao hàng</h2>
    <p>Giao hàng toàn quốc.</p>
    ${shippingNotice(catalog.settings)}
    <p>Ưu đãi tính theo tổng số đôi lens trong đơn. Phụ kiện không được tính.</p>
    <p>Thời gian nhận hàng tùy khu vực. Tra cứu trạng thái trong mục <a href="#da-dat">Đã đặt</a>.</p></div>`);
}
