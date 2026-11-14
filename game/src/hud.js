// The DOM HUD: health, ammo, timer, score, money, killfeed, banners and the buy
// menu. It never touches the simulation; main.js pushes numbers in and reads the
// play and buy callbacks out.
import { WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './weapon.js';

const COPY = {
  start: {
    title: 'Foundry Yard',
    copy: 'Five attackers against five defenders in a dusk-lit foundry yard. Plant the charge at A or B, or eliminate the other team. Buy between rounds. Stop, aim, and make the shot count.',
    action: 'Click to play',
  },
  paused: {
    title: 'Foundry Yard',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  dead: {
    title: 'You are down',
    copy: 'Your team is still fighting. Click to spectate the round.',
    action: 'Spectate',
  },
  matchEnd: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const els = {
    overlay: $('overlay'), title: $('overlay-title'), copy: $('overlay-copy'), play: $('play'),
    health: $('health'), healthNum: $('health-num'), healthBar: $('health-bar'),
    ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'), ammo: $('ammo'),
    weaponTitle: $('weapon-title'), weaponSub: $('weapon-sub'),
    scoreEmber: $('score-ember'), scoreSlate: $('score-slate'), roundLabel: $('round-label'),
    timer: $('timer'), money: $('money'), bombStatus: $('bomb-status'),
    killfeed: $('killfeed'), banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
    prompt: $('prompt'), promptText: $('prompt-text'), promptBar: $('prompt-bar'),
    hitmarker: $('hitmarker'), crosshair: $('crosshair'), vignette: $('vignette'),
    buy: $('buy'), buyGrid: $('buy-grid'), buyMoney: $('buy-money'),
  };
  let bannerTimer = 0;
  let markerTimer = 0;
  let onPlayCallback = null;
  let onBuyCallback = null;

  els.play.addEventListener('click', () => { if (onPlayCallback) onPlayCallback(); });

  function showOverlay(kind, scoreText) {
    const c = COPY[kind] || COPY.start;
    els.title.innerHTML = kind === 'matchEnd' ? c.title : 'Foundry <span class="ember">Yard</span>';
    els.copy.textContent = kind === 'matchEnd' ? scoreText : c.copy;
    els.play.textContent = c.action;
    els.overlay.hidden = false;
  }
  function hideOverlay() { els.overlay.hidden = true; }
  function onPlay(cb) { onPlayCallback = cb; }

  function setHealth(hp, armor) {
    els.healthNum.textContent = String(Math.max(0, Math.round(hp)));
    els.healthBar.style.width = `${Math.max(0, Math.min(100, hp))}%`;
    els.health.classList.toggle('low', hp <= 30);
    els.healthNum.textContent = armor > 0 ? `${Math.max(0, Math.round(hp))} +${Math.round(armor)}` : String(Math.max(0, Math.round(hp)));
  }
  function setAmmo(mag, reserve) {
    els.ammoMag.textContent = String(mag);
    els.ammoReserve.textContent = `/ ${reserve}`;
    els.ammo.classList.toggle('empty', mag === 0);
  }
  function setWeapon(id) {
    const d = WEAPONS[id];
    els.weaponTitle.textContent = d.name;
    els.weaponSub.textContent = d.sub;
  }
  function setScore(ember, slate, round) {
    els.scoreEmber.textContent = String(ember);
    els.scoreSlate.textContent = String(slate);
    els.roundLabel.textContent = `Round ${round}`;
  }
  function setTimer(text, urgent) {
    els.timer.textContent = text;
    els.timer.classList.toggle('urgent', !!urgent);
  }
  function setMoney(amount) {
    els.money.textContent = `$${amount}`;
    els.buyMoney.textContent = `$${amount}`;
  }
  function setBombPlanted(secondsLeft) {
    els.bombStatus.hidden = false;
    const t = Math.max(0, Math.ceil(secondsLeft));
    els.bombStatus.textContent = `BOMB PLANTED — 0:${String(t).padStart(2, '0')}`;
  }
  function clearBomb() { els.bombStatus.hidden = true; }
  function hitMarker(kill, holdMs) {
    els.hitmarker.classList.add('on');
    els.hitmarker.classList.toggle('kill', !!kill);
    markerTimer = holdMs;
  }
  function showBanner(title, sub, holdMs = 2200) {
    els.bannerTitle.textContent = title;
    els.bannerSub.textContent = sub;
    els.banner.classList.add('on');
    bannerTimer = holdMs;
  }
  function showPrompt(text, progress) {
    els.prompt.hidden = false;
    els.promptText.textContent = text;
    els.promptBar.style.width = `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
  }
  function hidePrompt() { els.prompt.hidden = true; }
  function damageFlash() {
    els.vignette.classList.add('on');
    setTimeout(() => els.vignette.classList.remove('on'), 140);
  }
  function feed(killer, victim, headshot) {
    const line = document.createElement('div');
    line.innerHTML = `<b>${killer}</b> ${headshot ? '<span class="headshot">◉</span> ' : '✕ '}<b>${victim}</b>`;
    els.killfeed.prepend(line);
    while (els.killfeed.children.length > 5) els.killfeed.lastChild.remove();
    setTimeout(() => line.remove(), 6000);
  }
  function setCrosshairSpread(px) {
    els.crosshair.style.setProperty('--spread', `${px}px`);
    els.crosshair.style.transform = `translate(-50%, -50%) scale(${1 + px / 40})`;
  }

  // Buy menu: one card per item, click or number key buys. main.js owns the money.
  const BUY_ITEMS = [
    { id: 'rifle', name: 'VK-9 Rifle', desc: 'Auto rifle, 30 rounds. The workhorse.', price: WEAPONS.rifle.price },
    { id: 'smg', name: 'Hornet SMG', desc: 'Fast, close quarters. 32 rounds.', price: WEAPONS.smg.price },
    { id: 'pistol', name: 'P-9 Pistol', desc: 'Cheap, accurate sidearm. 12 rounds.', price: WEAPONS.pistol.price },
    { id: 'grenade', name: 'Frag grenade', desc: 'One grenade, thrown with G.', price: GRENADE_PRICE },
    { id: 'armor', name: 'Kevlar vest', desc: 'Absorbs 60% of each hit until it breaks.', price: ARMOR_PRICE },
  ];
  function renderBuy(money, ownedWeapon) {
    els.buyGrid.innerHTML = '';
    for (const item of BUY_ITEMS) {
      const div = document.createElement('div');
      div.className = 'item' + (item.id === ownedWeapon ? ' sel' : '');
      div.innerHTML = `<span class="price">$${item.price}</span><b>${item.name}</b><span>${item.desc}</span>`;
      div.addEventListener('click', () => { if (onBuyCallback) onBuyCallback(item.id); });
      els.buyGrid.appendChild(div);
    }
    setMoney(money);
  }
  function showBuy(show) {
    els.buy.classList.toggle('on', !!show);
    if (show) els.buy.style.display = 'block';
    else els.buy.style.display = 'none';
  }
  function onBuy(cb) { onBuyCallback = cb; }

  function step(dt) {
    if (bannerTimer > 0) {
      bannerTimer -= dt * 1000;
      if (bannerTimer <= 0) els.banner.classList.remove('on');
    }
    if (markerTimer > 0) {
      markerTimer -= dt * 1000;
      if (markerTimer <= 0) els.hitmarker.classList.remove('on');
    }
  }

  return {
    showOverlay, hideOverlay, onPlay, setHealth, setAmmo, setWeapon, setScore, setTimer,
    setMoney, setBombPlanted, clearBomb, hitMarker, showBanner, showPrompt, hidePrompt,
    damageFlash, feed, setCrosshairSpread, renderBuy, showBuy, onBuy, step,
  };
}
