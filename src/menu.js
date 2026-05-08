import { SHAPES, PROJECTILE_KINDS } from './throwables.js';
import { STAR_PACKS } from './progression.js';
import { renderShapePreview } from './preview.js';

// Single-screen flow: shows current gold + nbucks, lets the player buy
// throwables (with stars) and star packs (with nbucks), then hit Play.
// Re-rendered on each buy via the caller.
export function showShop(root, save, { onPlay, onBuy, onBuyStars }) {
  const inv = save.inventory || {};
  const items = PROJECTILE_KINDS.filter(k => SHAPES[k].cost > 0);
  root.innerHTML = `
    <div class="screen">
      <h1>Shop</h1>
      <div class="sub">★ ${save.gold || 0} &nbsp;·&nbsp; ⓝ ${save.nbucks || 0}</div>

      <div class="shop-section">Throwables</div>
      <div class="shop-grid">
        ${items.map(k => {
          const cost = SHAPES[k].cost;
          const owned = inv[k] || 0;
          const canAfford = (save.gold || 0) >= cost;
          const icon = renderShapePreview(k, 128);
          return `
            <div class="shop-item">
              <img class="shop-item-icon" src="${icon}" alt="${SHAPES[k].label}" />
              <div class="shop-item-name">${SHAPES[k].label}</div>
              <div class="shop-item-count">×${owned}</div>
              <button class="menu-btn secondary shop-buy" data-buy="${k}" ${canAfford ? '' : 'disabled'}>
                ★${cost}
              </button>
            </div>`;
        }).join('')}
      </div>

      <div class="shop-section">Buy Stars</div>
      <div class="shop-grid">
        ${STAR_PACKS.map(p => {
          const canAfford = (save.nbucks || 0) >= p.nbucks;
          return `
            <div class="shop-item">
              <div class="shop-item-stars">★${p.stars}</div>
              <button class="menu-btn secondary shop-buy" data-pack="${p.id}" ${canAfford ? '' : 'disabled'}>
                ⓝ ${p.nbucks}
              </button>
            </div>`;
        }).join('')}
      </div>

      <button class="menu-btn" id="play">Play</button>
    </div>`;
  root.querySelector('#play').onclick = onPlay;
  root.querySelectorAll('[data-buy]').forEach(btn => {
    btn.onclick = () => onBuy(btn.dataset.buy);
  });
  root.querySelectorAll('[data-pack]').forEach(btn => {
    btn.onclick = () => onBuyStars(btn.dataset.pack);
  });
}
