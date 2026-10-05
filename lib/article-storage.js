const fs = require('node:fs');
const path = require('node:path');

function storageError(status, message) {
  return Object.assign(new Error(message), { status });
}

function createArticleStorage(options) {
  const { localFile, hosted, articleToken, imageToken } = options;
  const cloud = Boolean(articleToken);
  const blob = cloud || imageToken ? (options.blob || require('@vercel/blob')) : null;
  const catalogPath = 'cms/articles.json';

  function readLocal() {
    if (!fs.existsSync(localFile)) return [];
    const articles = JSON.parse(fs.readFileSync(localFile, 'utf8'));
    if (!Array.isArray(articles)) throw new Error('文章資料格式不正確');
    return articles;
  }

  async function readState(forMutation = false) {
    if (!cloud) return { articles: readLocal(), etag: null };
    const response = await blob.get(catalogPath, { token: articleToken, access: 'private', useCache: false });
    if (!response) return { articles: readLocal(), etag: null };
    const articles = JSON.parse(await new Response(response.stream).text());
    if (!Array.isArray(articles)) throw new Error('文章資料格式不正確');
    let etag = response.blob.etag;
    // Compressed reads can return a weak ETag. Match the exact storage revision
    // before using the strong metadata ETag for a conditional write.
    if (forMutation && etag && etag.startsWith('W/')) {
      const metadata = await blob.head(catalogPath, { token: articleToken });
      if (metadata.etag !== etag.slice(2)) {
        throw storageError(409, '文章資料已被更新，請重新載入後再儲存。');
      }
      etag = metadata.etag;
    }
    return { articles, etag };
  }

  async function writeState(articles, etag) {
    if (cloud) {
      try {
        await blob.put(catalogPath, JSON.stringify(articles), {
          token: articleToken,
          access: 'private',
          addRandomSuffix: false,
          contentType: 'application/json',
          allowOverwrite: Boolean(etag),
          ...(etag ? { ifMatch: etag } : {})
        });
      } catch (error) {
        if (error instanceof blob.BlobPreconditionFailedError || /already exists/i.test(error.message)) {
          throw storageError(409, '文章資料已被更新，請重新載入後再儲存。');
        }
        throw error;
      }
      return;
    }
    if (hosted) throw storageError(503, '文章儲存尚未接通，請稍後再試。');
    fs.mkdirSync(path.dirname(localFile), { recursive: true });
    const temporary = localFile + '.' + process.pid + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(articles, null, 2));
    fs.renameSync(temporary, localFile);
  }

  // A local queue also prevents two requests from overwriting one another.
  let pendingMutation = Promise.resolve();
  function mutate(change) {
    const job = pendingMutation.then(async function () {
      const state = await readState(true);
      const result = change(state.articles);
      await writeState(state.articles, state.etag);
      return result;
    });
    pendingMutation = job.catch(function () {});
    return job;
  }

  async function storeImage(file) {
    if (!imageToken) {
      if (hosted) throw storageError(503, '圖片儲存尚未接通，請稍後再試。');
      return null;
    }
    const extension = path.extname(file.originalname).toLowerCase();
    const name = 'uploads/' + require('node:crypto').randomUUID() + extension;
    const image = await blob.put(name, file.buffer, {
      token: imageToken, access: 'public', contentType: file.mimetype, addRandomSuffix: false
    });
    return image.url;
  }

  return {
    read: async function () { return (await readState()).articles; },
    mutate,
    storeImage,
    canWrite: !hosted || cloud,
    canUpload: !hosted || Boolean(imageToken),
    mode: cloud ? 'cloud' : hosted ? 'read-only' : 'local'
  };
}

module.exports = { createArticleStorage };
