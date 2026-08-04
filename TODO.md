# TODO

## 重新生成（Regenerate）不會回滾狀態 — 待設計

**症狀**：玩家按 `重新生成` 後，數值會累積。連按三次，遊戲時間就前進三次。

**原始回報是「地點、場景記憶沒有重新抓取」，但那部分其實是正常的**：
[`handleRegenerate`](src/App.tsx) 回捲到上一則玩家輸入後呼叫 `handleSendMessage`，
而後者呼叫 `buildPromptWrapper` 時**沒有**傳 `locationOverride`，讀的就是當下最新的
`currentLocation` 與 `memories`。地點與場景記憶每次都是重抓的。

**真正的問題是上一次生成執行過的 COMMANDS 不會被撤銷**：

| 指令 | 重新生成後的殘留 |
|---|---|
| `TIME` | 時間已推進，且每按一次再推進一次（TIME 是每回應必須輸出） |
| `STAT` | HP／MP／金幣已增減 |
| `ITEM_ADD` / `ITEM_USE` | 道具已入袋／已消耗 |
| `AFFINITY` | 好感度已變動 |
| `MEMORY_ADD` | 記憶已寫入，且會重複寫入近乎相同的內容 |
| `NPC_NEW` | NPC 已建檔，可能出現重複角色 |
| `LOCATION` | 地點已改變（連帶影響下一次 buildPrompt 的候選 NPC） |

**為什麼不順手修**：需要在每回合執行 COMMANDS 前存一份狀態快照，重新生成時先還原
再重跑。牽涉 `useGameStore`（快照要不要進存檔？）、`commandEffects`（副作用如
`merge_npc_memories` 這類非同步任務已經送出去了怎麼撤）、以及 `App.tsx` 的
重入時序。屬於設計題，不是 bug 修正。

**曾考慮但否決的折衷**：重新生成時直接跳過 COMMANDS 執行。實作簡單，但新敘事若
寫「你被砍了一刀」數值不會跟著變，敘事與數值會脫節——比現在的重複累加更難察覺。

**建議切入點**：
1. 先定義「一回合」的狀態邊界（哪些欄位算回合狀態、哪些是全域）
2. 在 `useCommandParser.parseAndExecuteCommands` 之前存快照（記憶體即可，不必進存檔）
3. `handleRegenerate` 先還原快照再送出
4. 只保留最近一回合的快照，避免存檔膨脹
5. 非同步任務（`asyncTasks`）需要一併取消或標記作廢
