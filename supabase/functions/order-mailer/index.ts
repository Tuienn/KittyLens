type OrderItem = { name: string; power: number | null; unit_price: number; quantity: number };
type OrderEmail = {
  id: string;
  lease_id: string;
  token: string;
  code: string;
  payment_method: 'cod' | 'transfer';
  payment_memo: string;
  customer_name: string;
  phone: string;
  address: string;
  expires_at: string;
  subtotal: number;
  shipping_fee: number;
  total: number;
  pay_now: number;
  pay_on_delivery: number;
  items: OrderItem[];
};
type Environment = { get(name: string): string | undefined };

const money = (amount: number) => new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char] ?? char);
const date = (value: string) => new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short'
}).format(new Date(value));

async function sameSecret(actual: string, expected: string) {
  const encode = new TextEncoder();
  const [a, b] = await Promise.all([actual, expected].map(secret => crypto.subtle.digest('SHA-256', encode.encode(secret))));
  return new Uint8Array(a).reduce((diff, byte, index) => diff | (byte ^ new Uint8Array(b)[index]), 0) === 0;
}

function formatEmail(order: OrderEmail, site: URL) {
  const approval = new URL(site);
  approval.hash = 'xac-nhan-thanh-toan/' + order.token;
  const method = order.payment_method === 'cod' ? 'COD có cọc' : 'Chuyển khoản toàn bộ';
  const details = [
    ['Mã đơn', order.code],
    ['Khách hàng', order.customer_name],
    ['Số điện thoại', order.phone],
    ['Địa chỉ giao hàng', order.address],
    ['Phương thức thanh toán', method],
    ['Nội dung chuyển khoản', order.payment_memo],
    ['Tiền hàng', money(order.subtotal)],
    ['Phí giao hàng', money(order.shipping_fee)],
    ['Tổng cộng', money(order.total)],
    ['Số tiền cần nhận ngay', money(order.pay_now)],
    ['Thu khi giao hàng', money(order.pay_on_delivery)],
    ['Giữ hàng đến', date(order.expires_at)]
  ];
  const items = order.items.map(item => {
    const power = item.power == null ? '' : ' · Độ ' + item.power;
    return item.name + power + ' × ' + item.quantity + ' · ' + money(item.unit_price * item.quantity);
  });
  const text = [
    ...details.map(([label, value]) => label + ': ' + value),
    '', 'Sản phẩm', ...items, '', 'Mở trang xác nhận sau khi đối chiếu giao dịch', approval.href
  ].join('\n');
  const html = `<h1>Đơn hàng mới</h1><dl>${details.map(([label, value]) =>
    `<dt><strong>${escape(label)}</strong></dt><dd>${escape(value)}</dd>`).join('')}</dl>
    <h2>Sản phẩm</h2><ul>${items.map(item => `<li>${escape(item)}</li>`).join('')}</ul>
    <p>Đối chiếu giao dịch trong tài khoản ngân hàng trước khi xác nhận đơn.</p>
    <p><a href="${escape(approval.href)}" style="display:inline-block;background:#8c3e65;color:#fff;padding:12px 18px;border-radius:8px">Mở trang xác nhận thanh toán</a></p>
    <p>Liên kết dùng một lần và hết hạn cùng đơn. Chỉ người xử lý đơn nên mở liên kết này.</p>`;
  return { id: order.id, subject: 'Đơn hàng mới ' + order.code, text, html };
}

export function createHandler(env: Environment, fetcher: typeof fetch = fetch) {
  return async (request: Request) => {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    const workerKey = env.get('ORDER_MAILER_KEY') ?? '';
    const suppliedKey = request.headers.get('x-order-mailer-key') ?? '';
    if (workerKey.length < 32 || !await sameSecret(suppliedKey, workerKey)) {
      return new Response(null, { status: 401 });
    }

    const bridge = env.get('GMAIL_BRIDGE_URL') ?? '';
    const bridgeSecret = env.get('GMAIL_BRIDGE_SECRET') ?? '';
    const origin = env.get('SUPABASE_URL');
    const databaseKey = env.get('SUPABASE_SERVICE_ROLE_KEY');
    const site = URL.parse(env.get('ORDER_SITE_URL') ?? '');
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(bridge)
      || bridgeSecret.length < 32 || !origin || !databaseKey
      || site?.protocol !== 'https:' || site.username || site.password) {
      return Response.json({ error: 'order_mailer_config' }, { status: 503 });
    }

    const rpc = async (name: string, payload: object = {}) => {
      const response = await fetcher(origin + '/rest/v1/rpc/' + name, {
        method: 'POST',
        headers: {
          apikey: databaseKey,
          Authorization: 'Bearer ' + databaseKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) throw new Error('order_mailer_database');
      return response.status === 204 ? null : await response.json();
    };

    let sent = 0;
    let failed = 0;
    try {
      for (let i = 0; i < 3; i++) {
        const order: OrderEmail | null = await rpc('claim_order_email');
        if (!order) break;
        let delivered = false;
        try {
          const email = formatEmail(order, site);
          const response = await fetcher(bridge, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...email, secret: bridgeSecret }),
            signal: AbortSignal.timeout(15000)
          });
          delivered = response.ok && (await response.json())?.ok === true;
        } catch {
          // The database keeps the job available for another attempt.
        }
        await rpc('finish_order_email', { p_order_id: order.id, p_lease_id: order.lease_id, p_sent: delivered });
        if (delivered) sent++;
        else failed++;
      }
    } catch {
      console.error('Order email worker could not complete its database operation.');
      return Response.json({ sent, failed, error: 'order_mailer_database' }, { status: 502 });
    }
    return Response.json({ sent, failed }, { status: failed ? 502 : 200 });
  };
}

if (import.meta.main) Deno.serve(createHandler(Deno.env));
