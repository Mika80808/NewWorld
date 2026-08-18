import { describe, it, expect } from 'vitest';
import { setFactionRelation, removeFactionRelation } from '../factionRelation';
import { Faction } from '../../types';

const f = (id: number, name: string, over: Partial<Faction> = {}): Faction => ({
  id, name, type: 'guild', description: '', isActive: true, ...over,
});

const relOf = (factions: Faction[], id: number, target: number) =>
  factions.find(x => x.id === id)?.relations?.find(r => r.targetFactionId === target);

describe('setFactionRelation', () => {
  const base = () => [f(1, '獵人公會'), f(2, '黑牙氏族'), f(3, '狼族部落')];

  it('對稱關係雙向寫入', () => {
    const out = setFactionRelation(base(), 1, 2, 'enemy');
    expect(relOf(out, 1, 2)?.type).toBe('enemy');
    expect(relOf(out, 2, 1)?.type).toBe('enemy');
  });

  /**
   * vassal 是單向的——「A 附庸於 B」不代表「B 附庸於 A」。
   * 這條寫錯的話關係圖會出現兩個互相附庸的勢力，語意上不成立。
   */
  it('附庸只寫單向', () => {
    const out = setFactionRelation(base(), 1, 2, 'vassal');
    expect(relOf(out, 1, 2)?.type).toBe('vassal');
    expect(relOf(out, 2, 1)).toBeUndefined();
  });

  it('備註兩邊都帶上', () => {
    const out = setFactionRelation(base(), 1, 2, 'ally', '共同對抗盜賊');
    expect(relOf(out, 1, 2)?.note).toBe('共同對抗盜賊');
    expect(relOf(out, 2, 1)?.note).toBe('共同對抗盜賊');
  });

  it('沒有備註時不寫入空的 note 欄位', () => {
    const out = setFactionRelation(base(), 1, 2, 'ally');
    expect(relOf(out, 1, 2)).not.toHaveProperty('note');
  });

  it('同一組勢力之間只留一種關係（改了就覆蓋）', () => {
    let out = setFactionRelation(base(), 1, 2, 'ally');
    out = setFactionRelation(out, 1, 2, 'enemy');
    const rels = out.find(x => x.id === 1)!.relations!;
    expect(rels.filter(r => r.targetFactionId === 2)).toHaveLength(1);
    expect(relOf(out, 1, 2)?.type).toBe('enemy');
    expect(relOf(out, 2, 1)?.type).toBe('enemy');
  });

  /**
   * 從對稱關係改成 vassal 時，反向那筆必須被清掉——否則會留下
   * 「A 附庸於 B」加上「B 同盟 A」的殘骸。
   */
  it('對稱關係改成附庸時，反向那筆會被清掉', () => {
    let out = setFactionRelation(base(), 1, 2, 'ally');
    out = setFactionRelation(out, 1, 2, 'vassal');
    expect(relOf(out, 1, 2)?.type).toBe('vassal');
    expect(relOf(out, 2, 1)).toBeUndefined();
  });

  it('不影響與第三方的既有關係', () => {
    let out = setFactionRelation(base(), 1, 3, 'ally');
    out = setFactionRelation(out, 1, 2, 'enemy');
    expect(relOf(out, 1, 3)?.type).toBe('ally');
    expect(relOf(out, 3, 1)?.type).toBe('ally');
  });

  it('不能跟自己建立關係', () => {
    const out = setFactionRelation(base(), 1, 1, 'ally');
    expect(out.find(x => x.id === 1)?.relations ?? []).toHaveLength(0);
  });

  it('勢力不存在時原樣回傳', () => {
    const input = base();
    expect(setFactionRelation(input, 1, 99, 'ally')).toBe(input);
  });
});

describe('removeFactionRelation', () => {
  it('兩邊一起清，不留單向殘骸', () => {
    let out = setFactionRelation([f(1, 'A'), f(2, 'B')], 1, 2, 'enemy');
    out = removeFactionRelation(out, 1, 2);
    expect(relOf(out, 1, 2)).toBeUndefined();
    expect(relOf(out, 2, 1)).toBeUndefined();
  });

  it('解除附庸也要清乾淨', () => {
    let out = setFactionRelation([f(1, 'A'), f(2, 'B')], 1, 2, 'vassal');
    out = removeFactionRelation(out, 1, 2);
    expect(relOf(out, 1, 2)).toBeUndefined();
  });

  it('不影響與第三方的關係', () => {
    let out = setFactionRelation([f(1, 'A'), f(2, 'B'), f(3, 'C')], 1, 3, 'ally');
    out = setFactionRelation(out, 1, 2, 'enemy');
    out = removeFactionRelation(out, 1, 2);
    expect(relOf(out, 1, 3)?.type).toBe('ally');
  });
});
