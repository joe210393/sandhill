const { fetchAIWithRetry, getAiConfig } = require('../services/ai-client');

function registerAiRoutes(app, { uploadTemp }) {
  app.post('/api/vision-test', uploadTemp.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: '未上傳圖片' });
      }

      const base64Image = req.file.buffer.toString('base64');
      const dataUrl = `data:${req.file.mimetype};base64,${base64Image}`;
      const systemPrompt = req.body.systemPrompt || '你是一個有用的 AI 助手。';
      const userPromptText = req.body.userPrompt || '請辨識這張圖片的內容。';
      const locationInfo = req.body.latitude && req.body.longitude
        ? `\n(拍攝地點: 緯度 ${req.body.latitude}, 經度 ${req.body.longitude})`
        : '';
      const finalUserPrompt = userPromptText + locationInfo;
      const { AI_API_URL, AI_MODEL, AI_API_KEY } = getAiConfig();

      const quickOnly = req.body && (req.body.quickOnly === 'true' || req.body.quick_only === 'true');
      if (quickOnly) {
        console.log('⚡ 快速特徵提取模式：只提取特徵，跳過 RAG 和完整分析');
        const quickFeaturePrompt = '你是一位專業的植物形態學家。請快速分析圖片中的植物特徵，只提取關鍵識別特徵（生活型、葉序、葉形、花序、花色等），不要給出植物名稱。用簡短文字描述即可。';
        const quickResponse = await fetchAIWithRetry(
          `${AI_API_URL}/chat/completions`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${AI_API_KEY}`
            },
            body: JSON.stringify({
              model: AI_MODEL,
              messages: [
                { role: 'system', content: quickFeaturePrompt },
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: '請快速提取這張圖片中植物的關鍵識別特徵（生活型、葉序、葉形、花序、花色等），用簡短文字描述。' },
                    { type: 'image_url', image_url: { url: dataUrl } }
                  ]
                }
              ],
              max_tokens: 500,
              temperature: 0.3
            })
          },
          { timeoutMs: 180000, maxRetries: 2 }
        );

        const quickData = await quickResponse.json();
        const quickFeatures = quickData.choices?.[0]?.message?.content || '';
        return res.json({
          success: true,
          quick_features: quickFeatures,
          description: quickFeatures
        });
      }

      const simpleMode = req.body && (req.body.simpleMode === 'true' || req.body.simple_mode === 'true');
      if (simpleMode) {
        console.log('📷 簡易模式：只呼叫 LM 辨識，跳過 RAG / 特徵 / 植物搜尋');
        const simpleSystem = req.body.systemPrompt || '你是一個友善的 AI 助手。請簡潔描述圖片中圈選的物體。';
        const simpleUser = req.body.userPrompt || '請描述這張圖片中圈選區域的物體是什麼，並用簡短文字介紹。';

        const simpleResponse = await fetchAIWithRetry(
          `${AI_API_URL}/chat/completions`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AI_API_KEY}` },
            body: JSON.stringify({
              model: AI_MODEL,
              messages: [
                { role: 'system', content: simpleSystem },
                { role: 'user', content: [{ type: 'text', text: simpleUser }, { type: 'image_url', image_url: { url: dataUrl } }] }
              ],
              max_tokens: 1000,
              temperature: 0.3
            })
          },
          { timeoutMs: 180000, maxRetries: 2 }
        );

        const simpleData = await simpleResponse.json();
        return res.json({ success: true, description: simpleData.choices?.[0]?.message?.content || '' });
      }

      console.log('📷 LM-only 模式：使用 prompt 呼叫 LM，不進行植物資料庫比對');
      const aiResponse = await fetchAIWithRetry(
        `${AI_API_URL}/chat/completions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AI_API_KEY}` },
          body: JSON.stringify({
            model: AI_MODEL,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: [{ type: 'text', text: finalUserPrompt }, { type: 'image_url', image_url: { url: dataUrl } }] }
            ],
            max_tokens: 2000,
            temperature: 0
          })
        },
        { timeoutMs: 180000, maxRetries: 2 }
      );
      const aiData = await aiResponse.json();
      return res.json({ success: true, description: aiData.choices?.[0]?.message?.content || '', skip_rag: true });
    } catch (err) {
      console.error('❌ AI 辨識失敗:', err);
      if (err.stack) console.error('❌ Stack:', err.stack);
      return res.status(500).json({
        success: false,
        message: 'AI 暫時無法連線，請確認後端設定',
        error: err.message,
        ...(process.env.NODE_ENV !== 'production' && err.stack && { stack: err.stack })
      });
    }
  });

  app.get('/api/plant-vision-prompt', (req, res) => {
    res.status(503).json({ success: false, message: 'RAG 已停用，Plant Vision Prompt API 不可用' });
  });

  app.post('/api/chat-text', async (req, res) => {
    try {
      const systemPrompt = req.body.systemPrompt || '你是一個有用的 AI 助手。';
      const userPromptText = req.body.userPrompt || '';
      const userText = req.body.text || '';
      const locationText = req.body.locationText || '';

      if (!userText) {
        return res.status(400).json({ success: false, message: '缺少使用者內容' });
      }

      const finalUserPrompt = `${userPromptText}\n\n${userText}${locationText ? `\n\n(位置: ${locationText})` : ''}`.trim();
      const { AI_API_URL, AI_MODEL, AI_API_KEY } = getAiConfig();
      console.log('🤖 正在呼叫 AI(文字):', AI_API_URL);

      const aiResponse = await fetchAIWithRetry(
        `${AI_API_URL}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${AI_API_KEY}`
          },
          body: JSON.stringify({
            model: AI_MODEL,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: finalUserPrompt }
            ],
            max_tokens: 600,
            temperature: 0.7
          })
        },
        { timeoutMs: 90000, maxRetries: 2 }
      );

      const aiData = await aiResponse.json();
      return res.json({
        success: true,
        description: aiData.choices?.[0]?.message?.content || ''
      });
    } catch (err) {
      console.error('❌ AI 文字回覆失敗:', err);
      return res.status(500).json({
        success: false,
        message: 'AI 暫時無法連線，請確認後端設定',
        error: err.message
      });
    }
  });
}

module.exports = {
  registerAiRoutes
};
