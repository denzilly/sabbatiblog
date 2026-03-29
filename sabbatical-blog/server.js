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
const PASSWORD = process.env.PASSWORD || 'sabbatical2026';
const SESSION_SECRET = process.env.SESSION_SECRET || 'fallback-secret-change-me';

// Hash password once at startup
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 10);

// Data file paths
const DATA = {
  photos: path.join(__dirname, 'data/photos.json'),
  prints: path.join(__dirname, 'data/prints.json'),
  posts:  path.join(__dirname, 'data/posts.json'),
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

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }, // 7 days
}));

// Auth middleware
function requireAuth(req, res, next) {
  if (req.session.authenticated) return next();
  res.redirect('/login');
}

// Static files (only accessible when authenticated)
app.use('/uploads', requireAuth, express.static(path.join(__dirname, 'uploads')));
app.use('/admin', requireAuth, express.static(path.join(__dirname, 'admin')));

// Login routes
app.get('/login', (req, res) => {
  if (req.session.authenticated) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public/login.html'));
});

app.post('/login', (req, res) => {
  const { password } = req.body;
  if (bcrypt.compareSync(password, PASSWORD_HASH)) {
    req.session.authenticated = true;
    res.redirect(req.query.next || '/');
  } else {
    res.redirect('/login?error=1');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// Protect all public pages
app.use(requireAuth);

// Serve public static files
app.use(express.static(path.join(__dirname, 'public')));

// ── API ──────────────────────────────────────────────────────────────────────

// GET photos
app.get('/api/photos', (req, res) => res.json(readData(DATA.photos)));
app.get('/api/prints', (req, res) => res.json(readData(DATA.prints)));
app.get('/api/posts',  (req, res) => res.json(readData(DATA.posts)));

// GET single post
app.get('/api/posts/:id', (req, res) => {
  const posts = readData(DATA.posts);
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Not found' });
  res.json(post);
});

// POST upload photo
app.post('/api/upload/:wall', upload.single('photo'), async (req, res) => {
  const wall = req.params.wall; // 'photos' or 'prints'
  if (!['photos', 'prints'].includes(wall)) return res.status(400).json({ error: 'Invalid wall' });

  const id = uuidv4();
  const ext = 'jpg';
  const filename = `${id}.${ext}`;
  const thumbname = `${id}_thumb.${ext}`;

  const uploadDir = path.join(__dirname, 'uploads', wall);
  const thumbDir  = path.join(__dirname, 'uploads', wall, 'thumbs');

  // Ensure directories exist
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.mkdirSync(thumbDir,  { recursive: true });

  try {
    // Save full-size (max 2000px wide, quality 85)
    await sharp(req.file.buffer)
      .rotate() // auto-rotate based on EXIF
      .resize({ width: 2000, withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toFile(path.join(uploadDir, filename));

    // Save thumbnail (800px wide, quality 80)
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
    data.unshift(entry); // newest first
    writeData(DATA[wall], data);

    res.json(entry);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// PATCH update caption
app.patch('/api/:wall/:id', (req, res) => {
  const { wall, id } = req.params;
  if (!['photos', 'prints'].includes(wall)) return res.status(400).json({ error: 'Invalid wall' });

  const data = readData(DATA[wall]);
  const item = data.find(x => x.id === id);
  if (!item) return res.status(404).json({ error: 'Not found' });

  if (req.body.caption !== undefined) item.caption = req.body.caption;
  writeData(DATA[wall], data);
  res.json(item);
});

// DELETE photo
app.delete('/api/:wall/:id', (req, res) => {
  const { wall, id } = req.params;
  if (!['photos', 'prints'].includes(wall)) return res.status(400).json({ error: 'Invalid wall' });

  const data = readData(DATA[wall]);
  const item = data.find(x => x.id === id);
  if (!item) return res.status(404).json({ error: 'Not found' });

  // Delete files
  const uploadDir = path.join(__dirname, 'uploads', wall);
  [path.join(uploadDir, item.filename), path.join(uploadDir, 'thumbs', item.thumb)].forEach(f => {
    try { fs.unlinkSync(f); } catch {}
  });

  writeData(DATA[wall], data.filter(x => x.id !== id));
  res.json({ ok: true });
});

// POST create blog post
app.post('/api/posts', (req, res) => {
  const { title, body } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'title and body required' });

  const post = { id: uuidv4(), title, body, createdAt: new Date().toISOString() };
  const posts = readData(DATA.posts);
  posts.unshift(post);
  writeData(DATA.posts, posts);
  res.json(post);
});

// PATCH update blog post
app.patch('/api/posts/:id', (req, res) => {
  const posts = readData(DATA.posts);
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Not found' });

  if (req.body.title !== undefined) post.title = req.body.title;
  if (req.body.body  !== undefined) post.body  = req.body.body;
  post.updatedAt = new Date().toISOString();
  writeData(DATA.posts, posts);
  res.json(post);
});

// DELETE blog post
app.delete('/api/posts/:id', (req, res) => {
  const posts = readData(DATA.posts);
  if (!posts.find(p => p.id === req.params.id)) return res.status(404).json({ error: 'Not found' });
  writeData(DATA.posts, posts.filter(p => p.id !== req.params.id));
  res.json({ ok: true });
});

// Fallback: serve index for unknown routes (so /blog, /prints etc. work as client-side nav)
app.get('/blog', (req, res) => res.sendFile(path.join(__dirname, 'public/blog.html')));
app.get('/prints', (req, res) => res.sendFile(path.join(__dirname, 'public/prints.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin/index.html')));

app.listen(PORT, () => console.log(`Sabbatical blog running at http://localhost:${PORT}`));
