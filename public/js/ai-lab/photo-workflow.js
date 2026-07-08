window.AiLabPhotoWorkflow = (function() {
    function createController(config) {
        const ctx = { ...config };

        function getPos(event) {
            if (event.touches && event.touches[0]) {
                return { x: event.touches[0].clientX, y: event.touches[0].clientY };
            }
            if (event.changedTouches && event.changedTouches[0]) {
                return { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };
            }
            return { x: event.clientX, y: event.clientY };
        }

        function startDraw(event) {
            ctx.stopVoiceRecognition();
            if (ctx.resultPanel?.style.display === 'flex') return;
            const pos = getPos(event);
            if (ctx.getSelectionMode() === 'reticle') {
                if (ctx.isGuidedReticleLockMode()) {
                    ctx.setTapStart(null);
                    return;
                }
                ctx.setTapStart({ x: pos.x, y: pos.y });
                return;
            }
            ctx.setIsDrawing(true);
            ctx.setPoints([]);
            ctx.canvasCtx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            ctx.getPoints().push(pos);
            ctx.canvasCtx.beginPath();
            ctx.canvasCtx.moveTo(pos.x, pos.y);
            ctx.canvasCtx.lineWidth = 4;
            ctx.canvasCtx.strokeStyle = '#ffd700';
            ctx.canvasCtx.lineCap = 'round';
            ctx.canvasCtx.lineJoin = 'round';
            if (ctx.selectionInstruction) ctx.selectionInstruction.style.opacity = '0';
        }

        function moveDraw(event) {
            if (ctx.getSelectionMode() === 'reticle') {
                if (ctx.isGuidedReticleLockMode()) return;
                const tapStart = ctx.getTapStart();
                if (!tapStart) return;
                const pos = getPos(event);
                const dx = pos.x - tapStart.x;
                const dy = pos.y - tapStart.y;
                if (Math.sqrt(dx * dx + dy * dy) > 6) {
                    const radius = ctx.getReticleRadius();
                    const center = ctx.getReticleCenter();
                    center.x = Math.max(radius, Math.min(ctx.canvas.width - radius, pos.x));
                    center.y = Math.max(radius, Math.min(ctx.canvas.height - radius, pos.y));
                    ctx.updateReticlePosition();
                }
                return;
            }
            if (!ctx.getIsDrawing()) return;
            event.preventDefault();
            const pos = getPos(event);
            ctx.getPoints().push(pos);
            ctx.canvasCtx.lineTo(pos.x, pos.y);
            ctx.canvasCtx.stroke();
        }

        function endDraw(event) {
            if (ctx.getSelectionMode() === 'reticle') {
                if (ctx.isGuidedReticleLockMode()) {
                    ctx.setTapStart(null);
                    return;
                }
                const tapStart = ctx.getTapStart();
                if (tapStart && event) {
                    const pos = getPos(event);
                    const dx = pos.x - tapStart.x;
                    const dy = pos.y - tapStart.y;
                    if (Math.sqrt(dx * dx + dy * dy) <= 15) {
                        const radius = ctx.getReticleRadius();
                        const center = ctx.getReticleCenter();
                        center.x = Math.max(radius, Math.min(ctx.canvas.width - radius, pos.x));
                        center.y = Math.max(radius, Math.min(ctx.canvas.height - radius, pos.y));
                        ctx.updateReticlePosition();
                    }
                }
                ctx.setTapStart(null);
                return;
            }
            if (!ctx.getIsDrawing()) return;
            ctx.setIsDrawing(false);
            ctx.canvasCtx.closePath();
            if (ctx.getPoints().length > 5) {
                processSelection();
            } else {
                ctx.canvasCtx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
                if (ctx.selectionInstruction) ctx.selectionInstruction.style.opacity = '1';
            }
        }

        function processSelection() {
            let minX = ctx.canvas.width;
            let minY = ctx.canvas.height;
            let maxX = 0;
            let maxY = 0;
            ctx.getPoints().forEach((point) => {
                if (point.x < minX) minX = point.x;
                if (point.x > maxX) maxX = point.x;
                if (point.y < minY) minY = point.y;
                if (point.y > maxY) maxY = point.y;
            });
            const padding = 20;
            minX = Math.max(0, minX - padding);
            minY = Math.max(0, minY - padding);
            maxX = Math.min(ctx.canvas.width, maxX + padding);
            maxY = Math.min(ctx.canvas.height, maxY + padding);
            ctx.processSelectionFromRect(minX, minY, maxX, maxY);
        }

        function addPhotoToCollection(dataUrl) {
            if (ctx.capturedPhotos.length >= ctx.maxPhotos) {
                ctx.capturedPhotos[ctx.maxPhotos - 1] = dataUrl;
            } else {
                ctx.capturedPhotos.push(dataUrl);
            }
            updatePhotoStrip();
            updatePreviewArea();
            ctx.updatePhotoBasketUi();
            if (!ctx.isPhotoTaskCaptureActive()) {
                showResultPanel();
            }
        }

        function updatePhotoStrip() {
            const strip = document.getElementById('photoStrip');
            const slots = strip ? strip.querySelectorAll('.photo-slot') : [];
            slots.forEach((slot, index) => {
                slot.classList.remove('filled', 'active');
                const existingImg = slot.querySelector('img');
                if (existingImg) existingImg.remove();
                if (ctx.capturedPhotos[index]) {
                    slot.classList.add('filled');
                    const img = document.createElement('img');
                    img.src = ctx.capturedPhotos[index];
                    img.alt = `第 ${index + 1} 張`;
                    img.setAttribute('loading', 'eager');
                    slot.appendChild(img);
                }
            });

            const nextIndex = Math.min(ctx.capturedPhotos.length, ctx.maxPhotos - 1);
            if (ctx.capturedPhotos.length < ctx.maxPhotos && slots[nextIndex]) {
                slots[nextIndex].classList.add('active');
            }

            const count = ctx.capturedPhotos.length;
            if (count >= ctx.minPhotosToAnalyze) {
                ctx.analyzeBtn.disabled = false;
                if (ctx.photoHint) {
                    if (count >= ctx.maxPhotos) {
                        ctx.photoHint.innerHTML = `✓ 已拍攝 ${ctx.maxPhotos} 張，可開始辨識`;
                    } else if (count === 1) {
                        ctx.photoHint.innerHTML = [
                            '若此物品並非「生物」請直接辨識。',
                            '若是生物類（例如植物）建議補上第二、三張：',
                            '請拍攝特寫花朵、果實、葉片等位置，越多細節推測出的結論越準確。'
                        ].join('<br>');
                    } else {
                        ctx.photoHint.innerHTML = `已拍 ${count} 張，可辨識或再補 1 張（建議：花朵／果實／葉片特寫）。`;
                    }
                    ctx.photoHint.classList.toggle('complete', count >= ctx.maxPhotos);
                }
                if (ctx.addPhotoBtn) {
                    ctx.addPhotoBtn.disabled = count >= ctx.maxPhotos;
                    ctx.addPhotoBtn.textContent = count >= ctx.maxPhotos ? '已完成' : `拍攝第 ${count + 1} 張`;
                }
            } else {
                if (ctx.photoHint) ctx.photoHint.textContent = `請拍攝至少 ${ctx.minPhotosToAnalyze} 張照片`;
                ctx.analyzeBtn.disabled = true;
                if (ctx.addPhotoBtn) {
                    ctx.addPhotoBtn.disabled = false;
                    ctx.addPhotoBtn.textContent = '拍攝第 1 張';
                }
            }
        }

        function updatePreviewArea() {
            if (!ctx.previewArea) return;
            ctx.previewArea.innerHTML = '';
            ctx.previewArea.className = 'preview-area';
            const count = ctx.capturedPhotos.length;
            if (count === 0) return;
            ctx.previewArea.classList.add('preview-count-' + Math.min(count, 3));
            for (let index = 0; index < count; index += 1) {
                const img = document.createElement('img');
                img.src = ctx.capturedPhotos[index];
                img.alt = `第 ${index + 1} 張`;
                img.loading = 'eager';
                ctx.previewArea.appendChild(img);
            }
        }

        function showResultPanel() {
            ctx.resultPanel.style.display = 'flex';
            ctx.resultPanel.classList.add('active');
            if (ctx.selectionInstruction) ctx.selectionInstruction.style.display = 'none';
            const count = ctx.capturedPhotos.length;
            if (count < ctx.minPhotosToAnalyze) {
                ctx.aiResult.innerHTML = `<div style="text-align:center; color:#666;">
                    <div style="font-size:24px; margin-bottom:8px;">📷</div>
                    <div>請拍攝一張照片</div>
                    <div style="font-size:13px; color:#999; margin-top:4px;">不清楚時可再補拍不同角度</div>
                </div>`;
            } else {
                ctx.aiResult.innerHTML = '準備就緒，點擊「AI 辨識」開始分析';
            }
            if (ctx.rawOutput) ctx.rawOutput.style.display = 'none';
            ctx.analyzeBtn.textContent = 'AI 辨識';
            requestAnimationFrame(() => {
                updatePhotoStrip();
                updatePreviewArea();
            });
        }

        function retry() {
            ctx.capturedPhotos.length = 0;
            updatePhotoStrip();
            updatePreviewArea();
            ctx.resultPanel.classList.remove('active');
            ctx.resultPanel.style.display = 'none';
            ctx.canvasCtx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            if (ctx.selectionInstruction) ctx.selectionInstruction.style.opacity = '1';
            if (ctx.selectionInstruction) ctx.selectionInstruction.style.display = '';
            ctx.aiResult.innerHTML = '';
            ctx.setPoints([]);
        }

        return {
            addPhotoToCollection,
            endDraw,
            getPos,
            moveDraw,
            processSelection,
            retry,
            showResultPanel,
            startDraw,
            updatePhotoStrip,
            updatePreviewArea
        };
    }

    return { createController };
})();
