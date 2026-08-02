const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rich-elegant-service-test-'));
const dataDir = path.join(testRoot, 'data');
const uploadDir = path.join(testRoot, 'uploads');
fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, 'articles.json'), JSON.stringify([
  {
    id: 'published-1',
    title: '已發佈文章',
    category: '知識分享',
    excerpt: '公開摘要',
    content: '公開內容',
    image: '',
    images: [],
    date: '2026-08-02',
    status: 'published',
    createdAt: '2026-08-02T00:00:00.000Z'
  },
  {
    id: 'draft-1',
    title: '草稿文章',
    category: '知識分享',
    excerpt: '',
    content: '草稿內容',
    image: '',
    images: [],
    date: '2026-08-02',
    status: 'draft',
    createdAt: '2026-08-02T00:00:00.000Z'
  }
], null, 2));

process.env.NODE_ENV = 'production';
delete process.env.VERCEL;
process.env.DATA_DIR = dataDir;
process.env.UPLOAD_DIR = uploadDir;
process.env.ADMIN_PASSWORD = 'test-password';

const app = require('../server');
let server;
let baseUrl;

function jsonRequest(url, options) {
  return fetch(baseUrl + url, options).then(async function (response) {
    const body = await response.json();
    return { response, body };
  });
}

test.before(function (_, done) {
  server = app.listen(0, function () {
    baseUrl = 'http://127.0.0.1:' + server.address().port;
    done();
  });
});

test.after(function (_, done) {
  server.close(done);
});

test('公開 API 只會顯示已發佈文章', async function () {
  const result = await jsonRequest('/api/articles');
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body.map(function (article) { return article.id; }), ['published-1']);
});

test('未登入唔可以改文章，而登入後可以完整管理文章', async function () {
  const unauthorised = await jsonRequest('/api/articles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '不應該成功', content: '不應該成功' })
  });
  assert.equal(unauthorised.response.status, 401);

  const wrongLogin = await jsonRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'wrong-password' })
  });
  assert.equal(wrongLogin.response.status, 401);

  const login = await jsonRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'test-password' })
  });
  assert.equal(login.response.status, 200);
  const cookie = login.response.headers.get('set-cookie').split(';')[0];

  const session = await jsonRequest('/api/auth/session', { headers: { Cookie: cookie } });
  assert.equal(session.response.status, 200);
  assert.equal(session.body.authenticated, true);

  const allArticles = await jsonRequest('/api/articles', { headers: { Cookie: cookie } });
  assert.equal(allArticles.body.length, 2);

  const created = await jsonRequest('/api/articles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      title: '新文章',
      category: '驗樓資訊',
      excerpt: '摘要',
      content: '內容',
      status: 'draft'
    })
  });
  assert.equal(created.response.status, 200);
  assert.match(created.body.article.id, /^[0-9a-f-]{36}$/);

  const updated = await jsonRequest('/api/articles/' + created.body.article.id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ status: 'published', content: '更新後內容' })
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.article.status, 'published');

  const removed = await jsonRequest('/api/articles/' + created.body.article.id, {
    method: 'DELETE',
    headers: { Cookie: cookie }
  });
  assert.equal(removed.response.status, 200);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'articles.json'), 'utf8')).length, 2);
});

test('敏感程式檔案唔會由網站直接展示', async function () {
  const result = await fetch(baseUrl + '/server.js');
  assert.equal(result.status, 404);
});
