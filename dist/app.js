import { isDemo, loadCatalog } from './store.js';
import { quickCheckoutRoute, updateCartBadge } from './shared/cart.js';
import { announce, escape, href, page } from './shared/ui.js';
import * as home from './pages/home.js';
import * as shop from './pages/shop.js';
import * as product from './pages/product.js';
import * as cart from './pages/cart.js';
import * as checkout from './pages/checkout.js';
import * as orders from './pages/orders.js';
import * as confirmation from './pages/confirmation.js';
import * as shipping from './pages/shipping.js';
import * as returns from './pages/returns.js';
import * as contact from './pages/contact.js';
import * as notFound from './pages/not-found.js';

const main = document.querySelector('main');
const routes = new Map([
  ['trang-chu', home],
  ['cua-hang', shop],
  ['gio-hang', cart],
  ['thanh-toan', checkout],
  [quickCheckoutRoute, checkout],
  ['da-dat', orders],
  ['xac-nhan', confirmation],
  ['giao-hang', shipping],
  ['doi-tra', returns],
  ['lien-he', contact]
]);
let catalog;
let lastRoute;
let activePage;
let confirmedOrder;

const context = {
  main,
  get catalog() { return catalog; },
  get route() { return location.hash.slice(1) || 'trang-chu'; },
  get confirmedOrder() { return confirmedOrder; },
  render,
  refreshCatalog() {
    loadCatalog().then(next => { catalog = next; }).catch(() => {});
  },
  confirmOrder(order, checkoutRoute) {
    confirmedOrder = order;
    orders.cacheOrder(order);
    if (context.route === checkoutRoute) location.hash = 'xac-nhan';
    else announce('Đã tạo đơn hàng. Xem đơn trong mục Đã đặt.');
  }
};

function setChrome() {
  const settings = catalog.settings;
  const brand = settings.brand || 'Lens Studio';
  document.title = brand;
  document.querySelector('#brand').textContent = brand;
  document.querySelector('#brand').setAttribute('aria-label', brand + ', trang chủ');
  document.querySelector('#footer-brand').textContent = brand;
  const socials = [['Instagram', href(settings.instagram_url)], ['Threads', href(settings.threads_url)]];
  document.querySelector('#socials').innerHTML = socials.filter(([, url]) => url)
    .map(([name, url]) => `<a href="${url}" rel="noopener noreferrer">${name}</a>`).join('');
}

function setNavigation(route, selectedProduct) {
  const active = selectedProduct || route === quickCheckoutRoute ? 'cua-hang'
    : route === 'thanh-toan' ? 'gio-hang' : route === 'xac-nhan' ? 'da-dat' : route;
  for (const link of document.querySelectorAll('.site-nav a')) {
    if (link.hash === '#' + active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

function render({ focus = false } = {}) {
  const route = context.route;
  if (route === 'main') return;

  const selectedProduct = catalog?.products.find(item => item.slug === route);
  setNavigation(route, selectedProduct);
  if (!catalog) return;

  activePage = routes.get(route) ?? (selectedProduct ? product : notFound);
  if (lastRoute !== route) {
    lastRoute = route;
    activePage.enter?.(context);
  }
  main.innerHTML = activePage.render(context, selectedProduct);
  if (focus) {
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}

main.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  void activePage?.actions?.[button.dataset.action]?.(context, button.dataset);
});
main.addEventListener('submit', event => {
  if (!activePage?.submit) return;
  event.preventDefault();
  void activePage.submit(context, event.target);
});
main.addEventListener('change', event => {
  activePage?.change?.(context, event.target);
});

window.addEventListener('hashchange', () => render({ focus: true }));
window.addEventListener('storage', updateCartBadge);
document.querySelector('.skip').addEventListener('click', event => {
  event.preventDefault();
  main.focus();
});

async function start() {
  document.querySelector('#demo-bar').hidden = !isDemo;
  updateCartBadge();
  try {
    catalog = await loadCatalog();
    setChrome();
    render();
  } catch (error) {
    main.innerHTML = page('Chưa tải được cửa hàng', `<p role="alert">${escape(error.message)}</p><p>Hãy tải lại trang để thử lại.</p>`);
  }
}
void start();
