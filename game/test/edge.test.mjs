// Kenar durumları (test sorumlusu)
import assert from 'node:assert/strict';
import { createGame } from '../src/core/world.js';
import * as combat from '../src/core/combat.js';

const g = createGame(null, { seed: 9 });
g.startNewGame(); g.chooseStarter('ejder_ates'); g.enterZone('kiyi');
const m = g.monsters.find((x) => x.alive && !x.isGuardian);
g.pos = { x: m.pos.x + 1, z: m.pos.z };
const b = g.startFight(m.uid);
assert.ok(b, 'savaş açıldı');
b.player.hp = Math.round(b.player.maxHp * 0.3);
const s = JSON.parse(JSON.stringify(g.toSave()));
assert.ok(s.fight, 'savaş kaydı var');
const g2 = createGame(s, { seed: 9 });
assert.equal(g2.creature.hp, Math.round(b.player.maxHp * 0.3), 'yenileme ile can dolmaz');

// Yaralıyken Kıyı açık, Bozkır kapalı
const g3 = createGame(null, { seed: 3 });
g3.startNewGame(); g3.chooseStarter('ejder_tas');
g3.unlockedZones.push('bozkir');
g3.creature.woundedUntil = g3.clock + 30;
assert.equal(g3.canEnterZone('kiyi'), true);
assert.equal(g3.canEnterZone('bozkir'), false);

// Kemer boşken savaş açılır ve oynanır
const g4 = createGame(null, { seed: 4 });
g4.startNewGame(); g4.chooseStarter('ejder_su');
g4.belt = [null, null, null, null]; g4.bag = {};
g4.enterZone('kiyi');
const m4 = g4.monsters.find((x) => x.alive && !x.isGuardian);
g4.pos = { x: m4.pos.x + 1, z: m4.pos.z };
const b4 = g4.startFight(m4.uid);
while (!b4.over && b4.turn < 200) combat.playTurn(b4, combat.autoChoice(b4));
assert.ok(b4.over, 'kemersiz savaş biter');
g4.finishFight(b4);
console.log('edge testleri geçti');
