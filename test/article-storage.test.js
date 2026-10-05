const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createArticleStorage } = require('../lib/article-storage');

function setup(config = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rich-elegant-cloud-test-'));
  const file = path.join(root, 'articles.json');
  fs.writeFileSync(file, '[]');
  let contents = null;
  let etag = null;
  let revision = 0;
  const calls = [];
  class BlobPreconditionFailedError extends Error {}
  const blob = {
    BlobPreconditionFailedError,
    get: async function (_, options) {
      calls.push({ action: 'get', options });
      return contents === null ? null : { stream: new Response(contents).body, blob: { etag: config.weakReadEtags ? 'W/' + etag : etag } };
    },
    head: async function (_, options) {
      calls.push({ action: 'head', options });
      return { etag };
    },
    put: async function (pathname, body, options) {
      calls.push({ action: 'put', pathname, options });
      if (pathname.startsWith('uploads/')) return { url: 'https://site.public.blob.vercel-storage.com/' + pathname };
      if (etag && options.ifMatch !== etag) throw new BlobPreconditionFailedError();
      contents = body; etag = '"version-' + (++revision) + '"';
      return { etag };
    }
  };
  return { file, blob, calls, bump: function () { etag = '"other-writer"'; }, contents: function () { return contents; } };
}

test('雲端文章及草稿在重新建立服務後仍然保留，資料只使用私人儲存', async function () {
  const fixture = setup();
  const options = { localFile: fixture.file, hosted: true, articleToken: 'private-test', imageToken: 'public-test', blob: fixture.blob };
  const first = createArticleStorage(options);
  await first.mutate(function (articles) { articles.push({ id: 'draft', status: 'draft', title: '測試草稿' }); });
  const restarted = createArticleStorage(options);
  assert.equal((await restarted.read())[0].title, '測試草稿');
  await restarted.mutate(function (articles) { articles[0].status = 'published'; });
  assert.equal((await first.read())[0].status, 'published');
  const reads = fixture.calls.filter(function (c) { return c.action === 'get'; });
  assert.ok(reads.every(function (c) { return c.options.access === 'private' && c.options.useCache === false; }));
  const writes = fixture.calls.filter(function (c) { return c.action === 'put'; });
  assert.equal(writes[1].options.ifMatch, '"version-1"');
  assert.equal(writes[0].options.access, 'private');
});

test('同時更新版本不符時會提示衝突，不會覆蓋另一個版本', async function () {
  const fixture = setup();
  const store = createArticleStorage({ localFile: fixture.file, hosted: true, articleToken: 'private-test', blob: fixture.blob });
  await store.mutate(function (a) { a.push({ id: '1', title: '原稿' }); });
  await assert.rejects(store.mutate(function (a) { a[0].title = '修改'; fixture.bump(); }), function (error) { return error.status === 409; });
  assert.equal(JSON.parse(fixture.contents())[0].title, '原稿');
});

test('壓縮讀取的版本標記經核對後仍可連續儲存', async function () {
  const fixture = setup({ weakReadEtags: true });
  const store = createArticleStorage({ localFile: fixture.file, hosted: true, articleToken: 'private-test', blob: fixture.blob });
  await store.mutate(function (a) { a.push({ id: '1', title: '原稿' }); });
  await store.mutate(function (a) { a[0].title = '修改'; });
  await store.mutate(function (a) { a.splice(0, 1); });
  assert.deepEqual(await store.read(), []);
  const writes = fixture.calls.filter(function (c) { return c.action === 'put'; });
  assert.equal(writes[1].options.ifMatch, '"version-1"');
  assert.equal(writes[2].options.ifMatch, '"version-2"');
  assert.ok(fixture.calls.some(function (c) { return c.action === 'head' && c.options.token === 'private-test'; }));
});

test('核對版本期間有其他修改時會停止儲存', async function () {
  const fixture = setup({ weakReadEtags: true });
  const store = createArticleStorage({ localFile: fixture.file, hosted: true, articleToken: 'private-test', blob: fixture.blob });
  await store.mutate(function (a) { a.push({ id: '1', title: '原稿' }); });
  const readMetadata = fixture.blob.head;
  fixture.blob.head = async function (...args) { fixture.bump(); return readMetadata(...args); };
  await assert.rejects(store.mutate(function (a) { a[0].title = '修改'; }), function (error) { return error.status === 409; });
  assert.equal(JSON.parse(fixture.contents())[0].title, '原稿');
  assert.equal(fixture.calls.filter(function (c) { return c.action === 'put'; }).length, 1);
});

test('圖片使用公開儲存，而未連接的正式網站會明確拒絕儲存', async function () {
  const fixture = setup();
  const store = createArticleStorage({ localFile: fixture.file, hosted: true, articleToken: 'private-test', imageToken: 'public-test', blob: fixture.blob });
  const url = await store.storeImage({ originalname: 'flyer.jpeg', mimetype: 'image/jpeg', buffer: Buffer.from('image') });
  assert.match(url, /^https:\/\/site\.public\.blob\.vercel-storage\.com\/uploads\//);
  assert.equal(fixture.calls.at(-1).options.access, 'public');
  assert.equal(fixture.calls.at(-1).options.token, 'public-test');
  const disconnected = createArticleStorage({ localFile: fixture.file, hosted: true });
  assert.equal(disconnected.canWrite, false);
  assert.equal(disconnected.canUpload, false);
  await assert.rejects(disconnected.mutate(function (a) { a.push({ id: 'x' }); }), function (error) { return error.status === 503; });
});
