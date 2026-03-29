// ── Tab switching ─────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    if (tab.dataset.tab === 'manage') loadManage('photos');
  });
});

// ── Upload tab ────────────────────────────────────────────────────────────────
const fileInput    = document.getElementById('file-input');
const dropzone     = document.getElementById('dropzone');
const dropPreview  = document.getElementById('drop-preview');
const uploadBtn    = document.getElementById('upload-btn');
const uploadProg   = document.getElementById('upload-progress');
const uploadFb     = document.getElementById('upload-feedback');

let selectedFiles = [];

fileInput.addEventListener('change', () => {
  selectedFiles = Array.from(fileInput.files);
  renderPreviews();
});

dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
dropzone.addEventListener('drop', e => {
  e.preventDefault();
  dropzone.classList.remove('drag-over');
  selectedFiles = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
  renderPreviews();
});

function renderPreviews() {
  dropPreview.innerHTML = '';
  uploadBtn.disabled = selectedFiles.length === 0;
  selectedFiles.forEach(f => {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(f);
    dropPreview.appendChild(img);
  });
}

uploadBtn.addEventListener('click', async () => {
  if (!selectedFiles.length) return;

  const wall    = document.getElementById('upload-wall').value;
  const caption = document.getElementById('upload-caption').value.trim();

  uploadBtn.disabled = true;
  uploadProg.classList.add('active');
  uploadFb.className = 'feedback';

  let succeeded = 0;
  let failed    = 0;

  for (const file of selectedFiles) {
    const fd = new FormData();
    fd.append('photo', file);
    fd.append('caption', caption);

    try {
      const res = await fetch(`/api/upload/${wall}`, { method: 'POST', body: fd });
      if (res.ok) succeeded++;
      else failed++;
    } catch { failed++; }

    uploadProg.textContent = `Uploading… ${succeeded + failed} / ${selectedFiles.length}`;
  }

  uploadProg.classList.remove('active');
  uploadBtn.disabled = false;
  selectedFiles = [];
  fileInput.value = '';
  dropPreview.innerHTML = '';
  document.getElementById('upload-caption').value = '';

  if (failed === 0) {
    showFeedback(uploadFb, 'success', `${succeeded} photo${succeeded !== 1 ? 's' : ''} uploaded`);
  } else {
    showFeedback(uploadFb, 'error', `${succeeded} uploaded, ${failed} failed`);
  }
});

// ── New post tab ──────────────────────────────────────────────────────────────
document.getElementById('post-btn').addEventListener('click', async () => {
  const title = document.getElementById('post-title').value.trim();
  const body  = document.getElementById('post-body').value.trim();
  const fb    = document.getElementById('post-feedback');

  if (!title || !body) {
    showFeedback(fb, 'error', 'Title and body are required');
    return;
  }

  const btn = document.getElementById('post-btn');
  btn.disabled = true;

  try {
    const res = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body }),
    });

    if (res.ok) {
      document.getElementById('post-title').value = '';
      document.getElementById('post-body').value = '';
      showFeedback(fb, 'success', 'Post published');
    } else {
      showFeedback(fb, 'error', 'Failed to publish');
    }
  } catch {
    showFeedback(fb, 'error', 'Network error');
  }

  btn.disabled = false;
});

// ── Manage tab ────────────────────────────────────────────────────────────────
document.querySelectorAll('.wall-tab').forEach(wt => {
  wt.addEventListener('click', () => {
    document.querySelectorAll('.wall-tab').forEach(t => t.classList.remove('active'));
    wt.classList.add('active');
    document.querySelectorAll('.manage-section').forEach(s => s.style.display = 'none');
    document.getElementById(`manage-${wt.dataset.wall}`).style.display = 'block';
    loadManage(wt.dataset.wall);
  });
});

async function loadManage(type) {
  if (type === 'posts') {
    const posts = await fetch('/api/posts').then(r => r.json()).catch(() => []);
    renderPostsManage(posts);
  } else {
    const items = await fetch(`/api/${type}`).then(r => r.json()).catch(() => []);
    renderPhotosManage(type, items);
  }
}

function renderPhotosManage(wall, items) {
  const el = document.getElementById(`${wall}-list`);
  el.innerHTML = '';

  if (!items.length) {
    el.innerHTML = '<p style="font-family:\'DM Mono\',monospace;font-size:0.65rem;letter-spacing:0.2em;color:var(--muted);text-transform:uppercase;padding:1rem 0;">No photos yet</p>';
    return;
  }

  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'manage-item';
    div.innerHTML = `
      <img class="manage-thumb" src="/uploads/${wall}/thumbs/${item.thumb}" alt="">
      <div class="manage-info">
        <div class="manage-caption">${escHtml(item.caption || '(no caption)')}</div>
        <div class="manage-meta">${new Date(item.uploadedAt).toLocaleDateString()}</div>
        <div class="edit-inline" id="edit-${item.id}">
          <input type="text" class="edit-caption-input" value="${escAttr(item.caption || '')}" placeholder="Caption…">
          <div style="display:flex;gap:0.4rem">
            <button class="btn btn-primary save-caption-btn" style="padding:0.4rem 0.7rem;font-size:0.55rem" data-id="${item.id}" data-wall="${wall}">Save</button>
            <button class="btn btn-secondary cancel-edit-btn" style="padding:0.4rem 0.7rem;font-size:0.55rem" data-id="${item.id}">Cancel</button>
          </div>
        </div>
      </div>
      <div class="manage-actions">
        <button class="btn btn-secondary edit-btn" data-id="${item.id}" style="padding:0.4rem 0.7rem;font-size:0.55rem">Edit</button>
        <button class="btn btn-danger delete-photo-btn" data-id="${item.id}" data-wall="${wall}" style="padding:0.4rem 0.7rem;font-size:0.55rem">Del</button>
      </div>
    `;
    el.appendChild(div);
  });

  // Edit toggle
  el.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById(`edit-${btn.dataset.id}`).classList.toggle('open');
    });
  });

  el.querySelectorAll('.cancel-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById(`edit-${btn.dataset.id}`).classList.remove('open');
    });
  });

  // Save caption
  el.querySelectorAll('.save-caption-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const editEl  = document.getElementById(`edit-${btn.dataset.id}`);
      const caption = editEl.querySelector('.edit-caption-input').value.trim();
      btn.disabled  = true;

      const res = await fetch(`/api/${btn.dataset.wall}/${btn.dataset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caption }),
      });

      if (res.ok) {
        editEl.classList.remove('open');
        loadManage(btn.dataset.wall);
      }
      btn.disabled = false;
    });
  });

  // Delete photo
  el.querySelectorAll('.delete-photo-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this photo?')) return;
      await fetch(`/api/${btn.dataset.wall}/${btn.dataset.id}`, { method: 'DELETE' });
      loadManage(btn.dataset.wall);
    });
  });
}

function renderPostsManage(posts) {
  const el = document.getElementById('posts-list');
  el.innerHTML = '';

  if (!posts.length) {
    el.innerHTML = '<p style="font-family:\'DM Mono\',monospace;font-size:0.65rem;letter-spacing:0.2em;color:var(--muted);text-transform:uppercase;padding:1rem 0;">No posts yet</p>';
    return;
  }

  posts.forEach(post => {
    const div = document.createElement('div');
    div.className = 'post-manage-item';
    div.innerHTML = `
      <div class="post-manage-title">${escHtml(post.title)}</div>
      <div class="post-manage-meta">${new Date(post.createdAt).toLocaleDateString()}</div>
      <div class="post-manage-actions">
        <button class="btn btn-secondary edit-post-btn" data-id="${post.id}" style="padding:0.4rem 0.7rem;font-size:0.55rem">Edit</button>
        <button class="btn btn-danger delete-post-btn" data-id="${post.id}" style="padding:0.4rem 0.7rem;font-size:0.55rem">Delete</button>
      </div>
      <div class="edit-inline" id="edit-post-${post.id}">
        <input type="text" class="edit-post-title" value="${escAttr(post.title)}" placeholder="Title…" style="margin-bottom:0.5rem">
        <textarea class="edit-post-body" style="min-height:140px;margin-bottom:0.5rem">${escHtml(post.body)}</textarea>
        <div style="display:flex;gap:0.4rem">
          <button class="btn btn-primary save-post-btn" style="padding:0.4rem 0.7rem;font-size:0.55rem" data-id="${post.id}">Save</button>
          <button class="btn btn-secondary cancel-post-btn" style="padding:0.4rem 0.7rem;font-size:0.55rem" data-id="${post.id}">Cancel</button>
        </div>
      </div>
    `;
    el.appendChild(div);
  });

  el.querySelectorAll('.edit-post-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById(`edit-post-${btn.dataset.id}`).classList.toggle('open');
    });
  });

  el.querySelectorAll('.cancel-post-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById(`edit-post-${btn.dataset.id}`).classList.remove('open');
    });
  });

  el.querySelectorAll('.save-post-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const editEl = document.getElementById(`edit-post-${btn.dataset.id}`);
      const title  = editEl.querySelector('.edit-post-title').value.trim();
      const body   = editEl.querySelector('.edit-post-body').value.trim();
      btn.disabled = true;

      const res = await fetch(`/api/posts/${btn.dataset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body }),
      });

      if (res.ok) { editEl.classList.remove('open'); loadManage('posts'); }
      btn.disabled = false;
    });
  });

  el.querySelectorAll('.delete-post-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this post?')) return;
      await fetch(`/api/posts/${btn.dataset.id}`, { method: 'DELETE' });
      loadManage('posts');
    });
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function showFeedback(el, type, msg) {
  el.className = `feedback ${type}`;
  el.textContent = msg;
  setTimeout(() => { el.className = 'feedback'; }, 4000);
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escAttr(s) {
  return String(s).replace(/"/g, '&quot;');
}
