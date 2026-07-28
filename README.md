# 雅博工程公司官網 - 使用說明

## 快速開始（3步搞掂）

### 第1步：安裝 Node.js（只需要做一次）
去 https://nodejs.org 下載 LTS 版本，安裝佢。

### 第2步：啟動網站
打開「終端機」(Terminal)，輸入：
```
cd ~/Desktop/rich-elegant-website
bash start.sh
```
或者直接雙擊 `start.sh` 檔案。

### 第3步：打開瀏覽器
- 前台網站：http://localhost:3000
- 後台管理：http://localhost:3000/admin/

---

## 後台管理

### 登入
預設密碼：`admin123`

### 改密碼
打開 `admin/index.html`，搵到呢一行：
```javascript
var ADMIN_PASSWORD = 'admin123';
```
改做你想要嘅密碼。

### 新增文章
1. 登入後台
2. 點擊左邊「新增文章」
3. 填寫標題、分類、內容
4. 上傳封面圖片同文章圖片
5. 點擊「儲存文章」

### 編輯/刪除文章
1. 點擊左邊「文章管理」
2. 搵到要改嘅文章
3. 點擊「編輯」或「刪除」

---

## 網站結構

```
rich-elegant-website/
├── index.html          ← 首頁
├── services.html       ← 服務範圍
├── pricing.html        ← 收費標準
├── process.html        ← 驗樓流程
├── articles.html       ← 知識分享
├── faq.html            ← 常見問題
├── about.html          ← 關於我們 + 聯絡
├── css/style.css       ← 網站樣式
├── js/main.js          ← 網站功能
├── admin/index.html    ← 後台管理
├── server.js           ← 伺服器
├── data/articles.json  ← 文章資料
├── uploads/            ← 上傳嘅圖片
├── start.sh            ← 一鍵啟動
└── package.json        ← 依賴設定
```

---

## 修改聯絡資料

打開每個 HTML 檔案，搜尋「稍後提供」，改做你嘅真實資料：
- 電話號碼
- WhatsApp 號碼（同時要改 WhatsApp 連結入面嘅號碼）
- Email
- 地址

WhatsApp 連結格式：`https://wa.me/852XXXXXXXX`（852 係香港區號）

---

## 修改收費

打開 `pricing.html`，搵到收費部分修改。

---

## 部署上線

推薦用以下免費/平價服務：
1. **Netlify**（免費）：https://www.netlify.com - 拖拽上傳就得
2. **Vercel**（免費）：https://vercel.com
3. **GitHub Pages**（免費）：適合純靜態網站

注意：後台管理功能需要 Node.js 伺服器運行，如果只用靜態托管，
文章管理需要改用其他方式（例如 CMS 服務）。

---

## 常見問題

**Q: 點解打開 localhost:3000 睇唔到嘢？**
A: 確認 start.sh 有冇成功運行，睇下終端機有冇顯示「已啟動」。

**Q: 上傳圖片失敗？**
A: 確認圖片唔超過 10MB，格式係 JPG/PNG/GIF/WebP。

**Q: 想改網站顏色？**
A: 打開 `css/style.css`，改最頂嘅 CSS 變數（--primary, --accent 等）。
