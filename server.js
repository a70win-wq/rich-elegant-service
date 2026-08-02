/* ========================================
   雅博工程公司 - 後台管理伺服器
   ======================================== */

const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const os = require('os');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_VERCEL = process.env.VERCEL === '1' || process.env.VERCEL === 'true';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = process.env.UPLOAD_DIR || (
  IS_VERCEL ? path.join(os.tmpdir(), 'rich-elegant-service-uploads') : path.join(__dirname, 'uploads')
);
const ARTICLES_FILE = path.join(DATA_DIR, 'articles.json');
const ADMIN_SESSION_COOKIE = 'admin_session';
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const MAX_ARTICLE_IMAGES = 10;

function ensureDirectory(directory) {
  if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });
}

// 本地可以儲存檔案；Vercel 只讀取已部署嘅資料，唔假裝可以永久儲存。
if (!IS_VERCEL) {
  ensureDirectory(DATA_DIR);
  ensureDirectory(UPLOAD_DIR);
  if (!fs.existsSync(ARTICLES_FILE)) fs.writeFileSync(ARTICLES_FILE, '[]', 'utf8');
} else {
  // Vercel 嘅程式資料夾未必有 uploads，而且唔係永久硬碟。
  ensureDirectory(UPLOAD_DIR);
}

// ---- Middleware ----
app.disable('x-powered-by');
app.use(function (req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (req.path.indexOf('/api/') === 0) res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(function (req, res, next) {
  const blockedPaths = new Set([
    '/server.js',
    '/package.json',
    '/package-lock.json',
    '/vercel.json',
    '/start.sh',
    '/api/index.js'
  ]);
  if (blockedPaths.has(req.path) || req.path.indexOf('/.env') === 0 || req.path.indexOf('/.git') === 0) {
    return res.sendStatus(404);
  }
  next();
});
app.use(express.static(__dirname, { dotfiles: 'deny', index: 'index.html' }));
app.use('/uploads', express.static(UPLOAD_DIR, { dotfiles: 'deny' }));

// ---- 後台登入 ----
function getAdminPassword() {
  const configuredPassword = (process.env.ADMIN_PASSWORD || '').trim();
  if (configuredPassword) return configuredPassword;
  // 本地保留舊流程方便使用；公開部署一定要設定環境變數。
  if (!IS_VERCEL && process.env.NODE_ENV !== 'production') return 'admin123';
  return null;
}

function getSessionSecret() {
  const password = getAdminPassword();
  if (!password) return null;
  return process.env.ADMIN_SESSION_SECRET || crypto.createHash('sha256')
    .update('rich-elegant-service:' + password)
    .digest('hex');
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function signSession(expiresAt) {
  const payload = Buffer.from(JSON.stringify({ expiresAt })).toString('base64url');
  const signature = crypto.createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
  return payload + '.' + signature;
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return header.split(';').reduce(function (cookies, part) {
    const separator = part.indexOf('=');
    if (separator === -1) return cookies;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function hasAdminSession(req) {
  const secret = getSessionSecret();
  if (!secret) return false;
  const token = parseCookies(req)[ADMIN_SESSION_COOKIE];
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const expectedSignature = crypto.createHmac('sha256', secret).update(parts[0]).digest('base64url');
  if (!safeEqual(parts[1], expectedSignature)) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    return Number.isFinite(payload.expiresAt) && payload.expiresAt > Date.now();
  } catch (error) {
    return false;
  }
}

function setSessionCookie(res, value, maxAge) {
  const cookie = [
    ADMIN_SESSION_COOKIE + '=' + encodeURIComponent(value),
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    'Max-Age=' + maxAge
  ];
  if (IS_VERCEL || process.env.NODE_ENV === 'production') cookie.push('Secure');
  res.setHeader('Set-Cookie', cookie.join('; '));
}

function clearSessionCookie(res) {
  setSessionCookie(res, '', 0);
}

function requireAdmin(req, res, next) {
  if (!getAdminPassword()) {
    return res.status(503).json({ error: '線上未設定管理員密碼，請先設定 ADMIN_PASSWORD' });
  }
  if (!hasAdminSession(req)) return res.status(401).json({ error: '請先登入後台' });
  next();
}

function requireWritableStorage(req, res, next) {
  if (IS_VERCEL) {
    return res.status(503).json({ error: '線上儲存未連接，文章修改請先接上雲端資料庫或儲存空間' });
  }
  next();
}

app.post('/api/auth/login', function (req, res) {
  const expectedPassword = getAdminPassword();
  if (!expectedPassword) {
    return res.status(503).json({ error: '線上未設定管理員密碼，請先設定 ADMIN_PASSWORD' });
  }
  const suppliedPassword = req.body && typeof req.body.password === 'string' ? req.body.password : '';
  if (!safeEqual(suppliedPassword, expectedPassword)) {
    return res.status(401).json({ error: '密碼錯誤，請再試一次' });
  }
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  setSessionCookie(res, signSession(expiresAt), SESSION_TTL_SECONDS);
  res.json({ success: true });
});

app.get('/api/auth/session', function (req, res) {
  if (!getAdminPassword()) {
    return res.status(503).json({ error: '線上未設定管理員密碼，請先設定 ADMIN_PASSWORD' });
  }
  if (!hasAdminSession(req)) return res.status(401).json({ authenticated: false });
  res.json({ authenticated: true });
});

app.post('/api/auth/logout', function (req, res) {
  clearSessionCookie(res);
  res.json({ success: true });
});

// ---- 文章資料 ----
function readArticles() {
  try {
    const data = fs.readFileSync(ARTICLES_FILE, 'utf8');
    const articles = JSON.parse(data);
    return Array.isArray(articles) ? articles : [];
  } catch (error) {
    return [];
  }
}

function makeHttpError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function saveArticles(articles) {
  if (IS_VERCEL) throw makeHttpError(503, '線上儲存未連接，文章修改請先接上雲端資料庫或儲存空間', 'PERSISTENCE_UNAVAILABLE');
  ensureDirectory(DATA_DIR);
  const temporaryFile = ARTICLES_FILE + '.' + process.pid + '.tmp';
  fs.writeFileSync(temporaryFile, JSON.stringify(articles, null, 2), 'utf8');
  fs.renameSync(temporaryFile, ARTICLES_FILE);
}

function textValue(value, field, maxLength) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw makeHttpError(400, field + '格式唔正確');
  const trimmed = value.trim();
  if (trimmed.length > maxLength) throw makeHttpError(400, field + '太長');
  return trimmed;
}

function imageList(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_ARTICLE_IMAGES) {
    throw makeHttpError(400, '文章圖片數量唔正確');
  }
  return value.map(function (image) {
    if (typeof image !== 'string' || image.length > 2000) throw makeHttpError(400, '文章圖片連結唔正確');
    return image;
  });
}

function validateArticle(article) {
  if (!article.title) throw makeHttpError(400, '請輸入文章標題');
  if (!article.content) throw makeHttpError(400, '請輸入文章內容');
  if (article.status !== 'published' && article.status !== 'draft') {
    throw makeHttpError(400, '文章狀態唔正確');
  }
  if (article.date && !/^\d{4}-\d{2}-\d{2}$/.test(article.date)) {
    throw makeHttpError(400, '文章日期格式唔正確');
  }
}

function buildArticle(body, existing) {
  const source = existing || {};
  const article = Object.assign({}, source);
  const title = textValue(body.title, '文章標題', 200);
  const category = textValue(body.category, '文章分類', 80);
  const excerpt = textValue(body.excerpt, '文章摘要', 1000);
  const content = textValue(body.content, '文章內容', 50000);
  const image = textValue(body.image, '封面圖片', 2000);
  const images = imageList(body.images);
  const date = textValue(body.date, '文章日期', 10);
  const status = textValue(body.status, '文章狀態', 20);

  if (title !== undefined) article.title = title;
  if (category !== undefined) article.category = category || '知識分享';
  if (excerpt !== undefined) article.excerpt = excerpt;
  if (content !== undefined) article.content = content;
  if (image !== undefined) article.image = image;
  if (images !== undefined) article.images = images;
  if (date !== undefined) article.date = date;
  if (status !== undefined) article.status = status;

  if (!existing) {
    article.id = crypto.randomUUID();
    article.category = article.category || '知識分享';
    article.excerpt = article.excerpt || '';
    article.image = article.image || '';
    article.images = article.images || [];
    article.date = article.date || new Date().toISOString().slice(0, 10);
    article.status = article.status || 'published';
    article.createdAt = new Date().toISOString();
  }
  validateArticle(article);
  return article;
}

function getVisibleArticles(req) {
  const articles = readArticles();
  return hasAdminSession(req) ? articles : articles.filter(function (article) {
    return article.status !== 'draft';
  });
}

function uploadFileFromUrl(url) {
  if (typeof url !== 'string' || url.indexOf('/uploads/') !== 0) return null;
  const filename = url.slice('/uploads/'.length);
  if (!filename || filename.indexOf('/') !== -1 || filename.indexOf('\\') !== -1) return null;
  const filePath = path.resolve(UPLOAD_DIR, filename);
  const uploadRoot = path.resolve(UPLOAD_DIR) + path.sep;
  return filePath.indexOf(uploadRoot) === 0 ? filePath : null;
}

function cleanupRemovedImages(removed, remainingArticles) {
  const usedImages = new Set();
  remainingArticles.forEach(function (article) {
    if (article.image) usedImages.add(article.image);
    (Array.isArray(article.images) ? article.images : []).forEach(function (image) {
      usedImages.add(image);
    });
  });
  const removedImages = [removed.image].concat(Array.isArray(removed.images) ? removed.images : []);
  Array.from(new Set(removedImages)).forEach(function (image) {
    if (!image || usedImages.has(image)) return;
    const filePath = uploadFileFromUrl(image);
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });
}

// 公開文章只會見到已發佈內容；後台登入後先會見到草稿。
app.get('/api/articles', function (req, res) {
  res.json(getVisibleArticles(req));
});

app.get('/api/articles/:id', function (req, res) {
  const article = getVisibleArticles(req).find(function (item) { return item.id === req.params.id; });
  if (!article) return res.status(404).json({ error: '文章唔存在' });
  res.json(article);
});

app.get('/api/health', function (req, res) {
  res.json({ ok: true, storage: IS_VERCEL ? 'read-only' : 'local' });
});

app.post('/api/articles', requireAdmin, requireWritableStorage, function (req, res) {
  const articles = readArticles();
  const newArticle = buildArticle(req.body || {}, null);
  articles.unshift(newArticle);
  saveArticles(articles);
  res.json({ success: true, article: newArticle });
});

app.put('/api/articles/:id', requireAdmin, requireWritableStorage, function (req, res) {
  const articles = readArticles();
  const index = articles.findIndex(function (article) { return article.id === req.params.id; });
  if (index === -1) return res.status(404).json({ error: '文章唔存在' });
  const updated = buildArticle(req.body || {}, articles[index]);
  updated.updatedAt = new Date().toISOString();
  articles[index] = updated;
  saveArticles(articles);
  res.json({ success: true, article: updated });
});

app.delete('/api/articles/:id', requireAdmin, requireWritableStorage, function (req, res) {
  const articles = readArticles();
  const index = articles.findIndex(function (article) { return article.id === req.params.id; });
  if (index === -1) return res.status(404).json({ error: '文章唔存在' });
  const removed = articles[index];
  const remaining = articles.filter(function (article) { return article.id !== req.params.id; });
  saveArticles(remaining);
  cleanupRemovedImages(removed, remaining);
  res.json({ success: true });
});

// ---- 圖片上傳 ----
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, Date.now() + '-' + crypto.randomBytes(6).toString('hex') + ext);
  }
});

const allowedImages = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp']
]);

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: MAX_ARTICLE_IMAGES },
  fileFilter: function (req, file, cb) {
    const extension = path.extname(file.originalname).toLowerCase();
    if (allowedImages.get(extension) === file.mimetype) return cb(null, true);
    cb(makeHttpError(400, '只支援 JPG、PNG、GIF、WebP 圖片格式'));
  }
});

app.post('/api/upload', requireAdmin, requireWritableStorage, upload.single('image'), function (req, res) {
  if (!req.file) return res.status(400).json({ error: '冇收到圖片' });
  res.json({ success: true, url: '/uploads/' + req.file.filename, filename: req.file.filename });
});

app.post('/api/upload-multiple', requireAdmin, requireWritableStorage, upload.array('images', MAX_ARTICLE_IMAGES), function (req, res) {
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: '冇收到圖片' });
  res.json({
    success: true,
    urls: req.files.map(function (file) { return '/uploads/' + file.filename; })
  });
});

// ---- 後台管理頁面 ----
app.get('/admin', function (req, res) {
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

app.get('/admin/*', function (req, res) {
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

// ---- 錯誤處理 ----
app.use(function (err, req, res, next) {
  if (res.headersSent) return next(err);
  const isUploadError = err instanceof multer.MulterError || err.code === 'LIMIT_FILE_SIZE' || err.status === 400;
  const status = err.status || (isUploadError ? 400 : 500);
  console.error(err.message);
  res.status(status).json({ error: status >= 500 ? '伺服器暫時出錯，請稍後再試' : err.message });
});

// 直接執行 server.js 先開本地伺服器；被 Vercel require 時唔會偷偷開 port。
if (require.main === module) {
  app.listen(PORT, function () {
    console.log('雅博工程公司官網已啟動：' + PORT);
  });
}

module.exports = app;
