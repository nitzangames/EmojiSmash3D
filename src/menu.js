import { SHAPES, PROJECTILE_KINDS } from './throwables.js';
import { STAR_PACKS } from './progression.js';
import { renderShapePreview } from './preview.js';

const CONFETTI_COLORS = ['#f5c518', '#e94560', '#27ae60', '#3498db', '#f39c12', '#ffffff'];

function burstConfetti(originX, originY) {
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-particle';
    p.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    p.style.left = originX + 'px';
    p.style.top  = originY + 'px';
    document.body.appendChild(p);
    const angle    = Math.random() * Math.PI * 2;
    const distance = 50 + Math.random() * 70;
    const dx       = Math.cos(angle) * distance;
    const dy       = Math.sin(angle) * distance - 24;
    const rot      = (Math.random() - 0.5) * 720;
    const duration = 650 + Math.random() * 250;
    const anim = p.animate([
      { transform: 'translate(-50%, -50%) rotate(0deg)', opacity: 1 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${rot}deg)`, opacity: 0 },
    ], { duration, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' });
    anim.onfinish = () => p.remove();
  }
}

// Main shop screen: lets the player spend stars on throwables and hit Play.
// Star pack purchases live on a separate screen, reachable via the
// "Buy Stars" button next to the title.
export function showShop(root, save, { onPlay, onBuy, onBuyStarsClick }) {
  const inv = save.inventory || {};
  const items = PROJECTILE_KINDS.filter(k => SHAPES[k].cost > 0);
  root.innerHTML = `
    <div class="screen">
      <div class="shop-balance">★ ${save.gold || 0}</div>
      <div class="screen-title-row">
        <h1>Shop</h1>
        <button class="title-btn" id="buy-stars">Buy Stars</button>
      </div>

      <div class="shop-grid">
        ${items.map(k => {
          const cost = SHAPES[k].cost;
          const owned = inv[k] || 0;
          const canAfford = (save.gold || 0) >= cost;
          const icon = renderShapePreview(k, 128);
          const buyClass = `menu-btn shop-buy ${canAfford ? 'affordable' : 'secondary'}`;
          return `
            <div class="shop-item">
              <img class="shop-item-icon" src="${icon}" alt="${SHAPES[k].label}" />
              <div class="shop-item-name">${SHAPES[k].label}</div>
              <div class="shop-item-count">×${owned}</div>
              <button class="${buyClass}" data-buy="${k}" ${canAfford ? '' : 'disabled'}>
                ★${cost}
              </button>
            </div>`;
        }).join('')}
      </div>

      <button class="menu-btn" id="play">Play</button>
    </div>`;
  root.querySelector('#play').onclick = onPlay;
  root.querySelector('#buy-stars').onclick = onBuyStarsClick;
  root.querySelectorAll('[data-buy]').forEach(btn => {
    btn.onclick = () => {
      // Capture icon rect BEFORE onBuy — the success path re-renders the shop
      // and replaces the icon element.
      const icon = btn.closest('.shop-item')?.querySelector('.shop-item-icon');
      const rect = (icon || btn).getBoundingClientRect();
      burstConfetti(rect.left + rect.width / 2, rect.top + rect.height / 2);
      onBuy(btn.dataset.buy);
    };
  });
}

// Dedicated nbucks → stars screen.
// NBucks are the platform's hard currency: balance and top-up live in the
// PlayHub shell, so we don't display them here. Tapping a pack hands off to
// PlaySDK.nbucks.spend(), which prompts the user to confirm and to top up if
// their balance is low.
export function showBuyStars(root, save, { onBack, onBuyStars }) {
  root.innerHTML = `
    <div class="screen">
      <div class="shop-balance">★ ${save.gold || 0}</div>
      <h1>Buy Stars</h1>

      <div class="shop-grid">
        ${STAR_PACKS.map(p => `
          <div class="shop-item">
            <div class="shop-item-stars">★${p.stars}</div>
            <button class="menu-btn shop-buy affordable" data-pack="${p.id}">
              <span class="nbuck-coin">N</span>${p.nbucks}
            </button>
          </div>`).join('')}
      </div>

      <button class="menu-btn secondary" id="back">Back</button>
    </div>`;
  root.querySelector('#back').onclick = onBack;
  root.querySelectorAll('[data-pack]').forEach(btn => {
    btn.onclick = () => onBuyStars(btn.dataset.pack);
  });
}
