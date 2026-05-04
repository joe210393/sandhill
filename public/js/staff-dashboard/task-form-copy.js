(function (global) {
  const WIZARD_ANCHORS = {
    game: 'game',
    field: 'field',
    interact: 'interact',
    player: 'player'
  };

  const FOOTER_NOTES = {
    1: '第 1 步：先選玩法模板與關卡分類，系統會帶入建議的作答與驗證方式。',
    2: '第 2 步：寫關卡名稱與給玩家的說明；若要限定地點再開 GPS 並填座標。',
    3: '第 3 步：選玩家怎麼交卷；若用 AI 驗證，可展開「進階」填標籤與提示詞。',
    4: '第 4 步：道具、素材與完成後訊息；確認無誤再儲存。'
  };

  /** 各驗證模式的「裁判設定」placeholder：須與模式用途一致，避免全關卡同一套海洋範例。 */
  const AI_JUDGE_PLACEHOLDERS = {
    ai_text_check: {
      system:
        '你是關卡「文字」裁判：只依下方「任務說明」判斷是否扣題；不代寫作文、不延伸創作；同義改寫可接受時請在理由簡述。',
      user:
        '請依本關規約判斷玩家回答是否扣題。例：須同時提到「地層受擠壓」與「逆斷層」兩個概念；只提到其中一個不算過關；可用自己的話，不必逐字相同。',
      failure: '回答裡還缺「○○」或「△△」其中一項，對照關卡說明再補一句即可。',
      success: '兩個重點都有講到，這一關過關！'
    },
    ai_count: {
      system:
        '你是關卡「計數」裁判：只數任務說明裡指定的物件類別；遮擋過半、倒影、非本體不計；邊界採保守。',
      user:
        '請數照片中「易開罐本體」數量（不含壓扁碎片與遠方模糊小點）。達 5 個通關；若同一物重疊只算 1。',
      failure: '目前數到的數量還不到門檻，靠近主體、避免反光再拍一張。',
      success: '數量達標，過關！'
    },
    ai_identify: {
      system:
        '你是關卡「辨識」裁判：只判斷任務說明中的目標是否清楚出現在畫面主要區域；不猜地點、不評美醜。',
      user:
        '請判斷畫面中是否清楚可見「指定招牌上的店名全稱」或「完整花冠的牽牛花」二擇一即過關；局部裁切不算。',
      failure: '鏡頭裡還找不到清楚的主體，請對焦後再試一次。',
      success: '有拍到清楚目標，過關！'
    },
    ai_score: {
      system:
        '你是關卡「攝影／構圖評分」裁判：只依下方「任務說明」裡的配分表與通關門檻給分；不臆測關卡主題（主題完全由任務說明定義）；主觀分項須註明上限並避免與必要項矛盾。',
      user:
        '【請改成你的主題，以下為配分表範例】① 必要項（共 6 分）：畫面須同時清楚出現「天空、沙灘、海」三元素，缺一則必要項不滿分。② 加分（+1）：有清楚可辨的人物。③ 主觀池（至多 3 分）：幽默、美感等，由你依畫面自由心證，但不得推翻①②的事實認定。④ 通關：總分須達本關「最低通過分數」欄位所設門檻。',
      failure: '目前總分未達通關門檻，或必要項／加分條件未滿足；請對照上方配分表調整畫面後再拍。',
      success: '配分表各項與總分皆達標，恭喜過關！'
    },
    ai_rule_check: {
      system:
        '你是關卡「規則檢查」裁判：只檢查任務說明列出的必達條與禁則；未列的不臆測、不額外扣分。',
      user:
        '請逐條檢查：① 畫面須同時出現「手套」與「垃圾袋」② 不可只有手部特寫而看不到環境脈絡。任一禁則觸發即不通關。',
      failure: '規則裡還有條件沒達成（例：缺手套或構圖太局部），調整後再拍。',
      success: '列出的條件都符合，過關！'
    },
    ai_reference_match: {
      system:
        '你是關卡「場景比對」裁判：比對玩家照片與關卡封面／參考意圖是否為同一地點或同一視角類型；容許天候、色差、人潮差異。',
      user:
        '請比對是否與封面所代表的「同一個地標入口」或「同一面解說看板」為同一處；僅風格相似但建築不同不算過關。',
      failure: '看起來不像同一地標或視角，請靠近封面構圖再拍一張。',
      success: '地點或構圖對上了，過關！'
    }
  };

  const VALIDATION_UI = {
    ai_text_check: {
      helper: '玩家打字後，由 AI 判斷內容是否符合你設定的主題。',
      label: '要檢查的主題',
      placeholder: '例：是否描述到潮間帶生物'
    },
    ai_count: {
      helper: 'AI 會數照片裡指定類型的物件，達到數量才算通關。',
      label: '要數的物件類型',
      placeholder: '例：寶特瓶、海玻璃'
    },
    ai_identify: {
      helper: 'AI 會看照片裡是否出現你指定的物件或主題。',
      label: '要辨識的目標',
      placeholder: '例：牽牛花、指定招牌'
    },
    ai_score: {
      helper: 'AI 依主題為照片打分，分數達門檻即通關。',
      label: '評分主題',
      placeholder: '例：團體合照、構圖完整度'
    },
    ai_rule_check: {
      helper: 'AI 檢查照片是否符合你描述的規則（例如場景、行為）。',
      label: '規則主題',
      placeholder: '例：淨灘後垃圾分類正確'
    },
    ai_reference_match: {
      helper: '比對玩家照片與關卡封面是否為同一地點或同一主題畫面。',
      label: '比對主題說明',
      placeholder: '例：寶藏點地標、同一個看板'
    }
  };

  function getFooterNote(step, totalSteps) {
    const s = Number(step) || 1;
    const t = Number(totalSteps) || 4;
    const line = FOOTER_NOTES[s] || '';
    return line ? `${line}（第 ${s} / ${t} 步）` : `新增關卡流程：第 ${s} / ${t} 步`;
  }

  function getValidationUi(mode) {
    return VALIDATION_UI[mode] || null;
  }

  function getAiJudgePlaceholders(mode) {
    return AI_JUDGE_PLACEHOLDERS[mode] || null;
  }

  global.StaffDashboardTaskFormCopy = {
    WIZARD_ANCHORS,
    getFooterNote,
    getValidationUi,
    getAiJudgePlaceholders
  };
})(typeof window !== 'undefined' ? window : globalThis);
