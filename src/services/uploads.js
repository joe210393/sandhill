const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const multer = require('multer');

function createDiskStorage(uploadDir) {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      if (!fs.existsSync(uploadDir)) {
        try {
          fs.mkdirSync(uploadDir, { recursive: true });
        } catch (err) {
          console.error('建立上傳目錄失敗:', err);
        }
      }
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const extension = path.extname(file.originalname).toLowerCase();
      cb(null, uniqueSuffix + extension);
    }
  });
}

function buildExtensionFilter(allowedExtensions, errorMessage) {
  return (req, file, cb) => {
    const fileExtension = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(fileExtension)) {
      cb(null, true);
    } else {
      cb(new Error(errorMessage), false);
    }
  };
}

const fileFilter = buildExtensionFilter(
  ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.glb', '.gltf'],
  '不支援的檔案類型。只允許 JPG, PNG, GIF, WebP, GLB, GLTF。'
);

const audioFileFilter = buildExtensionFilter(
  ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.webm'],
  '不支援的檔案類型。只允許 MP3, WAV, OGG, M4A, AAC, FLAC, WebM。'
);

const videoFileFilter = buildExtensionFilter(
  ['.mp4', '.mov', '.webm', '.m4v', '.avi'],
  '不支援的檔案類型。只允許 MP4, MOV, WebM, M4V, AVI。'
);

function createUploadHandlers(uploadDir) {
  const storage = createDiskStorage(uploadDir);

  const uploadImage = multer({
    storage,
    limits: {
      fileSize: 5 * 1024 * 1024,
      files: 1
    },
    fileFilter
  });

  const uploadModel = multer({
    storage,
    limits: {
      fileSize: 100 * 1024 * 1024,
      files: 1
    },
    fileFilter
  });

  const uploadAudio = multer({
    storage,
    limits: {
      fileSize: 100 * 1024 * 1024,
      files: 1
    },
    fileFilter: audioFileFilter
  });

  const uploadVideo = multer({
    storage,
    limits: {
      fileSize: 200 * 1024 * 1024,
      files: 1
    },
    fileFilter: videoFileFilter
  });

  const uploadAiTaskImage = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: 1
    },
    fileFilter
  });

  const uploadExcel = multer({ storage: multer.memoryStorage() });

  const uploadTemp = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: 1
    }
  });

  return {
    uploadImage,
    uploadModel,
    uploadAudio,
    uploadVideo,
    uploadAiTaskImage,
    uploadExcel,
    uploadTemp,
    upload: uploadImage
  };
}

let ffmpegBinaryReadyPromise = null;

function shouldOptimizeVideoOnUpload() {
  const raw = String(process.env.VIDEO_OPTIMIZE_ON_UPLOAD || '').trim().toLowerCase();
  if (!raw) return true;
  return ['1', 'true', 'yes', 'on'].includes(raw);
}

function getVideoOptimizationMinBytes() {
  const raw = Number(process.env.VIDEO_OPTIMIZE_MIN_BYTES || 8 * 1024 * 1024);
  if (!Number.isFinite(raw) || raw < 0) return 8 * 1024 * 1024;
  return raw;
}

function getVideoOptimizationTimeoutMs() {
  const raw = Number(process.env.VIDEO_OPTIMIZE_TIMEOUT_MS || 12 * 60 * 1000);
  if (!Number.isFinite(raw) || raw < 60_000) return 12 * 60 * 1000;
  return raw;
}

function isVideoAssetPath(fileName = '') {
  return ['.mp4', '.mov', '.webm', '.m4v', '.avi'].includes(path.extname(fileName).toLowerCase());
}

function runBinaryCommand(binary, args = [], { timeoutMs = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { child.kill('SIGKILL'); } catch (_) {}
        reject(new Error(`${binary} 執行逾時`));
      }
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => { stdout += String(chunk || ''); });
    child.stderr?.on('data', (chunk) => { stderr += String(chunk || ''); });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${binary} 失敗 (code=${code}): ${stderr.slice(-500)}`));
      }
    });
  });
}

async function canUseFfmpegBinary() {
  if (!ffmpegBinaryReadyPromise) {
    ffmpegBinaryReadyPromise = runBinaryCommand('ffmpeg', ['-version'], { timeoutMs: 15_000 })
      .then(() => true)
      .catch((err) => {
        console.warn('⚠️ ffmpeg 不可用，影片將跳過自動最佳化:', err.message);
        return false;
      });
  }
  return ffmpegBinaryReadyPromise;
}

async function optimizeUploadedVideoForStreaming(file) {
  if (!file?.path || !file?.filename || !shouldOptimizeVideoOnUpload() || !isVideoAssetPath(file.filename)) {
    return { optimized: false, originalSize: Number(file?.size || 0), finalSize: Number(file?.size || 0), reason: 'skip' };
  }

  const originalSize = Number(file.size || 0);
  const optimizeMinBytes = getVideoOptimizationMinBytes();
  const extension = path.extname(file.filename).toLowerCase();
  const shouldTranscode = extension !== '.mp4' || originalSize >= optimizeMinBytes;
  if (!shouldTranscode) {
    return { optimized: false, originalSize, finalSize: originalSize, reason: 'small_mp4' };
  }

  const ffmpegReady = await canUseFfmpegBinary();
  if (!ffmpegReady) {
    return { optimized: false, originalSize, finalSize: originalSize, reason: 'ffmpeg_unavailable' };
  }

  const dirname = path.dirname(file.path);
  const basename = path.basename(file.filename, path.extname(file.filename));
  const optimizedFilename = `${basename}-web.mp4`;
  const optimizedPath = path.join(dirname, optimizedFilename);
  const vfExpr = "scale='if(gt(iw,1280),1280,iw)':-2:flags=lanczos,fps='min(30,fps)'";

  try {
    await runBinaryCommand(
      'ffmpeg',
      [
        '-y',
        '-i', file.path,
        '-map_metadata', '-1',
        '-movflags', '+faststart',
        '-pix_fmt', 'yuv420p',
        '-vf', vfExpr,
        '-c:v', 'libx264',
        '-preset', process.env.VIDEO_OPTIMIZE_PRESET || 'veryfast',
        '-crf', process.env.VIDEO_OPTIMIZE_CRF || '28',
        '-maxrate', process.env.VIDEO_OPTIMIZE_MAXRATE || '2200k',
        '-bufsize', process.env.VIDEO_OPTIMIZE_BUFSIZE || '4400k',
        '-c:a', 'aac',
        '-b:a', process.env.VIDEO_OPTIMIZE_AUDIO_BITRATE || '96k',
        '-ac', '2',
        '-ar', '44100',
        optimizedPath
      ],
      { timeoutMs: getVideoOptimizationTimeoutMs() }
    );

    const optimizedStat = await fs.promises.stat(optimizedPath);
    if (!optimizedStat.size) {
      throw new Error('最佳化輸出檔為空');
    }

    const keepOptimized = extension !== '.mp4' || optimizedStat.size <= originalSize;
    if (!keepOptimized) {
      await fs.promises.unlink(optimizedPath).catch(() => {});
      return {
        optimized: false,
        originalSize,
        finalSize: originalSize,
        reason: 'optimized_file_larger'
      };
    }

    await fs.promises.unlink(file.path).catch(() => {});
    file.path = optimizedPath;
    file.filename = optimizedFilename;
    file.size = optimizedStat.size;
    file.mimetype = 'video/mp4';

    return {
      optimized: true,
      originalSize,
      finalSize: optimizedStat.size,
      reason: 'ok'
    };
  } catch (err) {
    await fs.promises.unlink(optimizedPath).catch(() => {});
    console.warn('⚠️ 影片最佳化失敗，改用原始檔案:', err.message);
    return {
      optimized: false,
      originalSize,
      finalSize: originalSize,
      reason: 'ffmpeg_failed'
    };
  }
}

module.exports = {
  audioFileFilter,
  createUploadHandlers,
  fileFilter,
  MulterError: multer.MulterError,
  optimizeUploadedVideoForStreaming,
  videoFileFilter
};
