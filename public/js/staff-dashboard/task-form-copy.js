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

  global.StaffDashboardTaskFormCopy = {
    WIZARD_ANCHORS,
    getFooterNote,
    getValidationUi
  };
})(typeof window !== 'undefined' ? window : globalThis);
