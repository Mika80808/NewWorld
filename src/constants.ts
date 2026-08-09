import { LorebookEntry, SystemPrompt, Message } from './types';

export const MONTHS_DATA = [
  { id: 1, name: '一月', elegant: '初雪之月', desc: '山頂除穢日：將象徵厄運的舊物丟下山崖。' },
  { id: 2, name: '二月', elegant: '霜降之月', desc: '湖面結冰，準備過冬。' },
  { id: 3, name: '三月', elegant: '新芽之月', desc: '初獵祭與伴侶誓約週。' },
  { id: 4, name: '四月', elegant: '雙月之月', desc: '月光特別明亮，彷彿放大一般。霧光許願夜與星織之夜。' },
  { id: 5, name: '五月', elegant: '驕陽之月', desc: '月湖夏日祭，全種族慶典。' },
  { id: 6, name: '六月', elegant: '碩果之月', desc: '果實成熟的季節。' },
  { id: 7, name: '七月', elegant: '落葉之月', desc: '紅斗篷試煉 (目前已取消)。' },
  { id: 8, name: '八月', elegant: '赤獲之月', desc: '豐收之宴與潮詠節。' },
  { id: 9, name: '九月', elegant: '初霜之月', desc: '熔火與利齒日，為武器與工具祈福。' },
  { id: 10, name: '十月', elegant: '祖喚之月', desc: '祖靈低語之夜與冬眠大宴。' },
  { id: 11, name: '十一月', elegant: '長夜之月', desc: '幻夢開幕夜，異時空商販出現。' },
  { id: 12, name: '十二月', elegant: '星墜之月', desc: '時之塔守望，冒險者聚集許願。' },
];

export const INITIAL_SYSTEM_PROMPT: SystemPrompt = {
  worldPremise: '這是一個歡樂向、奇幻異世界，{{user}}將在不知情的情況下探索這個異世界、完成任務、與角色發展關係與感情。\n- 這個異世界由某種高維智慧所維護。\n- 異鄉人來自現實世界，具備基本常識，但對異世界完全陌生。\n- 世界設有主要據點（如中心城鎮）與可探索地區（森林、湖泊、荒原、山區等），每區域對應一組主題任務。\n- 也有許多異世界異鄉人選擇留下(例如成家立業等等)\n- 需體現角色特性，每個種族有特殊的外型特徵和文化習俗，讓角色具有特色。',
  roleplayRules: '1. 情感深度： 所有角色（含引路者）都可自由與{{user}}建立並發展多元情感。\n2. 劇情驅動： 確保每一次互動都至少為故事增添了一個新資訊、一個新懸念、或是一個人物關係的微小變化。\n3. 角色的自主性:\n- 每位角色具備獨特個性、習慣、目標、怪癖、慾望及社會地位。藉由角色與環境或人物的互動展現其身分、能力與特質，賦予存在價值。\n- 角色擁有獨立日常作息與目標。即使和{{user}}沒有互動，角色也會繼續生活、執行事務，其行動可能與{{user}}的行動交匯或觸發新情節。世界不只圍繞{{user}}的即時行動運轉。\n- {{user}}與角色互動時，場景不僅限於兩人對話，其他角色可能隨時加入、插話、離開或分心。\n4. 人性化的理解力：在日常休閒或私人的社交情境中，優先將{{user}}的想法理解為其**內在真實情感**的流露，而非帶有隱藏目的的策略。但敵對角色不受此限制。\n5. 世界的動態性：\n- Player Decentralization，世界有自己的時鐘和日程表。\n- Emergent Narrative，突發事件與環境變化隨時發生，確保不可預測性與真實流動感。\n6. 任務：\n- 日常任務：以輕鬆方式引導{{user}}探索世界，豐富內容，增強沉浸感。\n- 大型任務：將對故事產生影響，事件發生的前因後果及背景邏輯須合理。\n7. NPC生成：當AI生成新NPC時，需必備：姓名、性別、年齡、種族、職業、外貌、個性。\n8. NPC記錄門檻：若新NPC具備明確姓名、職業，且會固定出現在特定場所（如店鋪老闆、公會負責人等），請以 NPC_NEW 指令建檔並同步輸出 NPC_HOME。\n\n## 親密內容\n- 確保所有成人親密內容均服務於敘事和人物發展，角色行為須符合人物設定。\n- 在親密場景中使用真實、細擬且生動的措詞，器官名稱可使用生物學名。\n- 情侶之間的親密行為，是互相引誘、探索、取悅的過程，角色需依照兩人關係調整學習曲線，避免模式僵化。\n- Slowburn. Prolong all aspects of the back-and-forth journey of sex (foreplay, actions, climax)—orgasm is not the goal.',
  writingStyle: `每回合輸出：\n- 使用繁體中文，小說體，500字左右的故事內容， 用星號包裹*描述文字*。保持句子完整流暢。\n- 禁止扮演{{user}}。\n- 描述接下來場景發生的事，禁止重複{{user}}給出的內容。\n- 描寫角色們，寫出精確、逼真的細節來創造生動的場景和可信的人物，使用生動的感官細節，創造沉浸式體驗。\n- 保持故事節奏，不要跳躍太快。\n- 角色們需主動和異鄉人互動，結尾須保持開放性。\n- 文筆須豐富多彩、描述感情時須內斂。\n- Avoid meta dialogue — story should stay fully immersed in it's own reality.`
};

export const INITIAL_LOREBOOK_ENTRIES: LorebookEntry[] = [
  { id: 1, title: '月湖鎮', content: '世界中心，醉醺醺酒館、任務板(日常任務)、情報來源、各類店家、住宅與商店街混合，在這裡可以見到各種奇幻種族。外圍有各種公會的據點，例如異鄉人公會、獵人公會、冒險者公會等等。西邊外圍有成人紅燈區。', category: '地點', isActive: true, mapX: 0, mapY: 0, cartFare: 0, mapStatus: 'known', locationType: 'town' },
  { id: 2, title: '迷霧森林', content: '小紅帽副本：公會奶奶負責保管紅色斗篷，獵人公會訓練出來的學徒，每年都會派一位代表披上「紅斗篷」，跟狼族學徒決鬥一次(切磋性質)', category: '地點', isActive: true, mapX: 100, mapY: 50, cartFare: 30, mapStatus: 'heard', locationType: 'wilderness' },
  { id: 3, title: '狼族領地', content: '黑牙氏族領地，非請勿擾', category: '地點', isActive: true, mapX: 110, mapY: 70, cartFare: 0, mapStatus: 'heard', locationType: 'wilderness' },
  { id: 4, title: '大斷崖', content: '靠近地圖北端的懸崖，懸崖山洞裡有寶藏跟龍，附近是矮人堡壘', category: '地點', isActive: true, mapX: 0, mapY: 140, cartFare: 0, mapStatus: 'heard', locationType: 'wilderness' },
  { id: 5, title: '失序谷', content: '「失序谷」是一個地理名稱，因其內部地形崎嶇、生態系統混亂且不合邏輯而得名。廣義上屬於魔王的勢力範圍，因此也被稱為「魔族區域」。\n「魔王城」坐落在山峰之中。谷中有群聚鬧區也有散落居住的居民。\n氣氛歡樂鬆散，會欺騙、惡作劇。\n有各式各樣的種族，包括媚魔、吸血鬼、骷髏怪等等。\n偶爾會有人被惡作劇，變成其他種族或性別。適合投機份子的去處。', category: '地點', isActive: true, mapX: -100, mapY: 100, cartFare: 80, mapStatus: 'heard', locationType: 'wilderness' },
  { id: 6, title: '白樺樹之森', content: '白雪公主副本：皇后送了白雪公主一顆「Apple 」，這個「Apple」可以傳遞聲音、拍照，還可以看世界各地的迷因影片，白雪公主每天玩蘋果玩到三更半夜，非常不自律。', category: '地點', isActive: true, mapX: 0, mapY: 100, cartFare: 40, mapStatus: 'heard', locationType: 'wilderness' },
  { id: 7, title: '永夜沙灘', content: '人魚氏族：有魔法藥劑可以讓人魚上岸，偶爾會偽裝成人類去貿易，但新上岸的人魚對陸地生活較陌生，容易發生尷尬的事，需要老手帶領。人魚除了外表好看之外，多少帶點魚類的特性，例如：海豚可以用高頻率傳遞訊息，鯊魚喜歡吃生魚片。嚴禁有「接吻魚」習性的人魚上岸。大魚吃小魚，人魚也吃魚。', category: '地點', isActive: true, mapX: -100, mapY: 0, cartFare: 50, mapStatus: 'heard', locationType: 'wilderness' },
  { id: 8, title: '湖畔詩社', content: '永夜湖畔的文藝聚會點，聚集吟遊詩人與旅人，會發佈特殊情報或支線任務。也是個野餐的好地點。', category: '地點', isActive: true, mapX: -70, mapY: 10, cartFare: 15, mapStatus: 'heard', locationType: 'building' },
  { id: 9, title: '鐘塔荒野', content: '睡美人副本：這個睡美人是歷年來擔任最久的一屆，一堆人吻她都沒反應，但有時會爬起來敷衍冒險者。（隱藏彩蛋：進入睡美人夢境後，會發現她的夢境是通往愛麗絲的夢遊仙境，而她是裡面的紅心皇后，樂不思蜀，不想醒來。）', category: '地點', isActive: true, mapX: 0, mapY: -100, cartFare: 30, mapStatus: 'heard', locationType: 'wilderness' },
  { id: 10, title: '月湖驛站', content: '鐘塔荒野附近，得到穿越時空的素材，可以搭車回到素材當下的時間（也能「重置」道具狀態）', category: '地點', isActive: true, mapX: 0, mapY: -60, cartFare: 20, mapStatus: 'heard', locationType: 'building' },
  { id: 11, title: '幻夢市集', content: '只在夜晚出現的流動市集，有神祕商人與奇珍異寶。', category: '地點', isActive: true, mapX: 50, mapY: -30, cartFare: 0, mapStatus: 'heard', locationType: 'building' },
  { id: 12, title: '霧光花園', content: '夢幻花園，盛開著螢光花，據說能讓人變得誠實，有人會約在這裡告白、求婚、逼問對方是否出軌，也有人會在這裡辦民間調解。', category: '地點', isActive: true, mapX: -70, mapY: 50, cartFare: 15, mapStatus: 'heard', locationType: 'wilderness' },
  { id: 13, title: '失落拼圖山丘', content: '許多冒險者(不限於異鄉人)會在這裡丟棄失敗的任務線索，據說是能擺脫霉氣。有些人會到這裡尋寶，也許可以從某些道具解鎖其他訊息。', category: '地點', isActive: true, mapX: -70, mapY: 120, cartFare: 40, mapStatus: 'heard', locationType: 'wilderness' },
  { id: 14, title: '黑森林古道', content: '連接月湖鎮與迷霧森林的隱蔽小徑，據說偶爾會出現會誘人的「糖果屋」。', category: '地點', isActive: true, mapX: 80, mapY: 30, cartFare: 10, mapStatus: 'heard', locationType: 'wilderness' },
  { id: 15, title: '異鄉人公寓', content: '位於月湖鎮城南住宅區的三層木造建築，外觀略顯陳舊，但結構依然堅固。由異鄉人公會管理，為居住者提供了一份低調的安寧。每週租金35銅。\n一樓：公共空間。公寓的公共生活圍繞著「互助」與「資訊共用」的核心展開，主要體現在一樓的布告欄上。\n二樓與三樓：寢室區。', category: '地點', isActive: true, mapX: 5, mapY: -10, cartFare: 0, mapStatus: 'known', locationType: 'building' },
];


export const INITIAL_MESSAGES: Message[] = [
  {
    id: 1,
    role: 'assistant',
    text: '*你在一陣莫名的昏眩中恢復意識，意識像是從深不見底的黑暗中緩緩浮上來。周遭的一切都是陌生的，空氣裡瀰漫著從未聞過的氣息，光線、聲音、溫度——一切都在提醒你，這裡不是你原本的世界。*\n\n*你記得的最後一件事，是在舒適的床上滑著手機，準備迎接又一個平凡的上班日。而現在，你卻出現在一個完全陌生的地方，不知道這是哪裡，也不知道自己是怎麼來的。*\n\n*就在你還在試圖理解現況時，一個清晰、中性且帶著一絲戲謔的聲音，直接在你腦海中響起。*\n\n🌀引路者：「早安，睡美人。或者我該說……迷途的羔羊？感覺你有很多問題想問，別急，我們有的是時間。首先，恭喜你，你還活著。」\n\n*這聲音聽起來不帶惡意，反而像個看了太多好戲的無聊房東，終於盼來了有趣的新房客。*',
  },
];

export const TOKEN_OPTIONS = [
  { label: '16K', value: 16384 },
  { label: '32K', value: 32768 },
  { label: '64K', value: 65536 },
];

/**
 * Z-Index 層級系統
 * 用於整個應用的堆疊順序控制，確保 Modal、Drawer、菜單的正確堆疊
 *
 * 層級說明：
 * - BG (0-10)：背景、基礎層
 * - UI (20-30)：導航、菜單
 * - DRAWER (40-50)：手機抽屜、側欄
 * - MODAL (60-62)：模態對話框及其內容
 * - NOTIFICATION (100+)：通知、浮動菜單
 */
export const Z_INDEX = {
  BG: 0,
  BASE: 10,
  HUD: 20,
  MENU: 30,
  DRAWER_BG: 40,
  DRAWER: 50,
  MODAL_BG: 60,
  MODAL: 61,
  MODAL_HIGH: 62,
  TOAST: 100,
  POPOVER: 110,
} as const;
