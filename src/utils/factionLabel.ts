import { Faction, FactionRelation } from '../types';

/**
 * 勢力類型與關係的中文標籤，唯一入口。
 *
 * 先前這兩組對照散在三個地方各寫一份：`LorebookEntry` 的 `<option>` 清單、
 * 勢力卡片的三元運算式鏈、`MapModal` 的星圖標籤——而且措辭還不一致
 * （同一個 `ally` 在星圖是「盟友」、在編輯面板是「同盟」）。
 */
export const FACTION_TYPE_LABEL: Record<Faction['type'], string> = {
  race:     '種族',
  guild:    '公會',
  nation:   '國家',
  religion: '宗教',
  criminal: '犯罪',
  other:    '其他',
};

export const FACTION_RELATION_LABEL: Record<FactionRelation['type'], string> = {
  ally:    '同盟',
  enemy:   '敵對',
  rival:   '競爭',
  vassal:  '附庸',
  neutral: '中立',
};

export const factionTypeLabel = (t?: Faction['type']): string =>
  (t && FACTION_TYPE_LABEL[t]) || FACTION_TYPE_LABEL.other;

export const factionRelationLabel = (t?: FactionRelation['type']): string =>
  (t && FACTION_RELATION_LABEL[t]) || FACTION_RELATION_LABEL.neutral;
