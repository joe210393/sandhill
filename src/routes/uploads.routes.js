const express = require('express');
const { MulterError } = require('../services/uploads');

function registerUploadRoutes(app, {
  authenticateToken,
  requireRole,
  uploadImage,
  uploadAudio
}) {
  const router = express.Router();

  router.post('/upload', authenticateToken, requireRole('user', 'shop', 'admin'), (req, res) => {
    uploadImage.single('photo')(req, res, (err) => {
      if (err) {
        if (err instanceof MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ success: false, message: '檔案大小超過 5MB 限制' });
          }
          if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ success: false, message: '一次只能上傳一個檔案' });
          }
        }
        if (err.message.includes('不支援的檔案類型')) {
          return res.status(400).json({ success: false, message: err.message });
        }
        console.error('檔案上傳錯誤:', err);
        return res.status(500).json({ success: false, message: '檔案上傳失敗' });
      }

      if (!req.file) {
        return res.status(400).json({ success: false, message: '未選擇檔案' });
      }

      const imageUrl = '/images/' + req.file.filename;
      console.log(`✅ 檔案上傳成功: ${req.file.originalname} -> ${req.file.filename}`);
      res.json({ success: true, url: imageUrl, filename: req.file.filename });
    });
  });

  router.post('/upload-audio', authenticateToken, requireRole('shop', 'admin'), (req, res) => {
    uploadAudio.single('audio')(req, res, (err) => {
      if (err) {
        if (err instanceof MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ success: false, message: '檔案大小超過 100MB 限制' });
          }
          if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ success: false, message: '一次只能上傳一個檔案' });
          }
        }
        if (err.message.includes('不支援的檔案類型')) {
          return res.status(400).json({ success: false, message: err.message });
        }
        console.error('音頻上傳錯誤:', err);
        return res.status(500).json({ success: false, message: '音頻上傳失敗' });
      }

      if (!req.file) {
        return res.status(400).json({ success: false, message: '未選擇檔案' });
      }

      const audioUrl = '/images/' + req.file.filename;
      console.log(`✅ 音頻上傳成功: ${req.file.originalname} -> ${req.file.filename}`);
      res.json({ success: true, url: audioUrl, filename: req.file.filename });
    });
  });

  app.use('/api', router);
}

module.exports = { registerUploadRoutes };