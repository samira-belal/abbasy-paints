/* Al-Abbasy Paints — page interactions. Plain JS, no dependencies, works from file://. */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const root = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const noWebGL = () => root.classList.contains('no-webgl') || !window.PaintFluid;
  const T0 = performance.now();

  const WA = { nasr: '201005645742', tagamoa: '201098559118' };
  const PALETTE = [
    ['#D7232F', 'أحمر'], ['#F28C28', 'برتقالي'], ['#FDC218', 'أصفر'], ['#B5CC2E', 'ليموني'],
    ['#3E9B47', 'أخضر'], ['#43B6D9', 'سماوي'], ['#1D5A96', 'كحلي'], ['#7B3FBF', 'بنفسجي'],
    ['#F4F1EA', 'أبيض'], ['#15161A', 'أسود'], ['#B9BEC6', 'فضي'], ['#D8C3A0', 'بيج'],
  ];

  /* ---------------- preloader ---------------- */
  const loader = $('#loader');
  function hideLoader() {
    if (!loader || loader.classList.contains('done')) return;
    loader.classList.add('done');
    setTimeout(() => loader.remove(), 700);
    if (window.PaintFluid && !reduced) setTimeout(() => window.PaintFluid.random(5), 150);
  }
  setTimeout(hideLoader, Math.max(250, 1150 - (performance.now() - T0)));

  /* ---------------- year / small text ---------------- */
  const yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
  const hint = $('.hint-text');
  if (hint) {
    if (!finePointer) hint.textContent = 'المس الشاشة وارسم بالألوان';
    if (noWebGL()) hint.textContent = finePointer ? 'حرّك الماوس والألوان هتمشي وراك' : 'كل الألوان اللي بتحلم بيها';
  }

  /* ---------------- nav ---------------- */
  const nav = $('#nav'), burger = $('#burger');
  const onScrollNav = () => nav.classList.toggle('scrolled', window.scrollY > 30);
  onScrollNav();
  window.addEventListener('scroll', onScrollNav, { passive: true });
  burger.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    burger.setAttribute('aria-expanded', open);
    burger.setAttribute('aria-label', open ? 'إغلاق القائمة' : 'فتح القائمة');
  });
  $$('#links a').forEach(a => a.addEventListener('click', () => {
    nav.classList.remove('open'); burger.setAttribute('aria-expanded', 'false');
  }));
  if ('IntersectionObserver' in window) {
    const linkFor = id => $(`#links a[href="#${id}"]`);
    const spy = new IntersectionObserver(entries => {
      entries.forEach(e => {
        const l = linkFor(e.target.id);
        if (l && e.isIntersecting) { $$('#links a.active').forEach(x => x.classList.remove('active')); l.classList.add('active'); }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    ['prima', 'about', 'worlds', 'lab', 'products', 'gallery', 'branches'].forEach(id => { const s = document.getElementById(id); if (s) spy.observe(s); });
  }

  /* ---------------- reveal on scroll + counters ---------------- */
  function countUp(el) {
    if (el.dataset.done) return;
    el.dataset.done = '1';
    let to = el.dataset.count;
    if (to === 'years') to = new Date().getFullYear() - 1999;
    else if (to === 'products') to = productTotal;
    to = +to;
    if (!isFinite(to)) return;
    const from = el.dataset.from ? +el.dataset.from : 0;
    const prefix = el.dataset.prefix || '';
    if (reduced) { el.textContent = prefix + to; return; }
    const dur = 1600, start = performance.now();
    (function tick(now) {
      const t = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - t, 4);
      el.textContent = prefix + Math.round(from + (to - from) * e);
      if (t < 1) requestAnimationFrame(tick);
    })(start);
  }
  const reveals = $$('.reveal');
  if ('IntersectionObserver' in window && !reduced) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        $$('[data-count]', e.target).forEach(countUp);
        io.unobserve(e.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    reveals.forEach(el => io.observe(el));
  } else {
    reveals.forEach(el => el.classList.add('in'));
    setTimeout(() => $$('[data-count]').forEach(countUp), 50);
  }

  /* ---------------- custom cursor + no-webgl follower blob ---------------- */
  const mouse = { x: innerWidth / 2, y: innerHeight / 2 };
  const cursor = $('.cursor'), dot = $('.cursor-dot'), ring = $('.cursor-ring');
  const follower = $('.blobs .bf');
  const ringPos = { x: mouse.x, y: mouse.y }, folPos = { x: mouse.x, y: mouse.y };
  let pointerSeen = false;
  window.addEventListener('pointermove', e => {
    mouse.x = e.clientX; mouse.y = e.clientY; pointerSeen = true;
    if (cursor) cursor.classList.remove('idle');
  }, { passive: true });
  document.addEventListener('mouseleave', () => cursor && cursor.classList.add('idle'));
  if (cursor && finePointer) {
    document.addEventListener('mouseover', e => {
      cursor.classList.toggle('hover', !!e.target.closest('a,button,input,label,[data-tilt],.pcard,.shot,.blob'));
    });
  }
  (function cursorLoop() {
    if (finePointer && dot) {
      dot.style.transform = `translate(${mouse.x}px, ${mouse.y}px)`;
      ringPos.x += (mouse.x - ringPos.x) * 0.18; ringPos.y += (mouse.y - ringPos.y) * 0.18;
      ring.style.transform = `translate(${ringPos.x}px, ${ringPos.y}px)`;
    }
    if (follower && root.classList.contains('no-webgl')) {
      const tx = pointerSeen ? mouse.x : innerWidth * (0.5 + 0.3 * Math.sin(performance.now() / 2600));
      const ty = pointerSeen ? mouse.y : innerHeight * (0.45 + 0.2 * Math.cos(performance.now() / 3100));
      folPos.x += (tx - folPos.x) * 0.06; folPos.y += (ty - folPos.y) * 0.06;
      follower.style.left = folPos.x + 'px'; follower.style.top = folPos.y + 'px';
    }
    requestAnimationFrame(cursorLoop);
  })();

  /* ---------------- parallax ---------------- */
  const parallaxEls = $$('[data-parallax]');
  let pTick = false;
  function parallax() {
    pTick = false;
    parallaxEls.forEach(el => {
      const r = el.parentElement.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return;
      const off = (r.top + r.height / 2 - innerHeight / 2) * -(+el.dataset.parallax || 0.1);
      el.style.transform = `translate3d(0, ${off.toFixed(1)}px, 0)`;
    });
  }
  if (!reduced && parallaxEls.length) {
    window.addEventListener('scroll', () => { if (!pTick) { pTick = true; requestAnimationFrame(parallax); } }, { passive: true });
    parallax();
  }

  /* ---------------- 3D tilt (delegated) ---------------- */
  if (finePointer && !reduced) {
    let tiltEl = null;
    const reset = el => { el.style.transform = ''; el.style.transition = 'transform .6s cubic-bezier(.2,.7,.2,1)'; };
    document.addEventListener('pointermove', e => {
      const el = e.target.closest('[data-tilt], .pcard');
      if (tiltEl && tiltEl !== el) reset(tiltEl);
      tiltEl = el;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      const max = el.classList.contains('pcard') ? 10 : 7;
      el.style.transition = 'transform .12s linear';
      el.style.transform = `perspective(900px) rotateX(${((0.5 - py) * max).toFixed(2)}deg) rotateY(${((px - 0.5) * max).toFixed(2)}deg) translateZ(0)`;
      el.style.setProperty('--gx', (px * 100).toFixed(1) + '%');
      el.style.setProperty('--gy', (py * 100).toFixed(1) + '%');
    }, { passive: true });
    document.addEventListener('pointerleave', () => { if (tiltEl) reset(tiltEl); tiltEl = null; });
  }

  /* ---------------- colour helpers ---------------- */
  function hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0), f(8), f(4)].map(v => Math.round(v * 255));
  }
  function hexToRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0; const l = (max + min) / 2;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    if (d) {
      if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
  }
  const toHex = rgb => '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();

  /* nearest RAL Classic shade, by CIELAB distance */
  function rgbToLab(rgb) {
    const [x, y, z] = (() => {
      const [r, g, b] = rgb.map(v => { v /= 255; return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92; });
      return [(r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047, r * 0.2126 + g * 0.7152 + b * 0.0722, (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883];
    })();
    const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
  }
  const RAL = (window.RAL_CLASSIC || []).map(([code, hex, name]) => ({ code, hex, name, lab: rgbToLab(hexToRgb(hex)) }));
  function nearestRal(rgb) {
    if (!RAL.length) return null;
    const L = rgbToLab(rgb);
    let best = null, bd = Infinity;
    for (const r of RAL) {
      const d = (L[0] - r.lab[0]) ** 2 + (L[1] - r.lab[1]) ** 2 + (L[2] - r.lab[2]) ** 2;
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }

  /* CSS-only splash when WebGL is unavailable */
  function cssSplash(x, y, color) {
    if (reduced) return;
    for (let i = 0; i < 3; i++) {
      const s = document.createElement('div');
      s.className = 'css-splash';
      s.style.left = (x + (Math.random() - 0.5) * 60) + 'px';
      s.style.top = (y + (Math.random() - 0.5) * 60) + 'px';
      s.style.background = color;
      s.style.animationDelay = (i * 0.09) + 's';
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 1500);
    }
  }
  function splashAt(x, y, rgb255) {
    if (window.PaintFluid && !root.classList.contains('no-webgl')) {
      window.PaintFluid.burst(x, y, rgb255.map(v => Math.max(0.04, v / 255)));
    } else {
      cssSplash(x, y, toHex(rgb255));
      if (follower) follower.style.background = toHex(rgb255);
    }
  }

  /* ---------------- colour lab ---------------- */
  const hue = $('#hue'), sat = $('#sat'), lit = $('#lit');
  const blobPath = $('#blobPath'), glowPath = $('#blobGlowPath'), shinePath = $('#blobShinePath');
  const stops = [$('#bs0'), $('#bs1'), $('#bs2')];
  const ralOut = $('#ralOut'), ralName = $('#ralName');
  const hexOut = $('#hexOut'), rgbOut = $('#rgbOut'), ask = $('#askColor'), splashBtn = $('#splash');
  let labRgb = [215, 35, 47];

  function updateLab() {
    const h = +hue.value, s = +sat.value, l = +lit.value;
    labRgb = hslToRgb(h, s, l);
    const hex = toHex(labRgb);
    stops[0].setAttribute('stop-color', `hsl(${h} ${s}% ${Math.min(95, l + 22)}%)`);
    stops[1].setAttribute('stop-color', `hsl(${h} ${s}% ${l}%)`);
    stops[2].setAttribute('stop-color', `hsl(${h} ${Math.min(100, s + 8)}% ${Math.max(4, l - 24)}%)`);
    hexOut.textContent = hex;
    rgbOut.textContent = `RGB ${labRgb.join(', ')}`;
    const ral = nearestRal(labRgb);
    if (ralOut) {
      ralOut.textContent = ral ? `RAL ${ral.code}` : '';
      ralOut.title = ral ? ral.name : '';
      ralOut.style.setProperty('--ral', ral ? ral.hex : 'transparent');
    }
    if (ralName) ralName.textContent = ral ? ral.name : '';
    root.style.setProperty('--lab', hex);
    const lum = (0.299 * labRgb[0] + 0.587 * labRgb[1] + 0.114 * labRgb[2]) / 255;
    root.style.setProperty('--lab-ink', lum > 0.55 ? '#10121f' : '#ffffff');
    sat.style.setProperty('--track', `linear-gradient(to left, hsl(${h} 0% ${l}%), hsl(${h} 100% ${l}%))`);
    lit.style.setProperty('--track', `linear-gradient(to left, hsl(${h} ${s}% 8%), hsl(${h} ${s}% 50%), hsl(${h} ${s}% 92%))`);
    ask.dataset.waText = ral ? `أهلاً، عايز اللون ده: RAL ${ral.code} (${ral.name}) — ${hex}` : `أهلاً، عايز اللون ده: ${hex}`;
    $$('.swatch').forEach(b => b.setAttribute('aria-pressed', b.dataset.hex === hex ? 'true' : 'false'));
  }
  const swWrap = $('#swatches');
  PALETTE.forEach(([hex, name]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'swatch'; b.dataset.hex = hex; b.title = name;
    b.setAttribute('aria-label', name); b.setAttribute('role', 'listitem');
    b.style.setProperty('--s', hex);
    b.addEventListener('click', () => {
      const [h, s, l] = rgbToHsl(...hexToRgb(hex));
      hue.value = h; sat.value = s; lit.value = Math.max(8, Math.min(92, l));
      updateLab();
      const r = b.getBoundingClientRect();
      splashAt(r.left + r.width / 2, r.top + r.height / 2, hexToRgb(hex));
    });
    swWrap.appendChild(b);
  });
  [hue, sat, lit].forEach(i => i.addEventListener('input', updateLab));
  updateLab();

  function splashFromBlob() {
    const r = $('#blob').getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    splashAt(cx, cy, labRgb);
    if (!reduced) setTimeout(() => splashAt(cx + (Math.random() - 0.5) * r.width * 0.6, cy + (Math.random() - 0.5) * r.height * 0.6, labRgb), 160);
  }
  splashBtn.addEventListener('click', splashFromBlob);
  $('#blob').addEventListener('click', splashFromBlob);

  // morphing liquid blob
  const N = 9, phases = Array.from({ length: N }, () => [Math.random() * 6.28, Math.random() * 6.28, 0.6 + Math.random() * 0.8]);
  function blobD(t, cx, cy, R, amp) {
    const pts = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2, p = phases[i];
      const r = R + amp * (Math.sin(t * p[2] + p[0]) * 0.6 + Math.sin(t * 0.7 * p[2] + p[1]) * 0.4);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < N; i++) {
      const p0 = pts[(i - 1 + N) % N], p1 = pts[i], p2 = pts[(i + 1) % N], p3 = pts[(i + 2) % N];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d + 'Z';
  }
  let labVisible = false;
  function drawBlob(now) {
    const t = now / 1000;
    const d = blobD(t, 200, 200, 138, 22);
    blobPath.setAttribute('d', d);
    glowPath.setAttribute('d', d);
    shinePath.setAttribute('d', blobD(t * 1.3 + 4, 165, 150, 46, 9));
    if (labVisible && !reduced) requestAnimationFrame(drawBlob);
  }
  drawBlob(0);
  if ('IntersectionObserver' in window && !reduced) {
    new IntersectionObserver(([e]) => {
      const was = labVisible; labVisible = e.isIntersecting;
      if (labVisible && !was) requestAnimationFrame(drawBlob);
    }).observe($('#lab'));
  }

  /* ---------------- WhatsApp branch chooser ---------------- */
  const chooser = $('#waChooser');
  let chooserOpener = null;
  function openChooser(opener) {
    const text = opener.dataset.waText || '';
    $$('a[data-num]', chooser).forEach(a => {
      a.href = `https://wa.me/${a.dataset.num}` + (text ? `?text=${encodeURIComponent(text)}` : '');
    });
    chooser.classList.toggle('centered', !opener.classList.contains('wa-float'));
    chooser.hidden = false; chooserOpener = opener;
    $('a', chooser).focus({ preventScroll: true });
  }
  function closeChooser() { if (!chooser.hidden) { chooser.hidden = true; if (chooserOpener) chooserOpener.focus({ preventScroll: true }); chooserOpener = null; } }
  document.addEventListener('click', e => {
    const opener = e.target.closest('[data-wa]');
    if (opener) { e.preventDefault(); if (!chooser.hidden && chooserOpener === opener) closeChooser(); else openChooser(opener); return; }
    if (!chooser.hidden && !e.target.closest('#waChooser')) closeChooser();
    if (e.target.closest('#waChooser a')) setTimeout(closeChooser, 50);
  });

  /* ---------------- products ---------------- */
  const GROUPS = {
    car: { ar: 'دهانات السيارات', c: '#D7232F' },
    building: { ar: 'دهانات المباني', c: '#9A63E0' },
    wood: { ar: 'دهانات الأخشاب', c: '#F28C28' },
    industrial: { ar: 'دهانات صناعية', c: '#43B6D9' },
  };
  const EXTRA_COLORS = ['#B5CC2E', '#3E9B47', '#FDC218', '#1D5A96'];
  const DATA = window.PRODUCTS && Array.isArray(window.PRODUCTS.categories) ? window.PRODUCTS : null;
  const grid = $('#prodGrid'), tabs = $('#groupTabs'), chips = $('#catChips'), search = $('#prodSearch');
  const countEl = $('#prodCount'), moreBtn = $('#prodMore');
  const PAGE = 24;
  let productTotal = 0;
  const state = { group: 'all', cat: null, q: '', shown: PAGE };
  const PRIMA_FIRST = ['8700', '8600'];
  const primaRank = it => { const i = PRIMA_FIRST.indexOf(String(it.code)); return i < 0 ? 99 : i; };
  const primaOrder = (a, b) => primaRank(a) - primaRank(b) || a._idx - b._idx;
  const isPrima = p => String(p.line || '').trim().toLowerCase() === 'prima';

  const norm = s => String(s || '').toLowerCase()
    .replace(/[ً-ْـ]/g, '').replace(/[أإآا]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim();
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function imgSrc(p) {
    if (!p) return '';
    p = String(p).replace(/\\/g, '/');
    if (/^(https?:|data:|assets\/|\.{1,2}\/|\/)/.test(p)) return p;
    if (/^(p|products)\//.test(p)) return 'assets/' + p;
    if (p.includes('/')) return p;
    return 'assets/p/' + p;
  }
  function groupInfo(g, i) {
    if (GROUPS[g]) return GROUPS[g];
    GROUPS[g] = { ar: g, c: EXTRA_COLORS[i % EXTRA_COLORS.length] };
    return GROUPS[g];
  }

  let items = [], cats = [], groupOrder = [];
  if (DATA) {
    DATA.categories.forEach((cat, ci) => {
      if (!cat || !Array.isArray(cat.products)) return;
      const g = cat.group || 'other';
      if (!groupOrder.includes(g)) groupOrder.push(g);
      const gi = groupInfo(g, groupOrder.length);
      if (!GROUPS[g].label && g === 'other') GROUPS[g].ar = 'منتجات أخرى';
      const catId = cat.id != null ? String(cat.id) : 'c' + ci;
      cats.push({ id: catId, group: g, ar: cat.ar || cat.en || catId, en: cat.en || '', count: cat.products.length });
      cat.products.forEach(p => {
        if (!p) return;
        items.push({
          code: p.code || '', ar: p.ar || p.en || p.code || '', desc: p.desc || '', img: imgSrc(p.img),
          group: g, cat: catId, catAr: cat.ar || cat.en || '', color: gi.c, line: p.line || '', prima: isPrima(p),
          key: norm([p.code, p.ar, p.en, p.desc, cat.ar, cat.en].join(' ')),
        });
      });
    });
    const known = ['car', 'building', 'wood', 'industrial'];
    groupOrder.sort((a, b) => (known.indexOf(a) + 1 || 99) - (known.indexOf(b) + 1 || 99));
    productTotal = items.length;
    if (items.some(it => it.prima)) state.group = 'prima';
  }

  function filtered() {
    const q = norm(state.q);
    const words = q ? q.split(' ') : [];
    const list = items.filter(it =>
      (state.group === 'all' || (state.group === 'prima' ? it.prima : it.group === state.group)) &&
      (!state.cat || it.cat === state.cat) &&
      words.every(w => it.key.includes(w)));
    return state.group === 'prima' ? list.sort(primaOrder) : list;
  }
  function renderTabs() {
    const all = (items.some(it => it.prima) ? [['prima', 'بريما ✦ الأحدث', '#FDC218']] : [])
      .concat([['all', 'الكل', '#ffffff']], groupOrder.map(g => [g, GROUPS[g].ar, GROUPS[g].c]));
    tabs.innerHTML = all.map(([g, label, c]) =>
      `<button class="tab" role="tab" type="button" data-group="${esc(g)}" aria-selected="${state.group === g}" style="--tc:${c}">${esc(label)}</button>`).join('');
  }
  function renderChips() {
    if (state.group === 'all' || state.group === 'prima') { chips.innerHTML = ''; return; }
    const list = cats.filter(c => c.group === state.group);
    if (list.length < 2) { chips.innerHTML = ''; return; }
    chips.innerHTML = list.map(c =>
      `<button class="chip" type="button" data-cat="${esc(c.id)}" aria-pressed="${state.cat === c.id}">${esc(c.ar)}</button>`).join('');
  }
  function cardHTML(it, i) {
    const img = it.img
      ? `<img src="${esc(it.img)}" alt="${esc(it.ar)}" loading="lazy" decoding="async">`
      : '<span class="ph"></span>';
    return `<article class="pcard" tabindex="0" role="button" data-i="${it._idx}" style="--gc:${it.color};--i:${(Math.min(i, 12) * 0.035).toFixed(3)}s" aria-label="${esc(it.ar)} ${esc(it.code)}">
      <div class="pcard-img">${img}</div>
      <div class="pcard-body">${it.code ? `<span class="pcard-code">${esc(it.code)}</span>` : ''}<h3>${esc(it.ar)}</h3><p>${esc(it.desc)}</p></div>
      <span class="glare"></span></article>`;
  }
  items.forEach((it, i) => { it._idx = i; });
  function renderGrid(append) {
    const list = filtered();
    const from = append ? grid.children.length : 0;
    const slice = list.slice(from, state.shown);
    if (!append) grid.innerHTML = '';
    if (!list.length) {
      grid.innerHTML = `<div class="prod-empty glass"><h3 class="title">مش لاقيين <span class="grad">"${esc(state.q)}"</span></h3><p class="lead" style="margin-inline:auto">جرّب كلمة تانية أو كود المنتج.. أو ابعتلنا على واتساب وإحنا نوصلّك للمنتج.</p></div>`;
    } else {
      grid.insertAdjacentHTML('beforeend', slice.map(cardHTML).join(''));
    }
    countEl.textContent = list.length ? `عرض ${Math.min(state.shown, list.length)} من ${list.length} منتج` : '';
    moreBtn.hidden = state.shown >= list.length;
  }
  function refresh() { state.shown = PAGE; renderTabs(); renderChips(); renderGrid(false); }

  if (!DATA || !items.length) {
    $('.prod-tools').hidden = true;
    grid.innerHTML = `<div class="prod-empty glass"><h3 class="title">كل منتجات <span class="grad">كابسي</span> متوفرة عندنا</h3>
      <p class="lead" style="margin-inline:auto">كتالوج المنتجات بيتجهّز حالياً. لحد ما يخلص، اسألنا عن أي منتج أو كود على واتساب أو تليفون وإحنا نرد عليك.</p>
      <div class="hero-cta"><a class="btn btn-paint" data-wa href="https://wa.me/${WA.nasr}" target="_blank" rel="noopener"><span>اسأل على واتساب</span></a>
      <a class="btn btn-ghost" href="tel:+20224090094"><span>اتصل بينا</span></a></div></div>`;
  } else {
    const ps = $('.stat-products');
    if (ps) ps.hidden = false;
    refresh();
    tabs.addEventListener('click', e => {
      const b = e.target.closest('.tab'); if (!b) return;
      state.group = b.dataset.group; state.cat = null; refresh();
    });
    chips.addEventListener('click', e => {
      const b = e.target.closest('.chip'); if (!b) return;
      state.cat = state.cat === b.dataset.cat ? null : b.dataset.cat; state.shown = PAGE; renderChips(); renderGrid(false);
    });
    let st;
    search.addEventListener('input', () => {
      clearTimeout(st);
      st = setTimeout(() => { state.q = search.value; state.shown = PAGE; renderGrid(false); }, 140);
    });
    moreBtn.addEventListener('click', () => { state.shown += PAGE; renderGrid(true); });
    grid.addEventListener('click', e => { const c = e.target.closest('.pcard'); if (c) openProduct(items[+c.dataset.i]); });
    grid.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('pcard')) { e.preventDefault(); openProduct(items[+e.target.dataset.i]); }
    });
    // images that fail -> painted placeholder tin
    grid.addEventListener('error', e => {
      if (e.target.tagName === 'IMG') { const ph = document.createElement('span'); ph.className = 'ph'; e.target.replaceWith(ph); }
    }, true);
  }

  // PRIMA showcase (products whose line is Prima)
  const primaItems = items.filter(it => it.prima).sort(primaOrder);
  if (primaItems.length) {
    const show = $('#primaShow');
    show.innerHTML = primaItems.map((it, i) => `<button class="pshow" type="button" data-i="${it._idx}" style="--fd:${(-i * 0.7).toFixed(1)}s">
      ${it.img ? `<img src="${esc(it.img)}" alt="${esc(it.ar)}" loading="lazy" decoding="async">` : ''}
      ${it.code ? `<b>${esc(it.code)}</b>` : ''}<span>${esc(it.ar)}</span></button>`).join('');
    $('#primaShowWrap').hidden = false;
    show.addEventListener('click', e => { const b = e.target.closest('.pshow'); if (b) openProduct(items[+b.dataset.i]); });
    show.addEventListener('error', e => { if (e.target.tagName === 'IMG') e.target.style.visibility = 'hidden'; }, true);
    const tinA = primaItems.find(it => it.code === '8700'), tinB = primaItems.find(it => it.code === '8600');
    if (tinA && tinA.img) $('#primaTinA').src = tinA.img;
    if (tinB && tinB.img) $('#primaTinB').src = tinB.img;
  }
  $$('[data-prima-all]').forEach(a => a.addEventListener('click', () => {
    if (!primaItems.length) return;
    state.group = 'prima'; state.cat = null; state.q = ''; search.value = ''; refresh();
  }));

  // world cards -> filter products
  const WORLD = {
    car: { group: 'car' }, building: { group: 'building' }, wood: { group: 'wood' },
    inks: { re: /حبر|احبار|ink/i, group: 'industrial' }, resins: { re: /ريزين|ريزن|راتنج|resin/i, group: 'industrial' },
  };
  $$('[data-world]').forEach(a => a.addEventListener('click', () => {
    if (!items.length) return;
    const w = WORLD[a.dataset.world] || {};
    const cat = w.re && cats.find(c => w.re.test(norm(c.ar)) || w.re.test(c.en) || w.re.test(c.id));
    if (cat) { state.group = cat.group; state.cat = cat.id; }
    else if (w.group && groupOrder.includes(w.group)) { state.group = w.group; state.cat = null; }
    else { state.group = 'all'; state.cat = null; }
    state.q = ''; search.value = '';
    refresh();
  }));

  /* product dialog */
  const pm = $('#pmodal');
  let lastFocus = null;
  function openProduct(it) {
    if (!it) return;
    lastFocus = document.activeElement;
    const img = $('#pmImg');
    img.hidden = !it.img;
    if (it.img) { img.src = it.img; img.alt = it.ar; }
    $('.pm-card', pm).style.setProperty('--gc', it.color);
    $('#pmCat').textContent = it.catAr;
    $('#pmName').textContent = it.ar;
    $('#pmCode').textContent = it.code;
    $('#pmCode').hidden = !it.code;
    $('#pmDesc').textContent = it.desc;
    $('#pmAsk').dataset.waText = `أهلاً، عايز أسأل عن منتج كابسي ${it.code ? it.code + ' - ' : ''}${it.ar}`;
    pm.hidden = false; document.body.style.overflow = 'hidden';
    $('.lb-close', pm).focus();
  }
  function closeProduct() { pm.hidden = true; document.body.style.overflow = ''; if (lastFocus) lastFocus.focus({ preventScroll: true }); }
  pm.addEventListener('click', e => { if (e.target === pm || e.target.closest('.lb-close')) closeProduct(); });

  /* ---------------- gallery + lightbox ---------------- */
  const SHOTS = [
    ['shop1', 'هرم علب الدهانات في المعرض'], ['nasr0', 'واجهة فرع مدينة نصر بالليل'], ['shop4', 'غرفة خلط دهانات السيارات'],
    ['latico', 'سيلر 717 من لاتيكو'], ['tagamoa', 'فرع التجمع الخامس بالليل'], ['shop2', 'حائط منتجات لاتيكو'],
    ['nasr1', 'عربيات العباسي للدهانات'], ['shop3', 'ورنيشات الأخشاب'], ['nasr2', 'واجهة فرع مدينة نصر'],
    ['shop5', 'ألوان الأخشاب WS100'], ['nasr3', 'فرع مدينة نصر'], ['nasr-main', 'من داخل المعرض'], ['tagamoa1', 'واجهة فرع التجمع'], ['nasr4', 'فرع مدينة نصر بالنهار'],
  ];
  const track = $('#stripTrack');
  const shotHTML = (s, i, dup) => `<button class="shot" type="button" data-shot="${i}" ${dup ? 'aria-hidden="true" tabindex="-1"' : ''}><img data-src="assets/shop/${s[0]}.jpg" alt="${dup ? '' : esc(s[1])}" decoding="async"></button>`;
  track.innerHTML = SHOTS.map((s, i) => shotHTML(s, i, false)).join('') + SHOTS.map((s, i) => shotHTML(s, i, true)).join('');
  // load the strip's photos eagerly once the gallery is near (lazy-loading breaks inside a moving overflow strip)
  const loadStrip = () => $$('img[data-src]', track).forEach(img => { img.src = img.dataset.src; img.removeAttribute('data-src'); });
  if ('IntersectionObserver' in window) {
    const gio = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { loadStrip(); gio.disconnect(); } }, { rootMargin: '900px 0px' });
    gio.observe($('#gallery'));
  } else loadStrip();

  const lb = $('#lightbox'), lbImg = $('img', lb);
  let lbIndex = 0;
  function showShot(i) {
    lbIndex = (i + SHOTS.length) % SHOTS.length;
    lbImg.src = `assets/shop/${SHOTS[lbIndex][0]}.jpg`; lbImg.alt = SHOTS[lbIndex][1];
  }
  function openLb(i) { lastFocus = document.activeElement; showShot(i); lb.hidden = false; document.body.style.overflow = 'hidden'; $('.lb-close', lb).focus(); }
  function closeLb() { lb.hidden = true; document.body.style.overflow = ''; if (lastFocus) lastFocus.focus({ preventScroll: true }); }
  track.addEventListener('click', e => { const b = e.target.closest('.shot'); if (b) openLb(+b.dataset.shot); });
  lb.addEventListener('click', e => {
    if (e.target.closest('.lb-prev')) showShot(lbIndex - 1);
    else if (e.target.closest('.lb-next')) showShot(lbIndex + 1);
    else if (e.target === lb || e.target.closest('.lb-close')) closeLb();
  });
  let tx0 = null;
  lb.addEventListener('touchstart', e => { tx0 = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', e => {
    if (tx0 == null) return;
    const dx = e.changedTouches[0].clientX - tx0; tx0 = null;
    if (Math.abs(dx) > 50) showShot(lbIndex + (dx > 0 ? -1 : 1));
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (!lb.hidden) closeLb(); else if (!pm.hidden) closeProduct(); else if (!chooser.hidden) closeChooser(); else if (nav.classList.contains('open')) burger.click(); }
    if (!lb.hidden && e.key === 'ArrowLeft') showShot(lbIndex + 1);
    if (!lb.hidden && e.key === 'ArrowRight') showShot(lbIndex - 1);
  });

  /* hide decorative images that fail to load (e.g. prima tins before catalog exists) */
  $$('img[data-hide-on-error]').forEach(img => {
    const hide = () => { img.style.display = 'none'; };
    if (img.complete && img.naturalWidth === 0 && img.src) hide();
    img.addEventListener('error', hide);
  });
})();
