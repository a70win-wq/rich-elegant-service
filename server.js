/* ========================================
   雅博工程公司 - 後台管理伺服器
   ======================================== */

const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createArticleStorage } = require('./lib/article-storage');
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

const articleStorage = createArticleStorage({
  localFile: ARTICLES_FILE,
  hosted: IS_VERCEL,
  articleToken: process.env.ARTICLE_READ_WRITE_TOKEN,
  imageToken: process.env.BLOB_READ_WRITE_TOKEN
});
if (!IS_VERCEL) {
  ensureDirectory(DATA_DIR);
  ensureDirectory(UPLOAD_DIR);
  if (!fs.existsSync(ARTICLES_FILE)) fs.writeFileSync(ARTICLES_FILE, '[]', 'utf8');
}
function asyncRoute(handler) {
  return function (req, res, next) { Promise.resolve(handler(req, res, next)).catch(next); };
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
// Serve only the public assets; data, source, tests and environment files remain private.
const publicFiles = new Set(['index.html', 'services.html', 'pricing.html', 'process.html', 'articles.html', 'faq.html', 'about.html', 'not-found.html']);
app.use('/assets', express.static(path.join(__dirname, 'assets'), { dotfiles: 'deny' }));
app.use('/css', express.static(path.join(__dirname, 'css'), { dotfiles: 'deny' }));
app.use('/js', express.static(path.join(__dirname, 'js'), { dotfiles: 'deny' }));
if (!IS_VERCEL) app.use('/uploads', express.static(UPLOAD_DIR, { dotfiles: 'deny' }));
app.get('/', function (req, res) { res.sendFile(path.join(__dirname, 'index.html')); });
app.get('/:page', function (req, res, next) {
  if (!publicFiles.has(req.params.page)) return next();
  res.sendFile(path.join(__dirname, req.params.page));
});

// ---- 後台登入 ----
function getAdminPassword() {
  const configuredPassword = (process.env.ADMIN_PASSWORD || '').trim();
  if (configuredPassword) return configuredPassword;
  // A configured password is required for a public deployment.
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
    return res.status(503).json({ error: '管理員登入尚未開通，請聯絡網站管理員。' });
  }
  if (!hasAdminSession(req)) return res.status(401).json({ error: '請先登入後台' });
  next();
}

function requireWritableStorage(req, res, next) {
  if (!articleStorage.canWrite) return res.status(503).json({ error: '文章儲存尚未接通，請稍後再試。' });
  next();
}
function requireUploadStorage(req, res, next) {
  if (!articleStorage.canUpload) return res.status(503).json({ error: '圖片儲存尚未接通，請稍後再試。' });
  next();
}

app.post('/api/auth/login', function (req, res) {
  const expectedPassword = getAdminPassword();
  if (!expectedPassword) {
    return res.status(503).json({ error: '管理員登入尚未開通，請聯絡網站管理員。' });
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
    return res.status(503).json({ error: '管理員登入尚未開通，請聯絡網站管理員。' });
  }
  if (!hasAdminSession(req)) return res.status(401).json({ authenticated: false });
  res.json({ authenticated: true });
});

app.post('/api/auth/logout', function (req, res) {
  clearSessionCookie(res);
  res.json({ success: true });
});

// ---- 文章資料 ----
function makeHttpError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function textValue(value, field, maxLength) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw makeHttpError(400, field + '格式不正確');
  const trimmed = value.trim();
  if (trimmed.length > maxLength) throw makeHttpError(400, field + '太長');
  return trimmed;
}

function imageList(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_ARTICLE_IMAGES) {
    throw makeHttpError(400, '文章圖片數量不正確');
  }
  return value.map(function (image) {
    if (typeof image !== 'string' || image.length > 2000) throw makeHttpError(400, '文章圖片連結不正確');
    return image;
  });
}

function validateArticle(article) {
  if (!article.title) throw makeHttpError(400, '請輸入文章標題');
  if (!article.content) throw makeHttpError(400, '請輸入文章內容');
  if (article.status !== 'published' && article.status !== 'draft') {
    throw makeHttpError(400, '文章狀態不正確');
  }
  if (article.date && !/^\d{4}-\d{2}-\d{2}$/.test(article.date)) {
    throw makeHttpError(400, '文章日期格式不正確');
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

async function getVisibleArticles(req) {
  const articles = await articleStorage.read();
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

app.get('/api/articles', asyncRoute(async function (req, res) {
  const articles = await getVisibleArticles(req);
  res.json(articles);
}));
app.get('/api/articles/:id', asyncRoute(async function (req, res) {
  const article = (await getVisibleArticles(req)).find(function (item) { return item.id === req.params.id; });
  if (!article) return res.status(404).json({ error: '文章不存在' });
  res.json(article);
}));
app.get('/api/health', function (req, res) {
  res.json({ ok: true, storage: articleStorage.mode, uploads: articleStorage.canUpload });
});
app.post('/api/articles', requireAdmin, requireWritableStorage, asyncRoute(async function (req, res) {
  const newArticle = buildArticle(req.body || {}, null);
  await articleStorage.mutate(function (articles) { articles.unshift(newArticle); });
  res.json({ success: true, article: newArticle });
}));
app.put('/api/articles/:id', requireAdmin, requireWritableStorage, asyncRoute(async function (req, res) {
  const updated = await articleStorage.mutate(function (articles) {
    const index = articles.findIndex(function (article) { return article.id === req.params.id; });
    if (index === -1) throw makeHttpError(404, '文章不存在');
    const previous = articles[index];
    if (req.body.updatedAt !== undefined && req.body.updatedAt !== (previous.updatedAt || previous.createdAt)) {
      throw makeHttpError(409, '文章已被更新，請重新載入後再編輯。');
    }
    const article = buildArticle(req.body || {}, previous);
    article.updatedAt = new Date().toISOString();
    articles[index] = article;
    return article;
  });
  res.json({ success: true, article: updated });
}));
app.delete('/api/articles/:id', requireAdmin, requireWritableStorage, asyncRoute(async function (req, res) {
  const deleted = await articleStorage.mutate(function (articles) {
    const index = articles.findIndex(function (article) { return article.id === req.params.id; });
    if (index === -1) throw makeHttpError(404, '文章不存在');
    const removed = articles.splice(index, 1)[0];
    return { removed, remaining: articles.slice() };
  });
  if (!IS_VERCEL) cleanupRemovedImages(deleted.removed, deleted.remaining);
  res.json({ success: true });
}));

// ---- 圖片上傳 ----
const allowedImages = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp']
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024, files: MAX_ARTICLE_IMAGES },
  fileFilter: function (req, file, cb) {
    const extension = path.extname(file.originalname).toLowerCase();
    if (allowedImages.get(extension) === file.mimetype) return cb(null, true);
    cb(makeHttpError(400, '只支援 JPG、PNG、GIF、WebP 圖片格式'));
  }
});

async function saveUploadedImage(file) {
  const data = file.buffer;
  const isJpeg = data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  const isPng = data.length > 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isGif = data.subarray(0, 6).toString() === 'GIF87a' || data.subarray(0, 6).toString() === 'GIF89a';
  const isWebp = data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP';
  if (!({ 'image/jpeg': isJpeg, 'image/png': isPng, 'image/gif': isGif, 'image/webp': isWebp })[file.mimetype]) {
    throw makeHttpError(400, '圖片內容或格式不正確，請選擇 JPG、PNG、GIF 或 WebP。');
  }
  const cloudUrl = await articleStorage.storeImage(file);
  if (cloudUrl) return cloudUrl;
  ensureDirectory(UPLOAD_DIR);
  const filename = crypto.randomUUID() + path.extname(file.originalname).toLowerCase();
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), data);
  return '/uploads/' + filename;
}
app.post('/api/upload', requireAdmin, requireUploadStorage, upload.single('image'), asyncRoute(async function (req, res) {
  if (!req.file) return res.status(400).json({ error: '沒有收到圖片' });
  const url = await saveUploadedImage(req.file);
  res.json({ success: true, url });
}));
app.post('/api/upload-multiple', requireAdmin, requireUploadStorage, upload.array('images', MAX_ARTICLE_IMAGES), asyncRoute(async function (req, res) {
  if (!req.files || !req.files.length) return res.status(400).json({ error: '沒有收到圖片' });
  const urls = [];
  for (const file of req.files) urls.push(await saveUploadedImage(file));
  res.json({ success: true, urls });
}));

// ---- 後台管理頁面 ----
app.get('/admin', function (req, res) {
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

app.get('/admin/*', function (req, res) {
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

app.use(function (req, res) { res.status(404).sendFile(path.join(__dirname, 'not-found.html')); });

// ---- 錯誤處理 ----
app.use(function (err, req, res, next) {
  if (res.headersSent) return next(err);
  const isUploadError = err instanceof multer.MulterError || err.code === 'LIMIT_FILE_SIZE' || err.status === 400;
  const status = err.status || (isUploadError ? 400 : 500);
  console.error(err.message);
  res.status(status).json({ error: err.code === 'LIMIT_FILE_SIZE' ? '每張圖片請勿超過 3MB。' : status >= 500 ? '服務暫時無法使用，請稍後再試。' : err.message });
});

// Only the local entry point starts a listening server.
if (require.main === module) {
  app.listen(PORT, function () {
    console.log('雅博工程公司官網已啟動：' + PORT);
  });
}

module.exports = app;
