const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Load env
require('fs').existsSync('.env') && require('fs').readFileSync('.env', 'utf8').split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) process.env[k.trim()] = v.join('=').trim();
});

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'fallback-secret-change-me';

// Three-tier passwords
const PASSWORDS = {
  photos: process.env.PHOTOS_PASSWORD || 'photos2026',
  blog:   process.env.BLOG_PASSWORD   || 'blog2026',
  admin:  process.env.ADMIN_PASSWORD  || 'admin2026',
};
const HASHES = {
  photos: bcrypt.hashSync(PASSWORDS.photos, 10),
  blog:   bcrypt.hashSync(PASSWORDS.blog,   10),
  admin:  bcrypt.hashSync(PASSWORDS.admin,  10),
};

// Data file paths (inside uploads so one persistent volume covers both)
const DATA_DIR = path.join(__dirname, 'uploads/data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DATA = {
  photos: path.join(DATA_DIR, 'photos.json'),
  prints: path.join(DATA_DIR, 'prints.json'),
  posts:  path.join(DATA_DIR, 'posts.json'),
};

function readData(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; }
}
function writeData(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Multer: store uploads in memory, then process with Sharp
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'));
  },
});

// Multer: for arbitrary files (STL, 3MF, OBJ, etc.)
const uploadFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }, // 7 days
}));

// ── Auth middleware ───────────────────────────────────────────────────────────

const ROLE_LEVEL = { photos: 1, blog: 2, admin: 3 };

function requireRole(minRole) {
  return (req, res, next) => {
    const level = ROLE_LEVEL[req.session.role] || 0;
    if (level >= ROLE_LEVEL[minRole]) return next();
    res.redirect('/login');
  };
}

const requirePhotos = requireRole('photos');
const requireBlog   = requireRole('blog');
const requireAdmin  = requireRole('admin');

// ── Login / logout ────────────────────────────────────────────────────────────

app.get('/login', (req, res) => {
  if (req.session.role) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public/login.html'));
});

app.post('/login', (req, res) => {
  const { password } = req.body;
  let role = null;
  for (const [r, hash] of Object.entries(HASHES)) {
    if (bcrypt.compareSync(password, hash)) { role = r; break; }
  }
  if (role) {
    req.session.role = role;
    res.redirect(req.query.next || '/');
  } else {
    res.redirect('/login?error=1');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// ── Protected static files ────────────────────────────────────────────────────

// Blog images (requireBlog) must be before the broader /uploads handler
app.use('/uploads/blog', requireBlog,   express.static(path.join(__dirname, 'uploads/blog')));
app.use('/uploads',      requirePhotos, express.static(path.join(__dirname, 'uploads')));
app.use('/admin',        requireAdmin,  express.static(path.join(__dirname, 'admin')));

// ── Page routes ───────────────────────────────────────────────────────────────

app.get('/blog',   requireBlog,   (req, res) => res.sendFile(path.join(__dirname, 'public/blog.html')));
app.get('/prints', requirePhotos, (req, res) => res.sendFile(path.join(__dirname, 'public/prints.html')));
app.get('/admin',  requireAdmin,  (req, res) => res.sendFile(path.join(__dirname, 'admin/index.html')));

// All remaining routes require at least photos-tier auth
app.use(requirePhotos);

// Serve public static files (index.html, CSS, JS, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// ── API ───────────────────────────────────────────────────────────────────────

// Photos-tier read access
app.get('/api/photos', (req, res) => res.json(readData(DATA.photos)));
app.get('/api/prints', (req, res) => res.json(readData(DATA.prints)));

// Blog-tier read access
app.get('/api/posts',     requireBlog, (req, res) => res.json(readData(DATA.posts)));
app.get('/api/posts/:id', requireBlog, (req, res) => {
  const posts = readData(DATA.posts);
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Not found' });
  res.json(post);
});

// Admin-only write access

// POST upload blog image
app.post('/api/upload/blog-image', requireAdmin, upload.single('photo'), async (req, res) => {
  const id = uuidv4();
  const filename = `${id}.jpg`;
  const uploadDir = path.join(__dirname, 'uploads', 'blog');
  fs.mkdirSync(uploadDir, { recursive: true });

  try {
    await sharp(req.file.buffer)
      .rotate()
      .resize({ width: 1200, withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toFile(path.join(uploadDir, filename));
    res.json({ url: `/uploads/blog/${filename}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// POST upload photo to wall
app.post('/api/upload/:wall', requireAdmin, upload.single('photo'), async (req, res) => {
  const wall = req.params.wall;
  if (!['photos', 'prints'].includes(wall)) return res.status(400).json({ error: 'Invalid wall' });

  const id = uuidv4();
  const ext = 'jpg';
  const filename = `${id}.${ext}`;
  const thumbname = `${id}_thumb.${ext}`;

  const uploadDir = path.join(__dirname, 'uploads', wall);
  const thumbDir  = path.join(__dirname, 'uploads', wall, 'thumbs');

  fs.mkdirSync(uploadDir, { recursive: true });
  fs.mkdirSync(thumbDir,  { recursive: true });

  try {
    await sharp(req.file.buffer)
      .rotate()
      .resize({ width: 2000, withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toFile(path.join(uploadDir, filename));

    await sharp(req.file.buffer)
      .rotate()
      .resize({ width: 800, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(path.join(thumbDir, thumbname));

    const entry = {
      id,
      filename,
      thumb: thumbname,
      caption: req.body.caption || '',
      uploadedAt: new Date().toISOString(),
    };

    const data = readData(DATA[wall]);
    data.unshift(entry);
    writeData(DATA[wall], data);

    res.json(entry);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// POST create blog post
app.post('/api/posts', requireAdmin, (req, res) => {
  const { title, body } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'title and body required' });

  const post = { id: uuidv4(), title, body, createdAt: new Date().toISOString() };
  const posts = readData(DATA.posts);
  posts.unshift(post);
  writeData(DATA.posts, posts);
  res.json(post);
});

// PATCH update blog post  (must come before generic /api/:wall/:id)
app.patch('/api/posts/:id', requireAdmin, (req, res) => {
  const posts = readData(DATA.posts);
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Not found' });

  if (req.body.title !== undefined) post.title = req.body.title;
  if (req.body.body  !== undefined) post.body  = req.body.body;
  post.updatedAt = new Date().toISOString();
  writeData(DATA.posts, posts);
  res.json(post);
});

// DELETE blog post  (must come before generic /api/:wall/:id)
app.delete('/api/posts/:id', requireAdmin, (req, res) => {
  const posts = readData(DATA.posts);
  if (!posts.find(p => p.id === req.params.id)) return res.status(404).json({ error: 'Not found' });
  writeData(DATA.posts, posts.filter(p => p.id !== req.params.id));
  res.json({ ok: true });
});

// PUT reorder photos
app.put('/api/reorder/:wall', requireAdmin, (req, res) => {
  const { wall } = req.params;
  if (!['photos', 'prints'].includes(wall)) return res.status(400).json({ error: 'Invalid wall' });

  const ids = req.body.ids;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids must be an array' });

  const data = readData(DATA[wall]);
  const reordered = ids.map(id => data.find(x => x.id === id)).filter(Boolean);
  data.forEach(x => { if (!ids.includes(x.id)) reordered.push(x); });

  writeData(DATA[wall], reordered);
  res.json({ ok: true });
});

// PATCH update photo caption  (generic — must come after /api/posts/:id)
app.patch('/api/:wall/:id', requireAdmin, (req, res) => {
  const { wall, id } = req.params;
  if (!['photos', 'prints'].includes(wall)) return res.status(400).json({ error: 'Invalid wall' });

  const data = readData(DATA[wall]);
  const item = data.find(x => x.id === id);
  if (!item) return res.status(404).json({ error: 'Not found' });

  if (req.body.caption !== undefined) item.caption = req.body.caption;
  writeData(DATA[wall], data);
  res.json(item);
});

// DELETE photo  (generic — must come after /api/posts/:id)
app.delete('/api/:wall/:id', requireAdmin, (req, res) => {
  const { wall, id } = req.params;
  if (!['photos', 'prints'].includes(wall)) return res.status(400).json({ error: 'Invalid wall' });

  const data = readData(DATA[wall]);
  const item = data.find(x => x.id === id);
  if (!item) return res.status(404).json({ error: 'Not found' });

  const uploadDir = path.join(__dirname, 'uploads', wall);
  [path.join(uploadDir, item.filename), path.join(uploadDir, 'thumbs', item.thumb)].forEach(f => {
    try { fs.unlinkSync(f); } catch {}
  });

  writeData(DATA[wall], data.filter(x => x.id !== id));
  res.json({ ok: true });
});

// GET list uploaded files (admin only)
app.get('/api/files', requireAdmin, (req, res) => {
  const dir = path.join(__dirname, 'uploads/files');
  fs.mkdirSync(dir, { recursive: true });
  const files = fs.readdirSync(dir).map(name => ({
    name,
    url: `/uploads/files/${name}`,
    size: fs.statSync(path.join(dir, name)).size,
  }));
  res.json(files);
});

// POST upload arbitrary file (admin only)
app.post('/api/upload/file', requireAdmin, uploadFile.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });

  const ext = path.extname(req.file.originalname).toLowerCase();
  const filename = `${uuidv4()}${ext}`;
  const dir = path.join(__dirname, 'uploads/files');
  fs.mkdirSync(dir, { recursive: true });

  try {
    fs.writeFileSync(path.join(dir, filename), req.file.buffer);
    res.json({ url: `/uploads/files/${filename}`, name: req.file.originalname, filename });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// DELETE uploaded file (admin only)
app.delete('/api/files/:filename', requireAdmin, (req, res) => {
  const filename = path.basename(req.params.filename); // prevent path traversal
  const filepath = path.join(__dirname, 'uploads/files', filename);
  try { fs.unlinkSync(filepath); } catch {}
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`Sabbatical blog running at http://localhost:${PORT}`));
