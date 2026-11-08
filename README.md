# Lens Studio

Cửa hàng lens tiếng Việt dùng HTML, CSS, JavaScript và Supabase Cloud. Bản xem trước có 20 sản phẩm mẫu và dùng 31 ảnh công khai từ Kitty Lens trong `dist/assets/reference/`. Giá và tồn là dữ liệu minh họa. Ảnh banner tham chiếu có thể chứa nhận diện của Kitty Lens. Chọn ảnh và nhận diện phù hợp với shop trước khi mở bán.

## Chạy bản xem trước

Từ thư mục dự án:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory dist
```

Mở [http://127.0.0.1:8765](http://127.0.0.1:8765). Khi `dist/config.js` để trống, giỏ hàng và đơn thử chỉ lưu trên trình duyệt đó. Biểu mẫu demo không lưu họ tên, số điện thoại hoặc địa chỉ. QR minh họa hiển thị số tiền của đơn thử, tài khoản giả và số điện thoại mẫu.

## Cấu trúc JavaScript

`dist/app.js` khởi động ứng dụng và xử lý điều hướng. Mỗi trang có một module trong `dist/pages/`. Các trang dùng chung hàm hiển thị, giỏ hàng và đơn hàng trong `dist/shared/`. `dist/store.js` đọc dữ liệu và gọi API.

## Kết nối Supabase Cloud

1. Tạo một project Supabase Cloud riêng. Trong **SQL Editor**, chạy các tệp trong `supabase/migrations/` theo thứ tự tên tệp. Nếu đang cập nhật cửa hàng, áp dụng các migration còn thiếu, gồm `20261108135631_shipping_policy.sql`, trước khi tải lên giao diện mới. Chạy thêm `supabase/seed.sql` nếu muốn nhập danh mục mẫu.
2. Điền Project URL và khóa **publishable** (`sb_publishable_…`) vào `dist/config.js`. Chỉ dùng khóa publishable trong frontend. Để triển khai lên hosting tĩnh, chọn `dist/` làm thư mục xuất bản.
3. Trong **Table Editor → shop_settings**, sửa dòng `id = 1`. Điền tên shop, liên kết Instagram/Threads hoặc email liên hệ, phí giao hàng khi chuyển khoản, phí COD, cọc COD và thông tin ngân hàng. Migration mới điền BIDV, BIN `970418` và bí danh `PHUONGPHUONGG` đọc từ QR được cung cấp. Chỉnh nội dung giao hàng, đổi trả và liên hệ trong `dist/pages/shipping.js`, `dist/pages/returns.js` và `dist/pages/contact.js`.
4. Trong **Storage → catalog-images**, tải ảnh sản phẩm và banner do shop cung cấp. Dán URL HTTPS công khai vào mảng `products.images` và `shop_settings.banners`. Bản mẫu có thể dùng ảnh tương đối đi kèm mã nguồn.
5. Kiểm tra Cron có job `lens-expire-orders`. Sau khi kiểm tra danh mục, chính sách và thông tin nhận tiền, bật `shop_settings.accepting_orders`. Mặc định trường này tắt.

## VietQR và email báo đơn

QR được tạo trong trình duyệt bằng gói `vietqr` đã đóng gói sẵn. Dùng `npm ci` và `npm run build:qr` khi cần dựng lại bundle. QR điền số tiền phải chuyển lấy từ đơn đã lưu. Phí giao hàng mặc định là 20.000đ cho cả chuyển khoản và COD. Đơn từ 3 đôi lens được miễn phí giao hàng; phụ kiện không tính vào số đôi. Cọc COD mặc định 20.000đ.

Nội dung chuyển khoản dùng dạng `0900000000 THANHTOAN00001`. `00001` là mã thanh toán ngắn, duy nhất theo đơn. Mã tra cứu đầy đủ vẫn nằm trong email và phần Đã đặt. Mã QR có nội dung gồm số điện thoại chỉ hiển thị trong tab đặt hàng và tồn tại khi tải lại tab. Ở thiết bị khác, tra cứu bằng mã đơn cho phép xem trạng thái và thông tin chuyển khoản với mã thanh toán ngắn.

Để bật gửi email từ Gmail cá nhân:

1. Đăng nhập [Google Apps Script](https://script.google.com/) bằng Gmail sẽ gửi thư, tạo project và dán nội dung `integrations/gmail/Code.gs`. Trong **Project Settings → Script properties**, đặt `ORDER_MAIL_SECRET` là chuỗi ngẫu nhiên ít nhất 32 ký tự. Có thể đặt `ORDER_MAIL_TO`; mặc định là `yonggdphuong110@gmail.com`.
2. Chọn **Deploy → New deployment → Web app**, đặt **Execute as Me** và **Who has access Anyone** để Edge Function gọi được. Web app kiểm tra bí mật trước khi gửi và dùng địa chỉ nhận cố định trong cấu hình. Sao chép URL kết thúc bằng `/exec`. Chấp nhận quyền gửi thư bằng tài khoản Gmail của bạn.
3. Trong **Supabase → Edge Functions → Secrets**, thêm `GMAIL_BRIDGE_URL` là URL vừa sao chép, `GMAIL_BRIDGE_SECRET` trùng với `ORDER_MAIL_SECRET`, `ORDER_SITE_URL` là URL HTTPS của cửa hàng, và `ORDER_MAILER_KEY` là một bí mật ngẫu nhiên khác dài ít nhất 32 ký tự. Triển khai function `order-mailer` từ `supabase/functions/order-mailer/index.ts`. Khi dùng CLI đã liên kết đúng project, chạy `supabase functions deploy order-mailer`. Function kiểm tra `ORDER_MAILER_KEY` và dùng cấu hình `verify_jwt = false` trong `supabase/config.toml`.
4. Trong Supabase Vault, tạo secret `order_mailer_project_url` chứa Project URL và `order_mailer_key` trùng với `ORDER_MAILER_KEY`. Chạy `integrations/gmail/schedule.sql` trong SQL Editor để xử lý hàng đợi mỗi phút.
5. Tạo đơn thử với dữ liệu giả. Xác nhận ứng dụng ngân hàng hiển thị đúng người nhận, số tiền và nội dung khi quét, sau đó thoát khỏi màn hình ngân hàng. Mở email để kiểm tra trang xác nhận, rồi bấm nút với đơn thử để xem trạng thái cập nhật trên trang khách.

Email chứa họ tên, điện thoại và địa chỉ giao hàng theo yêu cầu. Liên kết cho phép người giữ nó xác nhận một lần trước khi đơn hết hạn. Mở liên kết chỉ hiển thị thông tin đối soát, còn nút trên trang mới cập nhật đơn. Giữ liên kết trong phạm vi người xử lý đơn hàng.

Có thể kiểm tra hàng đợi trong SQL Editor bằng `select order_id, attempt_count, available_at, sent_at from store_private.order_email_jobs order by available_at desc;`. Lỗi Gmail được thử lại tối đa 12 lần trong thời hạn đơn. Hạn mức gửi thuộc tài khoản Gmail thực hiện gửi.

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

`tests/store.sql` và `tests/payment.sql` chạy trên cơ sở dữ liệu thử nghiệm vừa áp các migration và seed. Kịch bản dùng giao dịch rollback để kiểm tra tạo đơn, chống tạo trùng, đọc ẩn danh, tồn kho, hủy và hết hạn. Để kiểm thử trên Supabase Cloud, dùng project thử nghiệm riêng và mã đơn thử.
