import { SHAPES, PROJECTILE_KINDS } from './throwables.js';
import { STAR_PACKS } from './progression.js';
import { renderShapePreview } from './preview.js';

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
    btn.onclick = () => onBuy(btn.dataset.buy);
  });
}

// Dedicated nbucks → stars screen.
export function showBuyStars(root, save, { onBack, onBuyStars }) {
  root.innerHTML = `
    <div class="screen">
      <div class="shop-balance">★ ${save.gold || 0}</div>
      <h1>Buy Stars</h1>
      <div class="sub">ⓝ ${save.nbucks || 0}</div>

      <div class="shop-grid">
        ${STAR_PACKS.map(p => {
          const canAfford = (save.nbucks || 0) >= p.nbucks;
          const buyClass = `menu-btn shop-buy ${canAfford ? 'affordable' : 'secondary'}`;
          return `
            <div class="shop-item">
              <div class="shop-item-stars">★${p.stars}</div>
              <button class="${buyClass}" data-pack="${p.id}" ${canAfford ? '' : 'disabled'}>
                ⓝ ${p.nbucks}
              </button>
            </div>`;
        }).join('')}
      </div>

      <button class="menu-btn secondary" id="back">Back</button>
    </div>`;
  root.querySelector('#back').onclick = onBack;
  root.querySelectorAll('[data-pack]').forEach(btn => {
    btn.onclick = () => onBuyStars(btn.dataset.pack);
  });
}
