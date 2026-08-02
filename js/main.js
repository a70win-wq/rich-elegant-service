/* ========================================
   雅博工程公司 - Global JavaScript
   ======================================== */

// Mark that JS is active (enables CSS animations)
document.documentElement.classList.add('js');

document.addEventListener('DOMContentLoaded', function () {

  // ---- Mobile menu toggle ----
  const menuToggle = document.querySelector('.menu-toggle');
  const mainNav = document.querySelector('.main-nav');
  if (menuToggle && mainNav) {
    function setMenuState(isOpen) {
      mainNav.classList.toggle('open', isOpen);
      menuToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      menuToggle.setAttribute('aria-label', isOpen ? '關閉選單' : '開啟選單');
      document.body.classList.toggle('menu-open', isOpen);

      const spans = menuToggle.querySelectorAll('span');
      spans[0].style.transform = isOpen ? 'rotate(45deg) translate(5px, 5px)' : '';
      spans[1].style.opacity = isOpen ? '0' : '';
      spans[2].style.transform = isOpen ? 'rotate(-45deg) translate(5px, -5px)' : '';
    }

    setMenuState(false);

    menuToggle.addEventListener('click', function () {
      setMenuState(!mainNav.classList.contains('open'));
    });

    // Close menu when clicking a link
    mainNav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        setMenuState(false);
      });
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && mainNav.classList.contains('open')) {
        setMenuState(false);
        menuToggle.focus();
      }
    });
  }

  // ---- Header scroll effect ----
  const header = document.querySelector('.site-header');
  if (header) {
    window.addEventListener('scroll', function () {
      if (window.scrollY > 20) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    });
  }

  // ---- FAQ Accordion ----
  document.querySelectorAll('.faq-question').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const item = btn.closest('.faq-item');
      const answer = item.querySelector('.faq-answer');
      const isActive = item.classList.contains('active');

      // Close all
      document.querySelectorAll('.faq-item').forEach(function (i) {
        i.classList.remove('active');
        i.querySelector('.faq-answer').style.maxHeight = null;
      });

      // Open clicked (if it was closed)
      if (!isActive) {
        item.classList.add('active');
        answer.style.maxHeight = answer.scrollHeight + 'px';
      }
    });
  });

  // ---- Scroll fade-in animation ----
  const fadeEls = document.querySelectorAll('.fade-in');
  if (fadeEls.length > 0) {
    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    fadeEls.forEach(function (el) { observer.observe(el); });
  }

  // ---- Active nav link ----
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.main-nav a').forEach(function (link) {
    const href = link.getAttribute('href');
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });

  // ---- Articles: load from JSON ----
  const articleContainer = document.getElementById('article-list');
  if (articleContainer) {
      fetch('data/articles.json')
      .then(function (r) {
        if (!r.ok) throw new Error('文章資料讀取失敗');
        return r.json();
      })
      .then(function (articles) {
        articles = Array.isArray(articles) ? articles.filter(function (article) {
          return article.status !== 'draft';
        }) : [];
        if (!articles || articles.length === 0) {
          articleContainer.innerHTML = '<p style="text-align:center;color:#6b7c93;grid-column:1/-1;">暫無文章，請稍後再回來查看。</p>';
          return;
        }
        articleContainer.innerHTML = articles.map(function (a) {
          const safeImage = safeImageUrl(a.image);
          const imgHtml = safeImage
            ? '<img src="' + escapeHtml(safeImage) + '" alt="' + escapeHtml(a.title) + '" loading="lazy">'
            : '🏠';
          return '<article class="article-card fade-in visible">' +
            '<div class="thumb">' + imgHtml + '</div>' +
            '<div class="body">' +
            '<span class="tag">' + escapeHtml(a.category || '知識分享') + '</span>' +
            '<h3>' + escapeHtml(a.title || '') + '</h3>' +
            '<p>' + escapeHtml(a.excerpt || '') + '</p>' +
            '<div class="date">' + escapeHtml(a.date || '') + '</div>' +
            '</div></article>';
        }).join('');
      })
      .catch(function () {
        articleContainer.innerHTML = '<p style="text-align:center;color:#6b7c93;grid-column:1/-1;">暫無文章，請稍後再回來查看。</p>';
      });
  }

  // ---- Year in footer ----
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
});

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = String(value == null ? '' : value);
  return div.innerHTML;
}

function safeImageUrl(url) {
  if (typeof url !== 'string') return '';
  if (url.indexOf('/uploads/') === 0 || /^https?:\/\//i.test(url)) return url;
  return '';
}
