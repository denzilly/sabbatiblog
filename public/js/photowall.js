function initPhotoWall({ wall, el }) {
  let photos = [];
  let current = 0;

  const lightbox = document.getElementById('lightbox');
  const lbImg    = document.getElementById('lb-img');
  const lbCap    = document.getElementById('lb-caption');
  const lbClose  = document.getElementById('lb-close');
  const lbPrev   = document.getElementById('lb-prev');
  const lbNext   = document.getElementById('lb-next');

  function openLightbox(index) {
    current = index;
    const p = photos[current];
    lbImg.src = `/uploads/${wall}/${p.filename}`;
    lbImg.alt = p.caption || '';
    lbCap.innerHTML = renderCaption(p.caption || '');
    lightbox.classList.add('open');
    document.body.style.overflow = 'hidden';
    lbImg.focus();
  }

  function closeLightbox() {
    lightbox.classList.remove('open');
    document.body.style.overflow = '';
  }

  function showPrev() {
    current = (current - 1 + photos.length) % photos.length;
    openLightbox(current);
  }

  function showNext() {
    current = (current + 1) % photos.length;
    openLightbox(current);
  }

  lbClose.addEventListener('click', closeLightbox);
  lbPrev.addEventListener('click', showPrev);
  lbNext.addEventListener('click', showNext);

  lightbox.addEventListener('click', e => {
    if (e.target === lightbox) closeLightbox();
  });

  let touchStartX = null;
  lightbox.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
  }, { passive: true });
  lightbox.addEventListener('touchend', e => {
    if (touchStartX === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX;
    touchStartX = null;
    if (Math.abs(delta) < 50) return;
    if (delta < 0) showNext();
    else showPrev();
  }, { passive: true });

  document.addEventListener('keydown', e => {
    if (!lightbox.classList.contains('open')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') showPrev();
    if (e.key === 'ArrowRight') showNext();
  });

  function render() {
    el.innerHTML = '';

    if (photos.length === 0) {
      el.innerHTML = '<div class="photo-wall-empty"><p>No photos yet</p></div>';
      return;
    }

    photos.forEach((photo, i) => {
      const div = document.createElement('div');
      div.className = 'photo-item';
      div.setAttribute('role', 'button');
      div.setAttribute('tabindex', '0');
      div.setAttribute('aria-label', photo.caption || `Photo ${i + 1}`);

      const img = document.createElement('img');
      img.src = `/uploads/${wall}/thumbs/${photo.thumb}`;
      img.alt = photo.caption || '';
      img.loading = 'lazy';
      img.decoding = 'async';

      div.appendChild(img);
      div.addEventListener('click', () => openLightbox(i));
      div.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') openLightbox(i); });
      el.appendChild(div);
    });
  }

  function renderCaption(text) {
    return text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+|\/[^)]*)\)/g,
        '<a href="$2" target="_blank" rel="noopener" style="color:inherit;text-underline-offset:3px">$1</a>');
  }

  fetch(`/api/${wall}`)
    .then(r => r.json())
    .then(data => { photos = data; render(); })
    .catch(() => { el.innerHTML = '<div class="photo-wall-empty"><p>Could not load photos</p></div>'; });
}
