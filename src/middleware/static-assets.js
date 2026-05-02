const express = require('express');
const path = require('path');
const {
  MODEL_ASSET_EXTENSIONS,
  VIDEO_ASSET_EXTENSIONS
} = require('../config/assets');

function createAssetHeaders(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (MODEL_ASSET_EXTENSIONS.has(ext)) {
    if (ext === '.glb') res.setHeader('Content-Type', 'model/gltf-binary');
    if (ext === '.gltf') res.setHeader('Content-Type', 'model/gltf+json');
    res.setHeader('Cache-Control', 'public, max-age=604800');
    return;
  }
  if (VIDEO_ASSET_EXTENSIONS.has(ext)) {
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    return;
  }
  res.setHeader('Cache-Control', 'public, max-age=604800');
}

function applyImageStaticMiddleware(app, staticAssetDirs) {
  const imageStaticHandlers = staticAssetDirs.map((dir) => express.static(dir, {
    setHeaders: createAssetHeaders
  }));

  app.use('/images', (req, res, next) => {
    let index = 0;
    const tryNextDir = () => {
      const handler = imageStaticHandlers[index++];
      if (!handler) return next();
      handler(req, res, (err) => {
        if (err) return next(err);
        tryNextDir();
      });
    };
    tryNextDir();
  });
}

function applyPublicStaticMiddleware(app, publicDir) {
  app.use(express.static(publicDir, {
    setHeaders: (res, filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.glb') {
        res.setHeader('Content-Type', 'model/gltf-binary');
      } else if (ext === '.gltf') {
        res.setHeader('Content-Type', 'model/gltf+json');
      }
    }
  }));
}

module.exports = {
  applyImageStaticMiddleware,
  applyPublicStaticMiddleware,
  createAssetHeaders
};
