# Lens Studio

Cửa hàng lens tiếng Việt dùng HTML, CSS, JavaScript và Supabase Cloud. Bản xem trước có 20 sản phẩm mẫu và dùng 31 ảnh công khai từ Kitty Lens trong `dist/assets/reference/`. Giá và tồn là dữ liệu minh họa. Ảnh banner tham chiếu có thể chứa nhận diện của Kitty Lens. Chọn ảnh và nhận diện phù hợp với shop trước khi mở bán.

## Chạy bản xem trước

Từ thư mục dự án:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory dist
```

Mở [http://127.0.0.1:8765](http://127.0.0.1:8765). Khi `dist/config.js` để trống, giỏ hàng và đơn thử chỉ lưu trên trình duyệt đó. Biểu mẫu demo không lưu họ tên, số điện thoại hoặc địa chỉ. Không chuyển tiền cho đơn thử.

## Cấu trúc JavaScript

`dist/app.js` khởi động ứng dụng và xử lý điều hướng. Mỗi trang có một module trong `dist/pages/`. Các trang dùng chung hàm hiển thị, giỏ hàng và đơn hàng trong `dist/shared/`. `dist/store.js` đọc dữ liệu và gọi API.

## Kết nối Supabase Cloud

1. Tạo một project Supabase Cloud riêng. Trong **SQL Editor**, chạy lần lượt `supabase/migrations/202611080001_store.sql` và `supabase/migrations/202611080002_cron.sql`. Chạy thêm `supabase/seed.sql` nếu muốn nhập danh mục mẫu.
2. Điền Project URL và khóa **publishable** (`sb_publishable_…`) vào `dist/config.js`. Chỉ dùng khóa publishable trong frontend. Để triển khai lên hosting tĩnh, chọn `dist/` làm thư mục xuất bản.
3. Trong **Table Editor → shop_settings**, sửa dòng `id = 1`. Điền tên shop, liên kết Instagram/Threads hoặc email liên hệ, phí giao hàng, cọc COD và ba trường ngân hàng. Chỉnh nội dung giao hàng, đổi trả và liên hệ trong `dist/pages/shipping.js`, `dist/pages/returns.js` và `dist/pages/contact.js`.
4. Trong **Storage → catalog-images**, tải ảnh sản phẩm và banner do shop cung cấp. Dán URL HTTPS công khai vào mảng `products.images` và `shop_settings.banners`. Bản mẫu có thể dùng ảnh tương đối đi kèm mã nguồn.
5. Kiểm tra Cron có job `lens-expire-orders`. Sau khi kiểm tra danh mục, chính sách và thông tin nhận tiền, bật `shop_settings.accepting_orders`. Mặc định trường này tắt.

## Quản lý cửa hàng

- **Sản phẩm.** Sửa `products` trong Table Editor. Dùng `monthly`, `daily` hoặc `accessories` cho danh mục. Dùng `active = false` để ẩn sản phẩm đã bán. Slug viết thường, dùng dấu gạch ngang và chọn khác tên các trang như `cua-hang` hoặc `gio-hang`.
- **Tồn.** Thêm một dòng `product_variants` cho mỗi độ với cùng `product_slug`. Độ 0 dùng `power = 0`. Dụng cụ dùng một dòng với `power = NULL`. Sửa `stock` theo số lượng có thể bán, tức số lượng chưa được đơn hàng giữ.
- **Đối soát.** Trong `orders`, tìm theo `code`, so khớp số tiền thực nhận với `pay_now` và đối chiếu thời hạn `expires_at`. Thông tin chuyển khoản lưu theo từng đơn. Với khoản tiền nhận sau khi đơn hết hạn, shop đối soát và xử lý trực tiếp với khách.
- **Đổi trạng thái.** Sau đối soát, dùng SQL Editor với đúng mã đơn. Các trạng thái hợp lệ là `pending → confirmed → shipping → completed`. Đơn `pending` hoặc `confirmed` có thể hủy trước khi giao. Trigger tự hoàn tồn cho đơn hủy và hết hạn.

```sql
-- Đối soát xong, thay mã mẫu bằng mã đơn thực tế
update public.orders set status = 'confirmed'
where code = 'LS-...' and status = 'pending'
returning code, status;

-- Khi bàn giao cho đơn vị vận chuyển
update public.orders set status = 'shipping'
where code = 'LS-...' and status = 'confirmed'
returning code, status;

-- Sau khi giao thành công
update public.orders set status = 'completed'
where code = 'LS-...' and status = 'shipping'
returning code, status;

-- Hủy trước khi giao, tự trả tồn
update public.orders set status = 'cancelled'
where code = 'LS-...' and status in ('pending', 'confirmed')
returning code, status;
```

## Kiểm thử

`tests/store.sql` chạy trên cơ sở dữ liệu thử nghiệm vừa áp migration đầu và seed. Kịch bản dùng giao dịch rollback để kiểm tra tạo đơn, chống tạo trùng, đọc ẩn danh, tồn kho, hủy và hết hạn. Để kiểm thử trên Supabase Cloud, dùng project thử nghiệm riêng và mã đơn thử.
