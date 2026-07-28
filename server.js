/* ========================================
   雅博工程公司 - 後台管理伺服器
   ========================================
   
   點樣用：
   1. 打開「終端機」(Terminal)
   2. 輸入: cd 去呢個資料夾
   3. 第一次用要輸入: npm install
   4. 之後每次輸入: npm start
   5. 打開瀏覽器去: http://localhost:3000
   6. 後台管理: http://localhost:3000/admin/
   ======================================== */

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// ---- 資料夾設定 ----
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const ARTICLES_FILE = path.join(DATA_DIR, 'articles.json');

// 確保資料夾存在
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(ARTICLES_FILE)) fs.writeFileSync(ARTICLES_FILE, '[]');

// ---- Middleware ----
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use('/uploads', express.static(UPLOAD_DIR));

// ---- 圖片上傳設定 ----
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const name = Date.now() + '-' + Math.round(Math.random() * 1e6) + ext;
    cb(null, name);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 最大 10MB
  fileFilter: function (req, file, cb) {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) {
      cb(null, true);
    } else {
      cb(new Error('只支援 JPG、PNG、GIF、WebP 圖片格式'));
    }
  }
});

// ---- 讀取文章 ----
function readArticles() {
  try {
    const data = fs.readFileSync(ARTICLES_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

// ---- 儲存文章 ----
function saveArticles(articles) {
  fs.writeFileSync(ARTICLES_FILE, JSON.stringify(articles, null, 2), 'utf8');
}

// ========================================
// API 路由
// ========================================

// 取得所有文章
app.get('/api/articles', function (req, res) {
  const articles = readArticles();
  res.json(articles);
});

// 取得單篇文章
app.get('/api/articles/:id', function (req, res) {
  const articles = readArticles();
  const article = articles.find(function (a) { return a.id === req.params.id; });
  if (!article) return res.status(404).json({ error: '文章唔存在' });
  res.json(article);
});

// 新增文章
app.post('/api/articles', function (req, res) {
  const articles = readArticles();
  const newArticle = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    title: req.body.title || '',
    category: req.body.category || '知識分享',
    excerpt: req.body.excerpt || '',
    content: req.body.content || '',
    image: req.body.image || '',
    images: req.body.images || [],
    date: req.body.date || new Date().toISOString().split('T')[0],
    status: req.body.status || 'published',
    createdAt: new Date().toISOString()
  };
  articles.unshift(newArticle);
  saveArticles(articles);
  res.json({ success: true, article: newArticle });
});

// 更新文章
app.put('/api/articles/:id', function (req, res) {
  const articles = readArticles();
  const index = articles.findIndex(function (a) { return a.id === req.params.id; });
  if (index === -1) return res.status(404).json({ error: '文章唔存在' });

  const updated = articles[index];
  if (req.body.title !== undefined) updated.title = req.body.title;
  if (req.body.category !== undefined) updated.category = req.body.category;
  if (req.body.excerpt !== undefined) updated.excerpt = req.body.excerpt;
  if (req.body.content !== undefined) updated.content = req.body.content;
  if (req.body.image !== undefined) updated.image = req.body.image;
  if (req.body.images !== undefined) updated.images = req.body.images;
  if (req.body.date !== undefined) updated.date = req.body.date;
  if (req.body.status !== undefined) updated.status = req.body.status;
  updated.updatedAt = new Date().toISOString();

  articles[index] = updated;
  saveArticles(articles);
  res.json({ success: true, article: updated });
});

// 刪除文章
app.delete('/api/articles/:id', function (req, res) {
  let articles = readArticles();
  const index = articles.findIndex(function (a) { return a.id === req.params.id; });
  if (index === -1) return res.status(404).json({ error: '文章唔存在' });

  const removed = articles.splice(index, 1)[0];

  // 刪除相關圖片
  if (removed.image && removed.image.startsWith('/uploads/')) {
    const imgPath = path.join(__dirname, removed.image);
    if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
  }
  if (removed.images && Array.isArray(removed.images)) {
    removed.images.forEach(function (img) {
      if (img.startsWith('/uploads/')) {
        const imgPath = path.join(__dirname, img);
        if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
      }
    });
  }

  saveArticles(articles);
  res.json({ success: true });
});

// 上傳圖片
app.post('/api/upload', upload.single('image'), function (req, res) {
  if (!req.file) return res.status(400).json({ error: '冇收到圖片' });
  res.json({
    success: true,
    url: '/uploads/' + req.file.filename,
    filename: req.file.filename
  });
});

// 上傳多張圖片
app.post('/api/upload-multiple', upload.array('images', 10), function (req, res) {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: '冇收到圖片' });
  }
  const urls = req.files.map(function (f) {
    return '/uploads/' + f.filename;
  });
  res.json({ success: true, urls: urls });
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
  console.error(err.message);
  res.status(500).json({ error: err.message || '伺服器錯誤' });
});

// ---- 啟動伺服器（本地開發用，Vercel 會自動處理） ----
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, function () {
    console.log('');
    console.log('========================================');
    console.log('  雅博工程公司官網已啟動！');
    console.log('========================================');
    console.log('');
    console.log('  前台網站: http://localhost:' + PORT);
    console.log('  後台管理: http://localhost:' + PORT + '/admin/');
    console.log('');
    console.log('  按 Ctrl+C 停止伺服器');
    console.log('========================================');
    console.log('');
  });
}

// Vercel serverless function 匯出
module.exports = app;
