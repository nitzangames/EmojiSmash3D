import { WORLDS, LEVELS, emojiUrl } from './levels.js';
import { isLevelUnlocked, isEndlessUnlocked } from './progression.js';

const ORDERED = LEVELS.map(l => l.id);

export function showMainMenu(root, save, { onPuzzle, onZen, onEndless }) {
  root.innerHTML = `
    <div class="screen">
      <h1>8-Bit Smash</h1>
      <div class="sub">Knock 'em all off.</div>
      <button class="menu-btn" id="puzzle">Play Puzzle</button>
      <button class="menu-btn" id="zen">Play Zen</button>
      <button class="menu-btn secondary" id="endless" ${isEndlessUnlocked(save, ORDERED) ? '' : 'disabled'}>
        ${isEndlessUnlocked(save, ORDERED) ? 'Endless Mode' : 'Endless (clear all 50 puzzles)'}
      </button>
    </div>`;
  root.querySelector('#puzzle').onclick = onPuzzle;
  root.querySelector('#zen').onclick    = onZen;
  if (isEndlessUnlocked(save, ORDERED)) root.querySelector('#endless').onclick = onEndless;
}

export function showLevelSelect(root, save, mode, { onPick, onBack }) {
  let activeWorld = WORLDS[0].id;
  const render = () => {
    root.innerHTML = `
      <div class="screen">
        <h1>${mode === 'puzzle' ? 'Puzzle Mode' : 'Zen Mode'}</h1>
        <div class="world-tabs">
          ${WORLDS.map(w => `<button data-w="${w.id}" class="${w.id === activeWorld ? 'active' : ''}">${w.title}</button>`).join('')}
        </div>
        <div class="level-grid">
          ${LEVELS.filter(l => l.world === activeWorld).map(l => {
            const unlocked = isLevelUnlocked(l.id, save, ORDERED);
            const stars = save.puzzle?.[l.id]?.stars || 0;
            return `<div class="level-cell ${unlocked ? '' : 'locked'}" data-id="${l.id}">
              <img src="${emojiUrl(l.codepoint)}" alt="${l.name}"/>
              <div class="stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
            </div>`;
          }).join('')}
        </div>
        <button class="menu-btn secondary" id="back">Back</button>
      </div>`;
    root.querySelector('#back').onclick = onBack;
    root.querySelectorAll('.world-tabs button').forEach(b => {
      b.onclick = () => { activeWorld = b.dataset.w; render(); };
    });
    root.querySelectorAll('.level-cell:not(.locked)').forEach(cell => {
      cell.onclick = () => onPick(cell.dataset.id);
    });
  };
  render();
}
