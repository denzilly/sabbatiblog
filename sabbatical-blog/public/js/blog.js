const listView  = document.getElementById('blog-list');
const postView  = document.getElementById('blog-post');
const postList  = document.getElementById('post-list');
const backBtn   = document.getElementById('back-btn');

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
}

function showList(posts) {
  postView.style.display = 'none';
  listView.style.display = 'block';

  postList.innerHTML = '';

  if (posts.length === 0) {
    postList.innerHTML = '<p style="font-family:\'DM Mono\',monospace;font-size:0.7rem;letter-spacing:0.2em;color:var(--muted);text-transform:uppercase;padding:2rem 0;">No posts yet</p>';
    return;
  }

  posts.forEach(post => {
    const item = document.createElement('div');
    item.className = 'post-item fade-up';

    const words = post.body.split(/\s+/).slice(0, 30).join(' ');
    const excerpt = words + (post.body.split(/\s+/).length > 30 ? '…' : '');

    item.innerHTML = `
      <p class="post-meta">${formatDate(post.createdAt)}</p>
      <h2 class="post-title">${escHtml(post.title)}</h2>
      <p class="post-excerpt">${escHtml(excerpt)}</p>
    `;

    item.addEventListener('click', () => showPost(post));
    postList.appendChild(item);
  });

  // Scroll animations
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } });
  }, { threshold: 0.1 });
  document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));
}

function showPost(post) {
  listView.style.display = 'none';
  postView.style.display = 'block';
  window.scrollTo(0, 0);

  document.getElementById('post-date').textContent = formatDate(post.createdAt);
  document.getElementById('post-title').textContent = post.title;

  // Render body: split on double newlines → paragraphs
  const bodyEl = document.getElementById('post-body');
  bodyEl.innerHTML = post.body
    .split(/\n\n+/)
    .map(p => `<p>${escHtml(p.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

backBtn.addEventListener('click', e => {
  e.preventDefault();
  history.pushState({}, '', '/blog');
  fetch('/api/posts').then(r => r.json()).then(showList);
});

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Load posts on init
fetch('/api/posts')
  .then(r => r.json())
  .then(showList)
  .catch(() => {
    listView.style.display = 'block';
    postList.innerHTML = '<p style="font-family:\'DM Mono\',monospace;font-size:0.7rem;letter-spacing:0.2em;color:var(--muted);text-transform:uppercase;padding:2rem 0;">Could not load posts</p>';
  });
