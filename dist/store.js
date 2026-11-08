import { supabaseUrl, supabasePublishableKey } from './config.js';

const origin = supabaseUrl.trim().replace(/\/$/, '');
const key = supabasePublishableKey.trim();
export const isDemo = !origin && !key;
export const scope = isDemo ? 'demo' : origin;
const prefix = 'lens-studio:' + scope + ':';

export function read(name, fallback) {
  try { return JSON.parse(localStorage.getItem(prefix + name)) ?? fallback; }
  catch { return fallback; }
}

export function write(name, value) {
  localStorage.setItem(prefix + name, JSON.stringify(value));
}

let demoData;

async function getDemo() {
  if (!demoData) {
    const response = await fetch('demo.json');
    if (!response.ok) throw new Error('Không tải được danh mục mẫu.');
    demoData = await response.json();
  }
  return demoData;
}

async function request(path, payload) {
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(origin) || !key.startsWith('sb_publishable_')) {
    throw new Error('Cấu hình Supabase chưa hợp lệ. Kiểm tra URL và khóa publishable.');
  }

  const headers = { apikey: key };
  if (payload) headers['Content-Type'] = 'application/json';
  const response = await fetch(origin + '/rest/v1/' + path, {
    method: payload ? 'POST' : 'GET',
    headers,
    body: payload ? JSON.stringify(payload) : undefined
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.code === 'P0001' ? data.message : 'Không thể kết nối cửa hàng. Vui lòng thử lại.');
    error.rejected = data.code === 'P0001';
    throw error;
  }
  return data;
}

const settingsColumns = 'brand,banners,instagram_url,threads_url,contact_email,shipping_fee,cod_deposit,accepting_orders';
const productColumns = 'slug,name,category,price,description,images,diameter,colored_diameter,base_curve,water_content,sort_order';

function demoStock(variants, orders) {
  const held = new Map();
  for (const order of orders.filter(order => Date.parse(order.expires_at) > Date.now())) {
    for (const item of order.items) {
      held.set(item.variant_id, (held.get(item.variant_id) || 0) + item.quantity);
    }
  }
  return variants.map(variant => ({ ...variant, stock: variant.stock - (held.get(variant.id) || 0) }));
}

export async function loadCatalog() {
  if (isDemo) {
    const data = await getDemo();
    return { ...data, variants: demoStock(data.variants, read('demo-orders', [])) };
  }

  const [rows, products] = await Promise.all([
    request('shop_settings?id=eq.1&select=' + settingsColumns),
    request('products?order=sort_order.asc,slug.asc&select=' + productColumns
      + ',variants:product_variants(id,product_slug,power,stock)')
  ]);
  if (!rows[0]) throw new Error('Chưa có cấu hình cửa hàng.');
  const variants = products.flatMap(product => product.variants);
  return { settings: rows[0], products, variants };
}

export function orderAmounts(subtotal, settings, method) {
  const shipping = Number(settings.shipping_fee);
  const total = subtotal + shipping;
  const payNow = method === 'cod' ? Math.min(total, Number(settings.cod_deposit)) : total;
  return { subtotal, shipping_fee: shipping, total, pay_now: payNow, pay_on_delivery: total - payNow };
}

function publicDemoOrder(order) {
  return {
    ...order,
    status: Date.parse(order.expires_at) <= Date.now() ? 'expired' : 'pending',
    items: order.items.map(({ name, power, unit_price, quantity }) => ({ name, power, unit_price, quantity }))
  };
}

export function placeOrder(payload) {
  if (!isDemo) return request('rpc/place_order', payload);

  const create = async () => {
    const data = await getDemo();
    const orders = read('demo-orders', []);
    const existing = orders.find(order => order.request_id === payload.p_request_id);
    if (existing) return publicDemoOrder(existing);
    const variants = demoStock(data.variants, orders);
    const items = payload.p_items.map(line => {
      const variant = variants.find(entry => entry.id === line.variant_id);
      const product = data.products.find(entry => entry.slug === variant?.product_slug);
      if (!product || line.quantity > variant.stock) {
        const error = new Error('Không đủ tồn kho. Vui lòng cập nhật giỏ hàng.');
        error.rejected = true;
        throw error;
      }
      return {
        variant_id: variant.id, name: product.name, power: variant.power,
        unit_price: product.price, quantity: line.quantity
      };
    });
    const subtotal = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
    const order = {
      request_id: payload.p_request_id,
      code: 'LS-' + crypto.randomUUID().replaceAll('-', '').toUpperCase(),
      payment_method: payload.p_payment_method,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      items,
      ...orderAmounts(subtotal, data.settings, payload.p_payment_method)
    };
    write('demo-orders', [order, ...orders]);
    return publicDemoOrder(order);
  };

  return navigator.locks ? navigator.locks.request(prefix + 'order', create) : create();
}

export async function lookupOrder(code) {
  if (!isDemo) return request('rpc/lookup_order', { p_code: code });
  const found = read('demo-orders', []).find(order => order.code === code);
  return found ? publicDemoOrder(found) : null;
}
