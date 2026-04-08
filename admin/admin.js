// ── Tab switching ─────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    if (tab.dataset.tab === 'manage') loadManage('photos');
    if (tab.dataset.tab === 'files') loadFiles();
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

  let dragSrc = null;

  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'manage-item';
    div.draggable = true;
    div.dataset.id = item.id;
    div.innerHTML = `
      <div class="drag-handle" title="Drag to reorder">⠿</div>
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

    div.addEventListener('dragstart', e => {
      dragSrc = div;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => div.classList.add('dragging'), 0);
    });

    div.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (div !== dragSrc) div.classList.add('drag-over');
    });

    div.addEventListener('dragleave', () => div.classList.remove('drag-over'));

    div.addEventListener('drop', e => {
      e.preventDefault();
      div.classList.remove('drag-over');
      if (!dragSrc || dragSrc === div) return;
      const all = [...el.querySelectorAll('.manage-item')];
      const srcIdx = all.indexOf(dragSrc);
      const dstIdx = all.indexOf(div);
      el.insertBefore(dragSrc, srcIdx < dstIdx ? div.nextSibling : div);
      const newIds = [...el.querySelectorAll('.manage-item')].map(d => d.dataset.id);
      saveOrder(wall, newIds);
    });

    div.addEventListener('dragend', () => {
      div.classList.remove('dragging');
      el.querySelectorAll('.manage-item').forEach(d => d.classList.remove('drag-over'));
      dragSrc = null;
    });

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
        <div class="post-toolbar">
          <button type="button" class="toolbar-btn" data-action="bold"><strong>B</strong></button>
          <button type="button" class="toolbar-btn italic" data-action="italic">I</button>
          <button type="button" class="toolbar-btn" data-action="h2">H2</button>
          <button type="button" class="toolbar-btn" data-action="img">IMG</button>
          <input type="file" class="blog-img-input" accept="image/*" style="display:none">
        </div>
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

  // Wire toolbars for each edit inline
  el.querySelectorAll('.edit-inline').forEach(editEl => {
    const toolbar  = editEl.querySelector('.post-toolbar');
    const textarea = editEl.querySelector('.edit-post-body');
    if (toolbar && textarea) setupToolbar(toolbar, textarea);
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

// ── Post toolbar ──────────────────────────────────────────────────────────────
function setupToolbar(toolbarEl, textarea) {
  toolbarEl.querySelector('[data-action="bold"]').addEventListener('click', () => {
    wrapSelection(textarea, '**', '**');
  });
  toolbarEl.querySelector('[data-action="italic"]').addEventListener('click', () => {
    wrapSelection(textarea, '*', '*');
  });
  toolbarEl.querySelector('[data-action="h2"]').addEventListener('click', () => {
    prefixLine(textarea, '## ');
  });

  const imgBtn   = toolbarEl.querySelector('[data-action="img"]');
  const imgInput = toolbarEl.querySelector('.blog-img-input');

  imgBtn.addEventListener('click', () => imgInput.click());

  imgInput.addEventListener('change', async () => {
    const file = imgInput.files[0];
    if (!file) return;
    imgBtn.disabled = true;
    imgBtn.textContent = '…';

    const fd = new FormData();
    fd.append('photo', file);
    try {
      const res = await fetch('/api/upload/blog-image', { method: 'POST', body: fd });
      if (res.ok) {
        const { url } = await res.json();
        insertText(textarea, `\n![](${url})\n`);
      }
    } catch {}

    imgBtn.disabled  = false;
    imgBtn.textContent = 'IMG';
    imgInput.value   = '';
  });
}

function wrapSelection(textarea, before, after) {
  const start    = textarea.selectionStart;
  const end      = textarea.selectionEnd;
  const selected = textarea.value.substring(start, end);
  textarea.value = textarea.value.substring(0, start) + before + selected + after + textarea.value.substring(end);
  textarea.selectionStart = start + before.length;
  textarea.selectionEnd   = end   + before.length;
  textarea.focus();
}

function prefixLine(textarea, prefix) {
  const start     = textarea.selectionStart;
  const lineStart = textarea.value.lastIndexOf('\n', start - 1) + 1;
  if (textarea.value.substring(lineStart, lineStart + prefix.length) === prefix) {
    textarea.value = textarea.value.substring(0, lineStart) + textarea.value.substring(lineStart + prefix.length);
    textarea.selectionStart = textarea.selectionEnd = Math.max(lineStart, start - prefix.length);
  } else {
    textarea.value = textarea.value.substring(0, lineStart) + prefix + textarea.value.substring(lineStart);
    textarea.selectionStart = textarea.selectionEnd = start + prefix.length;
  }
  textarea.focus();
}

function insertText(textarea, text) {
  const start = textarea.selectionStart;
  textarea.value = textarea.value.substring(0, start) + text + textarea.value.substring(start);
  textarea.selectionStart = textarea.selectionEnd = start + text.length;
  textarea.focus();
}

// Wire up toolbar for the new-post panel
setupToolbar(document.getElementById('post-toolbar'), document.getElementById('post-body'));

// ── Helpers ───────────────────────────────────────────────────────────────────
async function saveOrder(wall, ids) {
  await fetch(`/api/reorder/${wall}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}

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

// ── Files tab ─────────────────────────────────────────────────────────────────
const fileFileInput  = document.getElementById('file-file-input');
const fileDropzone   = document.getElementById('file-dropzone');
const fileDropPrev   = document.getElementById('file-drop-preview');
const fileUploadBtn  = document.getElementById('file-upload-btn');
const fileUploadProg = document.getElementById('file-upload-progress');
const fileFeedback   = document.getElementById('file-feedback');

let selectedFileFiles = [];

fileFileInput.addEventListener('change', () => {
  selectedFileFiles = Array.from(fileFileInput.files);
  renderFilePreviews();
});

fileDropzone.addEventListener('dragover', e => { e.preventDefault(); fileDropzone.classList.add('drag-over'); });
fileDropzone.addEventListener('dragleave', () => fileDropzone.classList.remove('drag-over'));
fileDropzone.addEventListener('drop', e => {
  e.preventDefault();
  fileDropzone.classList.remove('drag-over');
  selectedFileFiles = Array.from(e.dataTransfer.files);
  renderFilePreviews();
});

function renderFilePreviews() {
  fileUploadBtn.disabled = selectedFileFiles.length === 0;
  fileDropPrev.textContent = selectedFileFiles.map(f => f.name).join(', ');
}

fileUploadBtn.addEventListener('click', async () => {
  if (!selectedFileFiles.length) return;
  fileUploadBtn.disabled = true;
  fileUploadProg.classList.add('active');
  fileFeedback.className = 'feedback';

  let succeeded = 0, failed = 0;

  for (const file of selectedFileFiles) {
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/upload/file', { method: 'POST', body: fd });
      if (res.ok) succeeded++;
      else failed++;
    } catch { failed++; }
    fileUploadProg.textContent = `Uploading… ${succeeded + failed} / ${selectedFileFiles.length}`;
  }

  fileUploadProg.classList.remove('active');
  fileUploadBtn.disabled = false;
  selectedFileFiles = [];
  fileFileInput.value = '';
  fileDropPrev.textContent = '';

  if (failed === 0) showFeedback(fileFeedback, 'success', `${succeeded} file${succeeded !== 1 ? 's' : ''} uploaded`);
  else showFeedback(fileFeedback, 'error', `${succeeded} uploaded, ${failed} failed`);

  loadFiles();
});

async function loadFiles() {
  const files = await fetch('/api/files').then(r => r.json()).catch(() => []);
  const el = document.getElementById('files-list');
  el.innerHTML = '';

  if (!files.length) {
    el.innerHTML = '<p style="font-family:\'DM Mono\',monospace;font-size:0.65rem;letter-spacing:0.2em;color:var(--muted);text-transform:uppercase;padding:1rem 0;">No files yet</p>';
    return;
  }

  files.forEach(file => {
    const div = document.createElement('div');
    div.className = 'manage-item';
    div.style.alignItems = 'center';
    div.innerHTML = `
      <div class="manage-info">
        <div class="manage-caption">${escHtml(file.name)}</div>
        <div class="manage-meta">${(file.size / 1024).toFixed(0)} KB · <span style="user-select:all;opacity:0.6">${escHtml(file.url)}</span></div>
      </div>
      <div class="manage-actions">
        <button class="btn btn-secondary copy-url-btn" data-url="${escAttr(file.url)}" style="padding:0.4rem 0.7rem;font-size:0.55rem">Copy URL</button>
        <button class="btn btn-danger delete-file-btn" data-name="${escAttr(file.name)}" style="padding:0.4rem 0.7rem;font-size:0.55rem">Del</button>
      </div>
    `;
    el.appendChild(div);
  });

  el.querySelectorAll('.copy-url-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.url);
      btn.textContent = 'Copied';
      setTimeout(() => { btn.textContent = 'Copy URL'; }, 2000);
    });
  });

  el.querySelectorAll('.delete-file-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Delete ${btn.dataset.name}?`)) return;
      await fetch(`/api/files/${encodeURIComponent(btn.dataset.name)}`, { method: 'DELETE' });
      loadFiles();
    });
  });
}
