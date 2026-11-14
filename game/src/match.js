// The match: rounds, money, the bomb and the win. One object owns the whole state so
// main.js never keeps a second copy of it. First to 8 rounds takes the match (15
// rounds max); a round is won by eliminating the other team, by the bomb going off,
// by a defuse, or by the defenders surviving the clock with no plant.
import { WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './weapon.js';

export const BUY_SECONDS = 12;
export const ROUND_SECONDS = 100;
export const PLANT_SECONDS = 3.5;
export const DEFUSE_SECONDS = 5;
export const FUSE_SECONDS = 35;
export const WIN_ROUNDS = 8;
export const MAX_ROUNDS = 15;
export const KILL_REWARD = 300;
export const WIN_REWARD = 3250;
export const LOSS_REWARD = 1900;

export function createMatch(onEvent) {
  const state = {
    phase: 'buy', // buy | live | roundEnd | matchEnd
    phaseTime: BUY_SECONDS,
    round: 1,
    scoreEmber: 0,
    scoreSlate: 0,
    money: 800,
    kills: 0,
    deaths: 0,
    bomb: 'carried', // carried | dropped | planted | gone
    bombSite: null,
    bombPos: null,
    fuse: 0,
    carrier: 'bot',
    winner: null,
    reason: '',
  };

  function emit(type, data) {
    if (onEvent) onEvent(type, data);
  }

  function startMatch() {
    state.phase = 'buy';
    state.phaseTime = BUY_SECONDS;
    state.round = 1;
    state.scoreEmber = 0;
    state.scoreSlate = 0;
    state.money = 800;
    state.kills = 0;
    state.deaths = 0;
    state.bomb = 'carried';
    state.bombSite = null;
    state.fuse = 0;
    state.carrier = 'bot';
    state.winner = null;
    emit('matchStart', { round: 1 });
  }

  function startRound() {
    state.phase = 'buy';
    state.phaseTime = BUY_SECONDS;
    state.bomb = 'carried';
    state.bombSite = null;
    state.fuse = 0;
    state.carrier = 'bot';
    emit('roundStart', { round: state.round });
  }

  function endRound(winner, reason) {
    if (state.phase === 'roundEnd' || state.phase === 'matchEnd') return;
    state.winner = winner;
    state.reason = reason;
    if (winner === 'ember') {
      state.scoreEmber += 1;
      state.money += WIN_REWARD;
    } else {
      state.scoreSlate += 1;
      state.money += LOSS_REWARD;
    }
    emit('roundEnd', { winner, reason, round: state.round, scoreEmber: state.scoreEmber, scoreSlate: state.scoreSlate });
    if (state.scoreEmber >= WIN_ROUNDS || state.scoreSlate >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
      state.phase = 'matchEnd';
      state.phaseTime = 6;
      const matchWinner = state.scoreEmber === state.scoreSlate ? 'draw' : state.scoreEmber > state.scoreSlate ? 'ember' : 'slate';
      emit('matchEnd', { winner: matchWinner, scoreEmber: state.scoreEmber, scoreSlate: state.scoreSlate });
    } else {
      state.phase = 'roundEnd';
      state.phaseTime = 4;
    }
  }

  function step(dt, alive) {
    if (state.phase === 'buy' || state.phase === 'live' || state.phase === 'roundEnd' || state.phase === 'matchEnd') {
      state.phaseTime -= dt;
    }
    if (state.phase === 'buy' && state.phaseTime <= 0) {
      state.phase = 'live';
      state.phaseTime = ROUND_SECONDS;
      emit('live', { round: state.round });
    } else if (state.phase === 'live') {
      if (state.bomb === 'planted') {
        state.fuse -= dt;
        if (state.fuse <= 0) {
          state.bomb = 'gone';
          endRound('ember', 'The charge detonated.');
          return;
        }
      } else if (state.phaseTime <= 0) {
        endRound('slate', 'Time expired — the charge was never planted.');
        return;
      }
      if (alive.ember <= 0 && alive.slate > 0) endRound('slate', 'Ember team eliminated.');
      else if (alive.slate <= 0 && alive.ember > 0) endRound('ember', 'Slate team eliminated.');
      else if (alive.ember <= 0 && alive.slate <= 0) endRound('slate', 'Both teams eliminated.');
    } else if (state.phase === 'roundEnd' && state.phaseTime <= 0) {
      state.round += 1;
      startRound();
    } else if (state.phase === 'matchEnd' && state.phaseTime <= 0) {
      startMatch();
      emit('rematch', {});
    }
  }

  function awardKill() {
    state.kills += 1;
    state.money += KILL_REWARD;
    emit('killReward', { money: state.money });
  }

  function plant(site) {
    state.bomb = 'planted';
    state.bombSite = site;
    state.fuse = FUSE_SECONDS;
    state.money += KILL_REWARD;
    emit('planted', { site, fuse: FUSE_SECONDS });
  }

  function defuse() {
    state.bomb = 'gone';
    endRound('slate', 'The charge was defused.');
  }

  function dropBomb(pos) {
    if (state.bomb !== 'carried') return;
    state.bomb = 'dropped';
    state.bombPos = { x: pos.x, z: pos.z };
    state.carrier = null;
    emit('bombDropped', { pos: state.bombPos });
  }

  function pickupBomb(byPlayer) {
    if (state.bomb !== 'dropped') return false;
    state.bomb = 'carried';
    state.carrier = byPlayer ? 'player' : 'bot';
    state.bombPos = null;
    emit('bombPickedUp', { byPlayer });
    return true;
  }

  function buyWeapon(id, currentId) {
    const def = WEAPONS[id];
    if (!def || id === currentId) return { ok: false, reason: 'already owned' };
    if (state.phase !== 'buy') return { ok: false, reason: 'buy phase is over' };
    if (state.money < def.price) return { ok: false, reason: 'not enough money' };
    state.money -= def.price;
    emit('bought', { id, money: state.money });
    return { ok: true };
  }

  function buyGrenade() {
    if (state.phase !== 'buy') return { ok: false, reason: 'buy phase is over' };
    if (state.money < GRENADE_PRICE) return { ok: false, reason: 'not enough money' };
    state.money -= GRENADE_PRICE;
    emit('bought', { id: 'grenade', money: state.money });
    return { ok: true };
  }

  function buyArmor() {
    if (state.phase !== 'buy') return { ok: false, reason: 'buy phase is over' };
    if (state.money < ARMOR_PRICE) return { ok: false, reason: 'not enough money' };
    state.money -= ARMOR_PRICE;
    emit('bought', { id: 'armor', money: state.money });
    return { ok: true };
  }

  function timerText() {
    const total = Math.max(0, Math.ceil(state.phaseTime));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  return { state, startMatch, startRound, endRound, step, awardKill, plant, defuse, dropBomb, pickupBomb, buyWeapon, buyGrenade, buyArmor, timerText };
}
