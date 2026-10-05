document.addEventListener('DOMContentLoaded', function () {
  const list = document.getElementById('article-list');
  if (!list) return;
  const detail = document.getElementById('article-detail');
  const status = document.getElementById('article-status');
  const filters = document.querySelector('.article-filters');
  let articles = [];
  let selectedCategory = 'all';
  let requestNumber = 0;

  function renderList() {
    detail.hidden = true;
    list.hidden = false;
    filters.hidden = false;
    const shown = articles.filter(function (a) {
      return selectedCategory === 'all' || (selectedCategory === 'blog' ? a.category !== '最新優惠' : a.category === selectedCategory);
    });
    status.hidden = false;
    status.textContent = shown.length ? '共 ' + shown.length + ' 篇' : (articles.length ? '此分類暫無文章。' : '暫無文章或優惠，歡迎稍後再來查看。');
    list.innerHTML = shown.map(function (a) {
      const image = safeImageUrl(a.image);
      return '<article class="article-card"><a class="article-link" href="articles.html?id=' + encodeURIComponent(a.id) + '"><div class="thumb">' + (image ? '<img src="' + escapeHtml(image) + '" alt="' + escapeHtml(a.title) + '" loading="lazy">' : '📄') + '</div><div class="body"><span class="tag">' + escapeHtml(a.category || '知識分享') + '</span><h3>' + escapeHtml(a.title) + '</h3><p>' + escapeHtml(a.excerpt) + '</p><div class="date">' + escapeHtml(a.date) + '</div><span class="read-more">閱讀全文 →</span></div></a></article>';
    }).join('');
  }

  function renderDetail(a) {
    list.hidden = true;
    filters.hidden = true;
    status.hidden = true;
    detail.hidden = false;
    const cover = safeImageUrl(a.image);
    const images = Array.isArray(a.images) ? a.images : [];
    detail.innerHTML = '<button type="button" class="back-button">← 返回網誌／最新優惠</button><h2>' + escapeHtml(a.title) + '</h2><p class="article-meta">' + escapeHtml(a.category) + ' · ' + escapeHtml(a.date) + '</p>' + (cover ? '<img class="article-cover" src="' + escapeHtml(cover) + '" alt="' + escapeHtml(a.title) + '">' : '') + '<div class="article-copy">' + escapeHtml(a.content) + '</div><div class="article-gallery">' + images.map(function (url, i) {
      const safe = safeImageUrl(url);
      return safe ? '<img src="' + escapeHtml(safe) + '" alt="' + escapeHtml(a.title) + ' 圖片 ' + (i + 1) + '" loading="lazy">' : '';
    }).join('') + '</div>';
    detail.querySelector('.back-button').addEventListener('click', function () {
      history.pushState({}, '', 'articles.html');
      showLocation();
      filters.scrollIntoView({ block: 'start' });
    });
    document.title = a.title + ' | 雅博工程公司';
    requestAnimationFrame(function () { detail.scrollIntoView({ block: 'start' }); });
  }

  function showLocation() {
    const currentRequest = ++requestNumber;
    const id = new URLSearchParams(location.search).get('id');
    if (!id) { document.title = '網誌／最新優惠 | 雅博工程公司'; renderList(); return; }
    status.hidden = false;
    status.textContent = '正在載入文章…';
    detail.hidden = true;
    list.hidden = true;
    filters.hidden = true;
    fetch('/api/articles/' + encodeURIComponent(id), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status === 404 ? '文章不存在或尚未發佈。' : '文章暫時無法載入，請稍後再試。'); return r.json(); })
      .then(function (a) { if (currentRequest === requestNumber) renderDetail(a); })
      .catch(function (error) {
        if (currentRequest !== requestNumber) return;
        status.textContent = error.message;
        detail.hidden = false;
        detail.innerHTML = '<a class="btn btn-dark" href="articles.html">返回網誌／最新優惠</a>';
      });
  }

  list.addEventListener('click', function (event) {
    const link = event.target.closest('.article-link');
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    history.pushState({}, '', link.getAttribute('href'));
    showLocation();
  });
  filters.addEventListener('click', function (event) {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    selectedCategory = button.dataset.category;
    filters.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('active', b === button);
      b.setAttribute('aria-pressed', b === button ? 'true' : 'false');
    });
    renderList();
  });
  window.addEventListener('popstate', showLocation);
  fetch('/api/articles', { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error('載入失敗，請重新整理頁面。'); return r.json(); })
    .then(function (data) {
      articles = Array.isArray(data) ? data.filter(function (a) { return a.status !== 'draft'; }) : [];
      showLocation();
    })
    .catch(function (error) { status.textContent = error.message; });
});
