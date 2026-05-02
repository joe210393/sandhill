const fs = require('fs');
const path = require('path');

const ZEABUR_VOLUME_UPLOAD_PATH = '/public/images';
const ZEABUR_LEGACY_UPLOAD_PATH = '/data/public/images';
const LOCAL_UPLOAD_PATH = path.join(__dirname, '../../public/images');

const VIDEO_ASSET_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.m4v', '.avi']);
const MODEL_ASSET_EXTENSIONS = new Set(['.glb', '.gltf']);

function normalizeNullableString(value) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str === '' ? null : str;
}

function resolveUploadDir(env = process.env) {
  const customUploadDir = normalizeNullableString(env.UPLOAD_DIR);
  const candidateDirs = [
    customUploadDir,
    env.NODE_ENV === 'production' ? ZEABUR_VOLUME_UPLOAD_PATH : null,
    env.NODE_ENV === 'production' ? ZEABUR_LEGACY_UPLOAD_PATH : null,
    fs.existsSync(ZEABUR_VOLUME_UPLOAD_PATH) ? ZEABUR_VOLUME_UPLOAD_PATH : null,
    fs.existsSync(ZEABUR_LEGACY_UPLOAD_PATH) ? ZEABUR_LEGACY_UPLOAD_PATH : null,
    LOCAL_UPLOAD_PATH
  ].filter(Boolean);

  for (const candidate of candidateDirs) {
    try {
      fs.mkdirSync(candidate, { recursive: true });
      fs.accessSync(candidate, fs.constants.W_OK);
      return candidate;
    } catch (err) {
      console.warn(`⚠️ 無法使用上傳目錄 ${candidate}:`, err.message);
    }
  }

  throw new Error('找不到可寫入的上傳目錄');
}

function buildStaticAssetDirs(uploadDir) {
  return [...new Set([
    uploadDir,
    ZEABUR_VOLUME_UPLOAD_PATH,
    ZEABUR_LEGACY_UPLOAD_PATH,
    LOCAL_UPLOAD_PATH
  ].filter(Boolean))];
}

module.exports = {
  ZEABUR_VOLUME_UPLOAD_PATH,
  ZEABUR_LEGACY_UPLOAD_PATH,
  LOCAL_UPLOAD_PATH,
  VIDEO_ASSET_EXTENSIONS,
  MODEL_ASSET_EXTENSIONS,
  resolveUploadDir,
  buildStaticAssetDirs
};
