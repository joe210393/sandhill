(function (global) {
  function parseDataUrl(dataUrl) {
    const match = String(dataUrl || '').match(/^data:([^;,]+)?((?:;[^;,]+)*),(.*)$/s);
    if (!match) return null;

    const mime = match[1] || 'application/octet-stream';
    const isBase64 = match[2].includes(';base64');
    const payload = match[3];

    if (isBase64) {
      const binary = atob(payload);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new Blob([bytes], { type: mime });
    }

    return new Blob([decodeURIComponent(payload)], { type: mime });
  }

  async function dataUrlToBlob(dataUrl) {
    if (!dataUrl) {
      throw new Error('缺少圖片資料');
    }

    if (String(dataUrl).startsWith('data:')) {
      const blob = parseDataUrl(dataUrl);
      if (!blob || blob.size === 0) {
        throw new Error('圖片資料無法解析，請重新拍攝');
      }
      return blob;
    }

    const response = await fetch(dataUrl);
    if (!response.ok) {
      throw new Error('圖片讀取失敗，請重新拍攝');
    }
    const blob = await response.blob();
    if (!blob || blob.size === 0) {
      throw new Error('圖片資料為空，請重新拍攝');
    }
    return blob;
  }

  global.AiLabDataUrl = {
    dataUrlToBlob,
    parseDataUrl
  };
})(window);
