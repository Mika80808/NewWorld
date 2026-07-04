import { describe, it, expect } from 'vitest';
import { saveDataMapper, CURRENT_SCHEMA } from '../useGameStore';

describe('saveDataMapper — 空存檔預設值', () => {
  it('回傳完整預設結構', () => {
    const d = saveDataMapper({});
    expect(d.schemaVersion).toBe(CURRENT_SCHEMA);
    expect(d.profile.hp).toBe(50);
    expect(d.profile.job).toBe('異鄉人');
    expect(d.npcs).toEqual([]);
    expect(d.factions).toEqual([]);
    expect(d.statusEffects).toEqual([]);
    expect(Array.isArray(d.messages)).toBe(true);
  });

  it('新遊戲隨機開場：時間在合法範圍', () => {
    const d = saveDataMapper({});
    expect(d.timeState.hour).toBeGreaterThanOrEqual(0);
    expect(d.timeState.hour).toBeLessThan(24);
    expect(d.timeState.day).toBeGreaterThanOrEqual(1);
    expect(d.timeState.day).toBeLessThanOrEqual(30);
    expect(d.currentLocation).toBeTruthy();
  });
});

describe('saveDataMapper — schema migration', () => {
  it('v1 → v2：inventory/consumables 更名為 equipment/items', () => {
    const d = saveDataMapper({
      schemaVersion: 1,
      inventory: [{ id: 1, name: '鐵劍', description: '', isEquipped: true }],
      consumables: [{ id: 2, name: '草藥', quantity: 3, description: '' }],
      currentLocation: '月湖鎮',
      timeState: { year: 1024, month: 4, day: 15, hour: 12, minute: 0, weather: '晴朗' },
    });
    expect(d.equipment).toHaveLength(1);
    expect(d.equipment[0]).toMatchObject({ name: '鐵劍', isEquipped: true });
    expect(d.items).toHaveLength(1);
    expect(d.items[0]).toMatchObject({ name: '草藥', quantity: 3 });
  });

  it('v2 → v3：補上空 factions 陣列', () => {
    const d = saveDataMapper({ schemaVersion: 2, currentLocation: '月湖鎮' });
    expect(d.factions).toEqual([]);
    expect(d.schemaVersion).toBe(CURRENT_SCHEMA);
  });

  it('NPC 舊字串記憶轉為 NpcMemory 物件', () => {
    const d = saveDataMapper({
      schemaVersion: 3,
      currentLocation: '月湖鎮',
      npcs: [{
        id: 1, name: '芬里爾', job: '獵人', affection: 10, affectionLabel: '',
        appearance: '', personality: '', category: 'NPC', isActive: true,
        memories: ['救過玩家一命'],
      }],
    });
    const mem = d.npcs[0].memories[0];
    expect(mem).toMatchObject({ text: '救過玩家一命', source: 'manual', importance: 'normal' });
    expect(mem.id).toContain('nmem_legacy');
  });

  it('quests 補上 isGoalMet 預設值', () => {
    const d = saveDataMapper({
      schemaVersion: 3,
      currentLocation: '月湖鎮',
      quests: [{
        id: 'q1', title: '任務', giver: '', description: '', reward: {},
        status: 'active', createdAt: '4/15', createdAtTotalDays: 100,
      }],
    });
    expect(d.quests[0].isGoalMet).toBe(false);
  });

  it('保留既有 profile 數值不被預設值覆蓋', () => {
    const d = saveDataMapper({
      schemaVersion: 3,
      currentLocation: '月湖鎮',
      profile: { name: '陸星辰', hp: 0, mp: 5, gold: 999 },
    });
    // hp: 0 是合法值（?? 不會覆蓋），name 保留
    expect(d.profile).toMatchObject({ name: '陸星辰', hp: 0, mp: 5, gold: 999 });
  });
});
