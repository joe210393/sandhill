(function (global) {
  const AI_THINKING_STAGES = {
    upload: [
      '📤 正在上傳照片...',
      '📷 讀取圖片資料中...',
      '🔄 準備傳送至 AI...'
    ],
    analyze: [
      '🔍 AI 正在觀察圖片...',
      '🧠 辨識物體輪廓中...',
      '👀 分析色彩與紋理...',
      '🎯 鎖定主要特徵...',
      '📐 測量比例關係...'
    ],
    plant: [
      '🌿 這看起來像植物...',
      '🍃 分析葉片形狀...',
      '🌸 檢查花朵特徵...',
      '🌳 判斷生長型態...',
      '📋 提取關鍵特徵...'
    ],
    search: [
      '📚 搜尋植物資料庫...',
      '🔎 比對 9000+ 種植物...',
      '⚖️ 計算相似度分數...',
      '🏆 排序最佳候選...'
    ],
    finalize: [
      '✨ 整理辨識結果...',
      '📊 計算信心度...',
      '✅ 準備顯示答案...'
    ]
  };

  function createThinkingController({ loadingText }) {
    let thinkingInterval = null;
    let currentStage = 'upload';
    let stageMessageIndex = 0;

    function updateMessage(message) {
      if (loadingText && message) {
        loadingText.style.transition = 'opacity 0.15s ease';
        loadingText.style.opacity = '0.5';
        setTimeout(() => {
          loadingText.textContent = message;
          loadingText.style.opacity = '1';
        }, 150);
      }
    }

    function stop() {
      if (thinkingInterval) {
        clearInterval(thinkingInterval);
        thinkingInterval = null;
        console.log('⏹️ 思考動畫停止');
      }
    }

    function start() {
      stop();
      currentStage = 'upload';
      stageMessageIndex = 0;

      if (loadingText) {
        loadingText.textContent = AI_THINKING_STAGES[currentStage][0];
        loadingText.style.opacity = '1';
      }

      console.log('🎬 思考動畫開始:', AI_THINKING_STAGES[currentStage][0]);

      thinkingInterval = setInterval(() => {
        const messages = AI_THINKING_STAGES[currentStage];
        if (messages) {
          stageMessageIndex = (stageMessageIndex + 1) % messages.length;
          updateMessage(messages[stageMessageIndex]);
        }
      }, 1500);
    }

    function setStage(stage) {
      if (AI_THINKING_STAGES[stage]) {
        currentStage = stage;
        stageMessageIndex = 0;
        console.log('🔄 切換思考階段:', stage, AI_THINKING_STAGES[stage][0]);
        if (loadingText) {
          loadingText.textContent = AI_THINKING_STAGES[stage][0];
        }
      }
    }

    return {
      start,
      setStage,
      stop,
      updateMessage
    };
  }

  global.AiLabThinking = {
    AI_THINKING_STAGES,
    createThinkingController
  };
})(window);
