import { PUZZLE_BALLS } from './constants.js';

export class Hud {
  constructor(rootEl) {
    this.root = rootEl;
    this.root.innerHTML = `
      <div class="hud-row hud-top">
        <div class="hud-label" id="lvl-label">—</div>
        <div class="hud-gold" id="gold">★ 0</div>
        <div id="counter"></div>
      </div>
      <div class="hud-row hud-bottom">
        <button class="hud-btn" id="restart" title="Restart">⟲</button>
        <button class="hud-btn" id="pause"   title="Pause">‖</button>
      </div>
    `;
    this.lvlLabel = this.root.querySelector('#lvl-label');
    this.goldEl   = this.root.querySelector('#gold');
    this.counter  = this.root.querySelector('#counter');
    this.restart  = this.root.querySelector('#restart');
    this.pause    = this.root.querySelector('#pause');
  }
  setLevel(name) { this.lvlLabel.textContent = name; }
  setGold(g)     { this.goldEl.textContent = `★ ${g}`; }
  setPuzzle(remaining) {
    const pips = [];
    for (let i = 0; i < PUZZLE_BALLS; i++) pips.push(`<div class="hud-pip ${i < remaining ? 'full' : ''}"></div>`);
    this.counter.innerHTML = `<div class="hud-pips">${pips.join('')}</div>`;
  }
  setZen(shots, pb) {
    const pbStr = pb !== null ? ` / PB ${pb}` : '';
    this.counter.innerHTML = `<div class="hud-label">Shots: ${shots}${pbStr}</div>`;
  }
  onRestart(fn) { this.restart.onclick = fn; }
  onPause(fn)   { this.pause.onclick = fn; }
}

export function showLevelClear(rootEl, { stars, shots, mode, onContinue, onRetry }) {
  const star = '★';
  const dim  = '☆';
  const starStr = mode === 'puzzle' ? `<div class="stars">${star.repeat(stars)}${dim.repeat(3-stars)}</div>` : '';
  const shotStr = mode === 'zen'    ? `<div class="hud-label">${shots} shots</div>` : '';
  const html = `
    <div class="modal" id="modal-clear">
      <div class="panel">
        <h2>Level cleared!</h2>
        ${starStr}${shotStr}
        <button id="continue">Continue</button>
        <button id="retry" class="secondary">Replay</button>
      </div>
    </div>`;
  rootEl.insertAdjacentHTML('beforeend', html);
  const modal = rootEl.querySelector('#modal-clear');
  modal.querySelector('#continue').onclick = () => { modal.remove(); onContinue?.(); };
  modal.querySelector('#retry').onclick    = () => { modal.remove(); onRetry?.(); };
}

export function showPauseMenu(rootEl, { onResume, onRestart, onLevelSelect, onToggleSound, muted }) {
  const html = `
    <div class="modal" id="modal-pause">
      <div class="panel">
        <h2>Paused</h2>
        <button id="resume">Resume</button>
        <button id="restart" class="secondary">Restart</button>
        <button id="select" class="secondary">Level Select</button>
        <button id="sound" class="secondary">${muted ? 'Sound: Off' : 'Sound: On'}</button>
      </div>
    </div>`;
  rootEl.insertAdjacentHTML('beforeend', html);
  const modal = rootEl.querySelector('#modal-pause');
  modal.querySelector('#resume').onclick   = () => { modal.remove(); onResume?.(); };
  modal.querySelector('#restart').onclick  = () => { modal.remove(); onRestart?.(); };
  modal.querySelector('#select').onclick   = () => { modal.remove(); onLevelSelect?.(); };
  modal.querySelector('#sound').onclick    = () => { modal.remove(); onToggleSound?.(); };
}

export function showFail(rootEl, { onRetry, onLevelSelect }) {
  const html = `
    <div class="modal" id="modal-fail">
      <div class="panel">
        <h2>Out of balls</h2>
        <button id="retry">Retry</button>
        <button id="select" class="secondary">Level Select</button>
      </div>
    </div>`;
  rootEl.insertAdjacentHTML('beforeend', html);
  const modal = rootEl.querySelector('#modal-fail');
  modal.querySelector('#retry').onclick    = () => { modal.remove(); onRetry?.(); };
  modal.querySelector('#select').onclick   = () => { modal.remove(); onLevelSelect?.(); };
}
