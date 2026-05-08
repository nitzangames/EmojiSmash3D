export class Hud {
  constructor(rootEl) {
    this.root = rootEl;
    this.root.innerHTML = `
      <div class="hud-row hud-top">
        <div class="hud-side hud-left">
          <button class="hud-btn" id="restart" title="Restart">⟲</button>
        </div>
        <div class="hud-label" id="lvl-label">—</div>
        <div class="hud-side hud-right">
          <div class="hud-gold" id="gold">★ 0</div>
          <button class="hud-btn" id="pause" title="Pause">‖</button>
        </div>
      </div>
      <div class="hud-row hud-bottom hud-bottom-center">
        <div class="ammo-picker">
          <button class="hud-btn ammo-arrow" id="ammo-prev" title="Previous">◀</button>
          <div class="ammo-label" id="ammo-label"></div>
          <button class="hud-btn ammo-arrow" id="ammo-next" title="Next">▶</button>
        </div>
      </div>
    `;
    this.lvlLabel  = this.root.querySelector('#lvl-label');
    this.goldEl    = this.root.querySelector('#gold');
    this.restart   = this.root.querySelector('#restart');
    this.pause     = this.root.querySelector('#pause');
    this.ammoLabel = this.root.querySelector('#ammo-label');
    this.ammoPrev  = this.root.querySelector('#ammo-prev');
    this.ammoNext  = this.root.querySelector('#ammo-next');
  }
  setLevel(name) { this.lvlLabel.textContent = name; }
  setGold(g)     { this.goldEl.textContent = `★ ${g}`; }
  // Pass count = null/undefined to render ∞ (e.g. ball).
  setAmmo(name, count, iconSrc) {
    const display = (count === null || count === undefined) ? '∞' : `×${count}`;
    this.ammoLabel.innerHTML =
      `<img class="ammo-icon" src="${iconSrc}" alt="${name}" />` +
      `<div class="ammo-meta"><span class="ammo-name">${name}</span><span class="ammo-count">${display}</span></div>`;
  }
  onAmmoPrev(fn) { this.ammoPrev.onclick = fn; }
  onAmmoNext(fn) { this.ammoNext.onclick = fn; }
  onRestart(fn)  { this.restart.onclick = fn; }
  onPause(fn)    { this.pause.onclick = fn; }
}

export function showLevelClear(rootEl, { reward, onDouble, onNext }) {
  const html = `
    <div class="modal" id="modal-clear">
      <div class="panel">
        <h2>Level cleared!</h2>
        <div class="reward">+ ★${reward}</div>
        <button id="watch-ad">Double ★ — Watch Ad</button>
        <button id="next" class="secondary">Next</button>
      </div>
    </div>`;
  rootEl.insertAdjacentHTML('beforeend', html);
  const modal = rootEl.querySelector('#modal-clear');
  const adBtn   = modal.querySelector('#watch-ad');
  const rewardEl = modal.querySelector('.reward');
  adBtn.onclick = async () => {
    adBtn.disabled = true;
    adBtn.textContent = 'Watching ad...';
    // Stub for the platform SDK's rewarded-video flow — short delay so the
    // user sees the state change, then double the reward.
    await new Promise(r => setTimeout(r, 1500));
    onDouble?.();
    rewardEl.textContent = `+ ★${reward * 2}`;
    adBtn.remove();
  };
  modal.querySelector('#next').onclick = () => { modal.remove(); onNext?.(); };
}

export function showPauseMenu(rootEl, {
  onResume, onRestart, onShop,
  onToggleSfx, onToggleHaptics,
  sfxOn, hapticsOn,
}) {
  const html = `
    <div class="modal" id="modal-pause">
      <div class="panel">
        <h2>Paused</h2>
        <button id="resume">Resume</button>
        <button id="restart" class="secondary">Restart</button>
        <button id="shop" class="secondary">Shop</button>
        <button id="sfx" class="secondary">${sfxOn ? 'SFX: On' : 'SFX: Off'}</button>
        <button id="haptics" class="secondary">${hapticsOn ? 'Haptics: On' : 'Haptics: Off'}</button>
      </div>
    </div>`;
  rootEl.insertAdjacentHTML('beforeend', html);
  const modal = rootEl.querySelector('#modal-pause');
  modal.querySelector('#resume').onclick   = () => { modal.remove(); onResume?.(); };
  modal.querySelector('#restart').onclick  = () => { modal.remove(); onRestart?.(); };
  modal.querySelector('#shop').onclick     = () => { modal.remove(); onShop?.(); };
  modal.querySelector('#sfx').onclick      = () => { modal.remove(); onToggleSfx?.(); };
  modal.querySelector('#haptics').onclick  = () => { modal.remove(); onToggleHaptics?.(); };
}
