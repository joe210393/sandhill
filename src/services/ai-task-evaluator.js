const fs = require('fs');
const path = require('path');
const { fetchAIWithRetry, getAiConfig } = require('./ai-client');

function createAiTaskEvaluator({
  uploadDir,
  parseJsonField,
  normalizeNullableString,
  normalizeBoolean,
  sanitizeAiTaskPlayerFacingResult
}) {
  function extractJsonObject(text) {
    const normalized = String(text || '').trim();
    try {
      return JSON.parse(normalized);
    } catch (err) {
      const start = normalized.indexOf('{');
      const end = normalized.lastIndexOf('}');
      if (start === -1 || end === -1 || end <= start) throw err;
      return JSON.parse(normalized.slice(start, end + 1));
    }
  }

  function normalizeLabel(value) {
    return normalizeNullableString(value)?.toLowerCase().trim() || '';
  }

  function buildAiTaskPrompt(task) {
    const aiConfig = parseJsonField(task.ai_config, {}) || {};
    const passCriteria = parseJsonField(task.pass_criteria, {}) || {};
    const systemPrompt = aiConfig.system_prompt || '你是活動任務的 AI 視覺裁判。請根據任務條件判斷玩家上傳圖片是否通過，只回傳 JSON。';
    const validationGuide = {
      ai_identify: '判斷圖片是否包含指定目標。不要因為背景相似就通過。',
      ai_count: '計算圖片中的目標數量是否達標。',
      ai_score: '依照任務條件給分。',
      ai_rule_check: '逐條檢查規則是否成立。',
      ai_reference_match: '比對玩家照片是否與參考圖片為相同地點或同一目標。'
    }[task.validation_mode] || '根據任務條件判斷是否通過。';

    return {
      systemPrompt,
      userPrompt: [
        `任務名稱：${task.name}`,
        `驗證模式：${task.validation_mode}`,
        `任務說明：${task.description || task.name}`,
        `AI 題目引導：${aiConfig.user_prompt || task.description || task.name}`,
        Object.keys(passCriteria).length ? `通關條件：${JSON.stringify(passCriteria, null, 2)}` : null,
        `判定指南：${validationGuide}`,
        '請只輸出 JSON。',
        'JSON 欄位必須包含：passed, confidence, label, count_detected, score, reason, retry_advice。',
        task.validation_mode === 'ai_identify'
          ? '對於 ai_identify：label 請寫「你實際看到的主要物件或內容」，不要寫成「非某物」或直接抄通關目標。reason 與 retry_advice 是給玩家看的。失敗時請先點出玩家目前拍到的是什麼，再給一個不暴露答案的間接提示。你可以使用較抽象的類別、外觀特徵、行為、用途、棲地或題目線索來引導，例如「這次拍到的是乳液，但這一關要找的是四隻腳的動物」；不能直接透露目標答案、指定標籤、正解名稱，也不能寫「不是 XXX」「答案是 XXX」「請拍 XXX」。每次措辭可以自然變化，不需要完全一樣。'
          : '請讓 reason 與 retry_advice 保持簡潔、友善，適合直接顯示給玩家。',
        '若某欄位不適用，請填 null。',
        '不要輸出 Markdown，不要輸出額外說明。'
      ].filter(Boolean).join('\n')
    };
  }

  function buildAiTextTaskPrompt(task, answer) {
    const aiConfig = parseJsonField(task.ai_config, {}) || {};
    const passCriteria = parseJsonField(task.pass_criteria, {}) || {};
    const systemPrompt = aiConfig.system_prompt || '你是活動任務的 AI 導師兼評分員。請根據題目與玩家回答，只回傳 JSON。';
    const guidance = aiConfig.answer_guardrails || '請溫和指出回答是否切中題目重點，必要時給玩家一點方向，但不要過度冗長。';
    const expectedAnswer = normalizeNullableString(task.correct_answer);
    return {
      systemPrompt,
      userPrompt: [
        `任務名稱：${task.name}`,
        `驗證模式：${task.validation_mode}`,
        `任務說明：${task.description || task.name}`,
        `AI 題目引導：${aiConfig.user_prompt || task.description || task.name}`,
        expectedAnswer ? `參考答案：${expectedAnswer}` : null,
        Object.keys(passCriteria).length ? `通關條件：${JSON.stringify(passCriteria, null, 2)}` : null,
        `玩家回答：${answer}`,
        `玩家引導原則：${guidance}`,
        '請判斷玩家回答是否足夠通過此題，並只輸出 JSON。',
        'JSON 欄位必須包含：passed, confidence, score, reason, retry_advice。',
        'reason 與 retry_advice 會直接顯示給玩家，語氣友善、具引導性，但不要離題。',
        '若某欄位不適用，請填 null。',
        '不要輸出 Markdown，不要輸出額外說明。'
      ].filter(Boolean).join('\n')
    };
  }

  function buildAiNoContentResult(task) {
    return {
      passed: false,
      confidence: null,
      label: null,
      count_detected: null,
      score: null,
      reason: `AI 這次沒有成功回覆可辨識內容，所以暫時無法確認「${task?.name || '這一關'}」是否正確。`,
      retry_advice: '請重新拍攝一次，盡量讓主體更清楚、靠近一點，或稍後再試一次。',
      rule_results: null
    };
  }

  function buildAiTextNoContentResult(task) {
    return {
      passed: false,
      confidence: null,
      score: null,
      reason: `樂樂園暫時無法完整理解你在「${task?.name || '這一題'}」的回答。`,
      retry_advice: '請換個更清楚的說法，或補充你觀察到的重點後再試一次。'
    };
  }

  function normalizeAiTextTaskResult(task, aiResult) {
    const passCriteria = parseJsonField(task.pass_criteria, {}) || {};
    const confidence = aiResult.confidence === null || aiResult.confidence === undefined ? null : Number(aiResult.confidence);
    const score = aiResult.score === null || aiResult.score === undefined ? null : Number(aiResult.score);
    let passed = normalizeBoolean(aiResult.passed);

    if (Number.isFinite(Number(passCriteria.min_score)) && Number.isFinite(score)) {
      passed = passed && score >= Number(passCriteria.min_score);
    }
    if (Number.isFinite(Number(passCriteria.min_confidence)) && Number.isFinite(confidence)) {
      passed = passed && confidence >= Number(passCriteria.min_confidence);
    }

    return {
      passed,
      confidence: Number.isFinite(confidence) ? confidence : null,
      score: Number.isFinite(score) ? score : null,
      reason: normalizeNullableString(aiResult.reason) || (passed ? 'AI 認為你的回答已符合題意。' : 'AI 認為這次回答還沒有抓到題目的重點。'),
      retry_advice: normalizeNullableString(aiResult.retry_advice) || null
    };
  }

  function normalizeAiTaskResult(task, aiResult) {
    const passCriteria = parseJsonField(task.pass_criteria, {}) || {};
    const confidence = Number(aiResult.confidence);
    const hasConfidence = !Number.isNaN(confidence);
    const detectedCount = aiResult.count_detected === null || aiResult.count_detected === undefined
      ? null
      : Number(aiResult.count_detected);
    const score = aiResult.score === null || aiResult.score === undefined
      ? null
      : Number(aiResult.score);
    const label = normalizeNullableString(aiResult.label);
    let passed = normalizeBoolean(aiResult.passed);

    if (task.validation_mode === 'ai_count' && Number.isFinite(detectedCount) && Number.isFinite(Number(passCriteria.target_count))) {
      passed = detectedCount >= Number(passCriteria.target_count);
    }
    if (task.validation_mode === 'ai_identify' && passCriteria.target_label) {
      const targetLabel = normalizeLabel(passCriteria.target_label);
      const strictLabelMatch = normalizeBoolean(passCriteria.strict_label_match);
      if (strictLabelMatch && targetLabel) {
        passed = normalizeLabel(label) === targetLabel;
      }
    }
    if (task.validation_mode === 'ai_score' && Number.isFinite(score) && Number.isFinite(Number(passCriteria.min_score))) {
      passed = score >= Number(passCriteria.min_score);
    }
    if (task.validation_mode === 'ai_rule_check' && Array.isArray(aiResult.rule_results) && passCriteria.all_rules_must_pass) {
      passed = aiResult.rule_results.every(rule => normalizeBoolean(rule.passed));
    }
    if (task.validation_mode === 'ai_reference_match' && aiResult.same_location !== undefined) {
      passed = normalizeBoolean(aiResult.same_location);
    }
    if (hasConfidence && Number.isFinite(Number(passCriteria.min_confidence))) {
      passed = passed && confidence >= Number(passCriteria.min_confidence);
    }

    return sanitizeAiTaskPlayerFacingResult(task, {
      passed,
      confidence: hasConfidence ? confidence : null,
      label,
      count_detected: Number.isFinite(detectedCount) ? detectedCount : null,
      score: Number.isFinite(score) ? score : null,
      reason: normalizeNullableString(aiResult.reason) || (passed ? 'AI 判定通過' : 'AI 判定未通過'),
      retry_advice: normalizeNullableString(aiResult.retry_advice) || null,
      rule_results: Array.isArray(aiResult.rule_results) ? aiResult.rule_results : null
    });
  }

  function getMimeTypeFromPath(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif'
    };
    return mimeTypes[ext] || 'image/jpeg';
  }

  async function getTaskReferenceImageDataUrl(task) {
    const photoUrl = normalizeNullableString(task.photoUrl);
    if (!photoUrl) return null;

    if (/^https?:\/\//i.test(photoUrl)) {
      const response = await fetch(photoUrl);
      if (!response.ok) {
        throw new Error('無法讀取任務參考圖片');
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const mimeType = response.headers.get('content-type') || 'image/jpeg';
      return `data:${mimeType};base64,${buffer.toString('base64')}`;
    }

    const normalizedPath = decodeURIComponent(photoUrl.replace(/^\/+/, ''));
    const candidatePaths = [
      path.join(__dirname, '..', '..', 'public', normalizedPath),
      normalizedPath.startsWith('images/')
        ? path.join(uploadDir, path.basename(normalizedPath))
        : null
    ].filter(Boolean);
    const localPath = candidatePaths.find(candidate => fs.existsSync(candidate));
    if (!localPath) {
      return null;
    }
    const buffer = fs.readFileSync(localPath);
    return `data:${getMimeTypeFromPath(localPath)};base64,${buffer.toString('base64')}`;
  }

  async function evaluateAiTaskImage(task, file, extraContext = {}) {
    const { AI_API_URL, AI_MODEL, AI_API_KEY } = getAiConfig();
    const dataUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    const prompt = buildAiTaskPrompt(task);
    const referenceImageDataUrl = task.validation_mode === 'ai_reference_match'
      ? await getTaskReferenceImageDataUrl(task)
      : null;
    if (task.validation_mode === 'ai_reference_match' && !referenceImageDataUrl) {
      throw new Error('此任務缺少可用的參考圖片，請先確認任務封面圖片是否存在');
    }
    const locationText = extraContext.latitude && extraContext.longitude
      ? `\n拍攝地點：緯度 ${extraContext.latitude}，經度 ${extraContext.longitude}`
      : '';
    const imageContent = [];
    if (referenceImageDataUrl) {
      imageContent.push({ type: 'image_url', image_url: { url: referenceImageDataUrl } });
    }
    imageContent.push({ type: 'image_url', image_url: { url: dataUrl } });

    const response = await fetchAIWithRetry(
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
            { role: 'system', content: prompt.systemPrompt },
            {
              role: 'user',
              content: [
                { type: 'text', text: `${prompt.userPrompt}${locationText}` },
                ...imageContent
              ]
            }
          ],
          max_tokens: 800,
          temperature: task.validation_mode === 'ai_identify' ? 0.2 : 0
        })
      },
      {
        timeoutMs: Number(extraContext.timeoutMs || 180000),
        maxRetries: Number.isFinite(Number(extraContext.maxRetries)) ? Number(extraContext.maxRetries) : 2
      }
    );

    const aiData = await response.json();
    const usage = aiData?.usage || null;
    const model = aiData?.model || AI_MODEL;
    const rawContent = aiData.choices?.[0]?.message?.content;
    const textContent = Array.isArray(rawContent)
      ? rawContent.map(item => item.text || '').join('\n')
      : rawContent;
    const normalizedText = typeof textContent === 'string' ? textContent.trim() : '';
    if (!normalizedText) {
      return { rawContent: '', parsed: buildAiNoContentResult(task), usage, model };
    }

    let parsed;
    try {
      parsed = extractJsonObject(normalizedText);
    } catch (error) {
      return {
        rawContent: normalizedText,
        parsed: {
          ...buildAiNoContentResult(task),
          reason: 'AI 有回覆內容，但格式不完整，所以這次無法安全判定結果。',
          retry_advice: '請重新拍攝一次，讓主體更清楚、靠近一些，再試一次。'
        },
        usage,
        model
      };
    }
    return { rawContent: normalizedText, parsed: normalizeAiTaskResult(task, parsed), usage, model };
  }

  async function evaluateAiTaskText(task, answer, extraContext = {}) {
    const { AI_API_URL, AI_MODEL, AI_API_KEY } = getAiConfig();
    const prompt = buildAiTextTaskPrompt(task, answer);

    const response = await fetchAIWithRetry(
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
            { role: 'system', content: prompt.systemPrompt },
            { role: 'user', content: prompt.userPrompt }
          ],
          max_tokens: 500,
          temperature: 0.2
        })
      },
      {
        timeoutMs: Number(extraContext.timeoutMs || 90000),
        maxRetries: Number.isFinite(Number(extraContext.maxRetries)) ? Number(extraContext.maxRetries) : 1
      }
    );

    const aiData = await response.json();
    const usage = aiData?.usage || null;
    const model = aiData?.model || AI_MODEL;
    const rawContent = aiData.choices?.[0]?.message?.content;
    const normalizedText = typeof rawContent === 'string'
      ? rawContent.trim()
      : Array.isArray(rawContent)
        ? rawContent.map(item => item.text || '').join('\n').trim()
        : '';

    if (!normalizedText) {
      return { rawContent: '', parsed: buildAiTextNoContentResult(task), usage, model };
    }

    let parsed;
    try {
      parsed = extractJsonObject(normalizedText);
    } catch (error) {
      return {
        rawContent: normalizedText,
        parsed: {
          ...buildAiTextNoContentResult(task),
          reason: 'AI 有回覆，但格式不完整，所以這次沒辦法安全判定。',
          retry_advice: '請換個更清楚的說法，再提交一次。'
        },
        usage,
        model
      };
    }

    return { rawContent: normalizedText, parsed: normalizeAiTextTaskResult(task, parsed), usage, model };
  }

  return {
    evaluateAiTaskImage,
    evaluateAiTaskText
  };
}

module.exports = {
  createAiTaskEvaluator
};
