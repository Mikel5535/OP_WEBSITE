(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const smoothstep = (p, e0, e1) => { const t = clamp((p - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const RM = matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- Nav ---------- */
  const nav = $('#nav') || $('.navbar'), links = $('#links'), menuBtn = $('#menuBtn');
  let navSolid = null;
  const setNav = () => { const s = scrollY > 40; if (s !== navSolid) { navSolid = s; nav.classList.toggle('solid', s); } };
  addEventListener('scroll', setNav, { passive: true }); setNav();
  if (menuBtn && links) {
    menuBtn.addEventListener('click', () => {
      const open = links.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', open);
    });
    links.addEventListener('click', e => { if (e.target.tagName === 'A') { links.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false'); } });
  }

  /* ---------- Hero: split words (seeded, same every load) ---------- */
  function rng(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
  $$('.band .split').forEach((el, i) => {
    const r = rng(1009 + i * 77);
    const sr = document.createElement('span'); sr.className = 'sr'; sr.textContent = el.textContent;
    const vis = document.createElement('span'); vis.setAttribute('aria-hidden', 'true');
    const parts = [];
    el.childNodes.forEach(n => {
      const gold = n.nodeType === 1;
      n.textContent.split(/(\s+)/).forEach(t => { if (t) parts.push({ t, gold }); });
    });
    const words = parts.filter(p => p.t.trim());
    let wi = 0;
    parts.forEach(p => {
      if (!p.t.trim()) { vis.append(document.createTextNode(' ')); return; }
      const w = document.createElement('span');
      w.className = 'w' + (p.gold ? ' gold' : '');
      w.textContent = p.t;
      w.style.setProperty('--th', (wi / words.length * 0.55 + r() * 0.05).toFixed(3));
      wi++; vis.append(w);
    });
    el.replaceChildren(sr, vis);
  });

  /* ---------- Hero scrub ---------- */
  const hero = $('#lighthouse'), stage = $('#stage'), video = $('#hero'), poster = $('#poster'), ring = $('#ring'), cue = $('#cue');
  const VIDEO_URL = 'assets/hero-scrub.mp4', VIDEO_BYTES = 5944919;
  const bands = $$('.band').map(el => ({ el, a: +el.dataset.a, b: +el.dataset.b, ramp: el.dataset.ramp ? +el.dataset.ramp : null, op: -1, k: -1, live: null }));
  const first = bands[0], last = bands[bands.length - 1];
  let target = 0, shown = 0, rafId = null, lastTick = 0, heroOnScreen = true, scrubOn = false, inited = false;
  let loadK = 0, loadStart = 0;

  function heroProgress() {
    const r = hero.getBoundingClientRect();
    const range = hero.offsetHeight - innerHeight;
    return range > 0 ? clamp(-r.top / range, 0, 1) : 0;
  }

  let seekBusy = false, pendingTime = null;
  function requestSeek(t) {
    if (!video.duration || !stage.classList.contains('video-ready')) return;
    if (seekBusy) { pendingTime = t; return; }
    seekBusy = true; video.currentTime = t;
  }
  if (video) {
    video.addEventListener('seeked', () => { seekBusy = false; if (pendingTime !== null) { const t = pendingTime; pendingTime = null; requestSeek(t); } });
    video.addEventListener('error', () => { seekBusy = false; pendingTime = null; failVideo(); });
  }

  let cueShown = true;
  function updateCaptions(p, now) {
    if (loadK < 1) loadK = clamp((now - loadStart) / 1400, 0, 1);
    for (const B of bands) {
      const f = Math.min(0.02, (B.b - B.a) / 3);
      let op = (B === first ? 1 : smoothstep(p, B.a, B.a + f)) * (B === last ? 1 : 1 - smoothstep(p, B.b - f, B.b));
      const ramp = B.ramp || Math.min(0.025, (B.b - B.a) * 0.35);
      let k = clamp((p - B.a) / ramp, 0, 1);
      if (B === first) { k = Math.max(k, 1 - (1 - loadK) ** 3); }
      if (Math.abs(op - B.op) > 0.004) { B.op = op; B.el.style.opacity = op.toFixed(3); }
      if (Math.abs(k - B.k) > 0.008 || (k === 1 && B.k !== 1)) { B.k = k; B.el.style.setProperty('--k', k.toFixed(3)); }
      const live = op > 0.5;
      if (live !== B.live) { B.live = live; B.el.classList.toggle('live', live); }
    }
    const c = p < 0.04;
    if (c !== cueShown) { cueShown = c; cue.style.opacity = c ? '1' : '0'; }
  }

  function tick(now) {
    const dt = Math.min(100, now - (lastTick || now));
    lastTick = now;
    const kk = 0.16;
    shown += (target - shown) * (1 - Math.pow(1 - kk, dt / 16.667));
    const settled = Math.abs(target - shown) < 0.0005 && loadK >= 1;
    if (settled) { shown = target; rafId = null; lastTick = 0; }
    else rafId = requestAnimationFrame(tick);
    if (video.duration) requestSeek(shown * (video.duration - 0.05));
    updateCaptions(shown, now);
  }
  function onScroll() {
    target = heroProgress();
    if (rafId === null && heroOnScreen && scrubOn) rafId = requestAnimationFrame(tick);
  }
  // The lighthouse section may be parked in snippets/ (Oct 14, 2026); skip the scrub when it's absent
  if (hero) new IntersectionObserver(es => { heroOnScreen = es[0].isIntersecting; if (heroOnScreen) onScroll(); }).observe(hero);

  function failVideo() { stage.classList.add('video-failed'); ring.style.display = 'none'; }

  async function loadHeroBlob() {
    const ctrl = new AbortController();
    let watchdog = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(VIDEO_URL, { priority: 'low', signal: ctrl.signal });
    if (!res.ok) throw new Error('video ' + res.status);
    const total = Number(res.headers.get('Content-Length')) || VIDEO_BYTES;
    const reader = res.body.getReader();
    const chunks = []; let got = 0, lastRing = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      clearTimeout(watchdog); watchdog = setTimeout(() => ctrl.abort(), 20000);
      chunks.push(value); got += value.length;
      const frac = Math.min(1, got / total), now = performance.now();
      if (now - lastRing > 100 || frac === 1) { lastRing = now; ring.style.setProperty('--ld', Math.round(126 * (1 - frac))); }
    }
    clearTimeout(watchdog);
    ring.style.setProperty('--ld', 0);
    video.src = URL.createObjectURL(new Blob(chunks, { type: 'video/mp4' }));
    video.load();
    video.addEventListener('canplay', () => {
      stage.classList.add('video-ready');
      requestSeek(heroProgress() * (video.duration - 0.05));
    }, { once: true });
  }

  function initHeroOnce() {
    if (inited) return; inited = true;
    poster.style.backgroundImage = "url('assets/hero-poster.jpg')";
    let started = false;
    const start = () => { if (started) return; started = true; loadHeroBlob().catch(failVideo); };
    const img = new Image(); img.onload = start; img.onerror = start; img.src = 'assets/hero-poster.jpg';
    setTimeout(start, 4000);
  }

  const GATES = [
    '(max-width: 720px)',
    '(orientation: portrait) and (max-width: 1024px)',
    '(orientation: portrait) and (pointer: coarse)',
    '(orientation: landscape) and (pointer: coarse) and (max-height: 560px)',
    '(prefers-reduced-motion: reduce)'
  ];
  function enableScrub() {
    if (scrubOn) return; scrubOn = true;
    initHeroOnce();
    addEventListener('scroll', onScroll, { passive: true });
    bands.forEach(B => { B.op = -1; B.k = -1; B.live = null; });
    loadStart = performance.now();
    target = heroProgress(); shown = target;
    rafId = requestAnimationFrame(tick);
  }
  function disableScrub() {
    if (!scrubOn) return; scrubOn = false;
    removeEventListener('scroll', onScroll);
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  }
  function applyHeroMode() { if (GATES.some(q => matchMedia(q).matches)) disableScrub(); else enableScrub(); }
  if (hero) {
    const MQLS = GATES.map(q => matchMedia(q));
    MQLS.forEach(m => m.addEventListener('change', applyHeroMode));
    applyHeroMode();
  }

  /* ---------- Section reveals ---------- */
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    e.target.classList.add('in'); io.unobserve(e.target);
    setTimeout(() => e.target.classList.add('done'), 1400);
  }), { threshold: 0.18 });
  $$('.reveal').forEach(el => io.observe(el));

  /* ---------- AI flow: wires and travelling pulses ---------- */
  const flow = $('#flow'), wires = $('#wires');
  const NS = 'http://www.w3.org/2000/svg';
  let paths = [], pulses = [], flowRaf = null, flowVisible = false, pulseT = 0, flowLast = 0;
  function buildWires() {
    wires.replaceChildren(); paths = []; pulses = [];
    if (getComputedStyle(wires).display === 'none') return;
    const fb = flow.getBoundingClientRect();
    const box = el => { const r = el.getBoundingClientRect(); return { l: r.left - fb.left, r: r.right - fb.left, cy: r.top - fb.top + r.height / 2 }; };
    const groups = [0, 1, 2, 3, 4].map(n => $$(`.node[data-n="${n}"]`, flow).map(box));
    const link = (A, B, delay) => {
      const x1 = A.r, x2 = B.l, mx = (x1 + x2) / 2;
      const d = `M${x1},${A.cy} C${mx},${A.cy} ${mx},${B.cy} ${x2},${B.cy}`;
      const base = document.createElementNS(NS, 'path'); base.setAttribute('d', d); base.setAttribute('class', 'wire');
      const draw = document.createElementNS(NS, 'path'); draw.setAttribute('d', d); draw.setAttribute('class', 'wire-draw');
      wires.append(base, draw);
      const len = draw.getTotalLength();
      draw.style.setProperty('--len', len); draw.style.transitionDelay = delay + 's';
      const dot = document.createElementNS(NS, 'circle'); dot.setAttribute('r', 3.2); dot.setAttribute('class', 'pulse'); dot.style.opacity = 0;
      wires.append(dot);
      paths.push({ draw, len, dot, delay });
    };
    groups[0].forEach((g, i) => link(g, groups[1][0], i * 0.1));
    groups[2].forEach((g, i) => link(groups[1][0], g, 0.4 + i * 0.1));
    groups[2].forEach((g, i) => link(g, groups[3][0], 0.7 + i * 0.1));
    link(groups[3][0], groups[4][0], 1.0);
  }
  const STAGES = [[0, 1, 2], [3, 4], [5, 6], [7]];
  const nodesByN = [0, 1, 2, 3, 4].map(n => $$(`.node[data-n="${n}"]`, flow));
  let litN = -1;
  function flowTick(now) {
    const dt = Math.min(64, now - (flowLast || now)); flowLast = now;
    pulseT = (pulseT + dt / 1000) % 5.6;            // one full journey every 5.6s
    const seg = Math.floor(pulseT / 1.2), within = (pulseT % 1.2) / 1.2;
    paths.forEach((p, i) => {
      const s = STAGES.findIndex(arr => arr.includes(i));
      const on = s === seg && within < 1;
      if (on) {
        const pt = p.draw.getPointAtLength(p.len * within);
        p.dot.setAttribute('cx', pt.x); p.dot.setAttribute('cy', pt.y);
        p.dot.style.opacity = Math.sin(Math.PI * within).toFixed(2);
      } else if (p.dot.style.opacity !== '0') p.dot.style.opacity = 0;
    });
    const n = seg <= 3 ? (within > 0.85 ? seg + 1 : seg) : 4;
    if (n !== litN) { nodesByN.forEach((arr, i) => arr.forEach(el => el.classList.toggle('lit', i === n))); litN = n; }
    flowRaf = flowVisible ? requestAnimationFrame(flowTick) : null;
  }
  function startFlow() { if (!flowRaf && !RM.matches && paths.length) { flowLast = 0; flowRaf = requestAnimationFrame(flowTick); } }
  new IntersectionObserver(es => {
    flowVisible = es[0].isIntersecting;
    if (flowVisible) { flow.classList.add('in'); startFlow(); }
  }, { threshold: 0.15 }).observe(flow);
  buildWires();
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { buildWires(); if (flowVisible) startFlow(); }, 200); });
  document.fonts && document.fonts.ready.then(buildWires);

  /* ---------- The one interactive moment: hold to scan ---------- */
  const hold = $('#hold'), holdLabel = $('#holdLabel'), crit = $$('#crit li:not(.grade)'), grade = $('#grade'), gradeVal = $('#gradeVal'), gradeTxt = $('#gradeTxt');
  const PASS = [1, 1, 1, 1, 1, 0, 1, 1, 1, 1];   // the demo stock fails one test: 9/10
  let hp = 0, holding = false, holdRaf = null, holdLast = 0, done = false, litCount = -1;
  function paintHold() {
    hold.style.setProperty('--hp', hp.toFixed(3));
    const n = Math.floor(hp * 10.001);
    if (n !== litCount) {
      litCount = n;
      crit.forEach((li, i) => li.classList.toggle('on', i < n && PASS[i] === 1));
      crit.forEach((li, i) => li.classList.toggle('miss', i < n && PASS[i] === 0));
    }
  }
  function finish() {
    done = true; hp = 1; paintHold();
    grade.classList.add('on'); gradeVal.textContent = '9/10';
    gradeTxt.textContent = 'A+ setup. This one goes to Claude for pricing, then to Mike for the final call.';
    holdLabel.textContent = 'Scan again';
  }
  function holdTick(now) {
    const dt = Math.min(64, now - (holdLast || now)); holdLast = now;
    hp = clamp(hp + (holding ? dt / 2600 : -dt / 900), 0, 1);
    paintHold();
    if (hp >= 1 && holding) { holding = false; finish(); holdRaf = null; holdLast = 0; return; }
    if ((holding || hp > 0) && !done) holdRaf = requestAnimationFrame(holdTick); else { holdRaf = null; holdLast = 0; }
  }
  function press(e) {
    e.preventDefault();
    if (done) { done = false; hp = 0; litCount = -1; grade.classList.remove('on'); gradeVal.textContent = '?'; gradeTxt.textContent = 'Hold the button to grade this stock.'; holdLabel.textContent = 'Hold to scan'; paintHold(); return; }
    if (RM.matches) { finish(); return; }
    holding = true; holdLabel.textContent = 'Scanning…';
    if (!holdRaf) holdRaf = requestAnimationFrame(holdTick);
  }
  function release() { if (!holding) return; holding = false; if (!done) holdLabel.textContent = 'Hold to scan'; if (!holdRaf) holdRaf = requestAnimationFrame(holdTick); }
  hold.addEventListener('pointerdown', press);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => hold.addEventListener(t, release));
  hold.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) press(e); });
  hold.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') release(); });

  /* ---------- Your alert, your language ---------- */
  const TR = [
    ['en', 'English', 'Your A+ alert is ready.'],
    ['es', 'Español', 'Tu alerta A+ está lista.'],
    ['pt', 'Português', 'Seu alerta A+ está pronto.'],
    ['fr', 'Français', 'Votre alerte A+ est prête.'],
    ['de', 'Deutsch', 'Ihr A+ Signal ist bereit.'],
    ['it', 'Italiano', 'Il tuo avviso A+ è pronto.'],
    ['ja', '日本語', 'A+ アラートが届きました。'],
    ['zh', '中文', '您的 A+ 交易提醒已就绪。'],
    ['ko', '한국어', 'A+ 알림이 도착했습니다.'],
    ['ar', 'العربية', 'تنبيه A+ الخاص بك جاهز.'],
    ['hi', 'हिन्दी', 'आपका A+ अलर्ट तैयार है।']
  ];
  const trLine = $('#trLine'), trLang = $('#trLang');
  let ti = 0, trTimer = null;
  function nextTr() {
    trLine.classList.add('out');
    setTimeout(() => {
      ti = (ti + 1) % TR.length;
      const [code, name, text] = TR[ti];
      trLine.textContent = text; trLine.lang = code; trLine.dir = code === 'ar' ? 'rtl' : 'ltr';
      trLang.textContent = name;
      trLine.classList.remove('out');
    }, 500);
  }
  new IntersectionObserver(es => {
    if (es[0].isIntersecting && !RM.matches) { if (!trTimer) trTimer = setInterval(nextTr, 2800); }
    else { clearInterval(trTimer); trTimer = null; }
  }).observe(trLine);

  /* ---------- Form: no backend yet, so the success state is honest about it ---------- */
  const form = $('#form');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const bad = $$('input[required]', form).find(i => !i.value.trim() || (i.type === 'email' && !/^\S+@\S+\.\S+$/.test(i.value)));
    $$('input', form).forEach(i => i.style.borderColor = '');
    if (bad) { form.classList.add('err'); bad.focus(); bad.style.borderColor = '#e07a5f'; return; }
    form.classList.remove('err'); form.classList.add('sent');
  });

  /* ---------- Pause loops on hidden tabs; honour reduced motion live ---------- */
  document.addEventListener('visibilitychange', () => document.body.classList.toggle('paused', document.hidden));
  RM.addEventListener('change', e => {
    if (e.matches) {
      if (flowRaf) { cancelAnimationFrame(flowRaf); flowRaf = null; }
      paths.forEach(p => p.dot.style.opacity = 0);
      $$('.reveal').forEach(el => el.classList.add('in', 'done'));
      clearInterval(trTimer); trTimer = null;
    } else { applyHeroMode(); startFlow(); }
  });
})();

/* ---------- Inbox tabs (arrow keys move between tabs) ---------- */
(() => {
  const tabs = [...document.querySelectorAll('.tabs [role="tab"]')];
  const pick = t => {
    tabs.forEach(x => {
      const on = x === t;
      x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1;
      document.getElementById(x.getAttribute('aria-controls')).hidden = !on;
    });
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => pick(t));
    t.addEventListener('keydown', e => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      const n = tabs[(i + d + tabs.length) % tabs.length]; pick(n); n.focus();
    });
  });
})();
