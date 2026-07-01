(function (global) {
  async function combinePhotosToGrid(photos) {
    return new Promise((resolve) => {
      const count = photos.length;
      if (count === 0) {
        resolve(null);
        return;
      }
      if (count === 1) {
        resolve(photos[0]);
        return;
      }

      const gridCanvas = document.createElement('canvas');
      const ctx = gridCanvas.getContext('2d');
      const cols = count <= 2 ? count : 2;
      const rows = Math.ceil(count / cols);
      const cellWidth = 1920;
      const cellHeight = 1080;

      gridCanvas.width = cellWidth * cols;
      gridCanvas.height = cellHeight * rows;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, gridCanvas.width, gridCanvas.height);

      let loaded = 0;
      photos.forEach((photoUrl, index) => {
        const img = new Image();
        img.onload = () => {
          const col = index % cols;
          const row = Math.floor(index / cols);
          const x = col * cellWidth;
          const y = row * cellHeight;
          const scale = Math.min(cellWidth / img.width, cellHeight / img.height);
          const drawWidth = img.width * scale;
          const drawHeight = img.height * scale;
          const offsetX = x + (cellWidth - drawWidth) / 2;
          const offsetY = y + (cellHeight - drawHeight) / 2;

          ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(x + 5, y + 5, 30, 25);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 16px sans-serif';
          ctx.fillText(`${index + 1}`, x + 12, y + 23);

          loaded++;
          if (loaded === count) {
            resolve(gridCanvas.toDataURL('image/jpeg', 0.9));
          }
        };
        img.onerror = () => {
          loaded++;
          if (loaded === count) {
            resolve(gridCanvas.toDataURL('image/jpeg', 0.9));
          }
        };
        img.src = photoUrl;
      });
    });
  }

  async function readVisionErrorMessage(apiRes, fallbackMessage) {
    try {
      const errData = await apiRes.json();
      return errData.message || errData.error || fallbackMessage;
    } catch (_) {
      try {
        const errText = await apiRes.text();
        return errText ? errText.slice(0, 200) : fallbackMessage;
      } catch (readErr) {
        return fallbackMessage;
      }
    }
  }

  async function analyzePhotos(photoDataUrl, systemPrompt, userPrompt, gpsData, opts) {
    const dataUrlToBlob = global.AiLabDataUrl?.dataUrlToBlob;
    if (typeof dataUrlToBlob !== 'function') {
      throw new Error('圖片轉換模組尚未載入，請重新整理頁面');
    }

    const blob = await dataUrlToBlob(photoDataUrl);
    const formData = new FormData();
    formData.append('image', blob, 'capture.jpg');
    formData.append('systemPrompt', systemPrompt);
    formData.append('userPrompt', userPrompt);
    formData.append('skipRag', 'true');

    if (gpsData) {
      formData.append('latitude', gpsData.latitude);
      formData.append('longitude', gpsData.longitude);
    }
    if (opts?.previousSession) {
      formData.append('previous_session', JSON.stringify(opts.previousSession));
    }

    const apiRes = await fetch('/api/vision-test', {
      method: 'POST',
      body: formData
    });

    if (!apiRes.ok) {
      throw new Error(await readVisionErrorMessage(apiRes, '照片分析失敗'));
    }

    return await apiRes.json();
  }

  global.AiLabVisionClient = {
    combinePhotosToGrid,
    analyzePhotos
  };
})(window);
