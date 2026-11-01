const LOCS = ['All Patna', 'Boring Road', 'Kankarbagh', 'Rajendra Nagar', 'Patliputra', 'Bailey Road', 'Danapur'];
const CATS = [
  { k: 'Room', l: 'Room / PG', i: 'bed' },
  { k: 'Flat', l: 'Flat', i: 'flat' },
  { k: 'Plot', l: 'Plot/Zameen', i: 'plot' },
  { k: 'Commercial', l: 'Commercial', i: 'shop' }
];
const DATA = [
  { id: 1, t: 'Room', h: 22, title: 'Furnished Single Room + Attached Bath', loc: 'Kankarbagh', price: '₹4,200', u: '/mo', ago: 'Aaj', tags: ['Furnished', 'WiFi', '24×7 Water'], d: 'Ground floor room, students aur working professionals ke liye ideal.' },
  { id: 2, t: 'Flat', h: 262, title: 'Premium 2 BHK, 3rd Floor', loc: 'Boring Road', price: '₹14,500', u: '/mo', ago: 'Aaj', tags: ['2 BHK', 'Lift', 'Parking'], d: 'Modular kitchen, power backup aur gated society. Family preferred.' },
  { id: 3, t: 'Plot', h: 140, title: '1,200 sq ft Residential Plot', loc: 'Rajendra Nagar', price: '₹48 Lakh', u: '', ago: 'Kal', tags: ['East Facing', 'Corner', 'Ready Registry'], d: '20 ft road, clear title aur registry ke liye taiyar.' },
  { id: 4, t: 'Room', h: 330, title: 'Boys PG · Meals Included', loc: 'Boring Road', price: '₹5,500', u: '/mo', ago: 'Kal', tags: ['Double Sharing', 'Meals', 'CCTV'], d: 'Daily cleaning aur coaching hubs ke bilkul paas.' },
  { id: 5, t: 'Commercial', h: 200, title: 'Ground-floor Shop, 300 sq ft', loc: 'Patliputra', price: '₹32,000', u: '/mo', ago: '2 din pehle', tags: ['Main Road', 'Shutter', '3-Phase'], d: 'High footfall wali jagah, turant shuru karne layak.' },
  { id: 6, t: 'Flat', h: 180, title: '1 BHK Semi-Furnished Flat', loc: 'Bailey Road', price: '₹9,000', u: '/mo', ago: '3 din pehle', tags: ['1 BHK', 'Gated', 'Near Market'], d: 'Shaant society, main market se sirf 5 minute.' }
];

const S = { tab: 'home', cat: null, loc: 'All Patna', q: '', saved: new Set(), savedOnly: false, logged: false, after: null, otpStep: 0 };
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const ic = (n, c = '') => `<svg class="ic ${c}"><use href="#i-${n}"/></svg>`;

function toast(m) {
  const t = $('#toast');
  t.textContent = m;
  t.style.opacity = 1;
  t.style.transform = 'translate(-50%,-8px)';
  clearTimeout(toast.x);
  toast.x = setTimeout(() => {
    t.style.opacity = 0;
    t.style.transform = 'translate(-50%,0)';
  }, 2200);
}

/* --- HISTORY & BACK BUTTON ROUTER --- */
function getSnapshot(extra = {}) {
  return {
    tab: S.tab,
    cat: S.cat,
    loc: S.loc,
    savedOnly: S.savedOnly,
    modalOpen: $('#modal').classList.contains('open'),
    otpStep: S.otpStep,
    menuOpen: !$('#locMenu').classList.contains('hidden') || !$('#palMenu').classList.contains('hidden'),
    ...extra
  };
}

function pushAppState(hash = '') {
  const st = getSnapshot();
  const urlHash = hash || `#${S.tab}${S.cat ? '-' + S.cat.toLowerCase() : ''}`;
  history.pushState(st, '', urlHash);
}

window.addEventListener('popstate', e => {
  // 1. Agar OTP Modal ke Step 2 par hain, to wapas Step 1 par layein
  if ($('#modal').classList.contains('open') && S.otpStep === 1) {
    showOtpStep(0);
    return;
  }
  // 2. Agar OTP Modal khula hai, to use band karein
  if ($('#modal').classList.contains('open')) {
    $('#modal').classList.remove('open');
    return;
  }
  // 3. Agar Location ya Theme dropdown menu khula hai, to use band karein
  if (!$('#locMenu').classList.contains('hidden') || !$('#palMenu').classList.contains('hidden')) {
    $('#locMenu').classList.add('hidden');
    $('#palMenu').classList.add('hidden');
    return;
  }
  // 4. Pichhli Tab / Filter state restore karein
  const st = e.state || { tab: 'home', cat: null, loc: 'All Patna', savedOnly: false };
  S.tab = st.tab || 'home';
  S.cat = st.cat || null;
  S.loc = st.loc || 'All Patna';
  S.savedOnly = Boolean(st.savedOnly);
  syncNavUI();
  refresh();
});

function syncNavUI() {
  $$('.nav').forEach(b => {
    b.style.color = b.dataset.nav === S.tab ? 'var(--a)' : '';
  });
  $('#feedTitle').textContent = S.savedOnly ? 'Saved Listings' : 'Taaza Listings';
}

/* --- SVG GRAPHICS --- */
function defs(i, h) {
  return `<defs><linearGradient id="k${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${h} 55% 24%)"/><stop offset=".6" stop-color="hsl(${h + 28} 80% 62%)"/><stop offset="1" stop-color="hsl(${h + 45} 90% 80%)"/></linearGradient><radialGradient id="r${i}" cx=".78" cy=".6" r=".55"><stop offset="0" stop-color="#fff6d0" stop-opacity=".95"/><stop offset="1" stop-color="#fff6d0" stop-opacity="0"/></radialGradient><linearGradient id="f${i}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="hsl(${h} 28% 92%)"/><stop offset="1" stop-color="hsl(${h} 26% 74%)"/></linearGradient><linearGradient id="w${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9a8"/><stop offset="1" stop-color="#ffb347"/></linearGradient><filter id="b${i}"><feGaussianBlur stdDeviation="3"/></filter></defs>`;
}
function ext(i, h, t) {
  let b = `<rect width="400" height="260" fill="url(#k${i})"/><rect width="400" height="260" fill="url(#r${i})"/>`;
  [[10, 120, 40], [60, 100, 50], [300, 110, 45], [350, 90, 50]].forEach(([x, y, w]) => b += `<rect x="${x}" y="${y}" width="${w}" height="140" fill="hsl(${h} 35% 30%)" opacity=".55" filter="url(#b${i})"/>`);
  if (t === 'Plot') {
    b += `<path d="M0 150L400 120v140H0z" fill="hsl(105 45% 38%)"/><path d="M0 190L400 160v100H0z" fill="hsl(105 50% 30%)"/><path d="M70 170l120-34 150 14-60 52z" fill="hsl(105 55% 52%)" stroke="#fff" stroke-width="3" stroke-dasharray="8 6"/><rect x="226" y="108" width="5" height="44" fill="#fff"/><rect x="206" y="96" width="46" height="20" rx="4" fill="#fff"/><rect x="212" y="102" width="34" height="3" fill="hsl(${h} 70% 45%)"/><rect x="212" y="108" width="22" height="3" fill="hsl(${h} 70% 45%)"/>`;
  } else {
    b += `<rect y="215" width="400" height="45" fill="hsl(${h} 18% 22%)"/><rect y="215" width="400" height="3" fill="#fff" opacity=".35"/><polygon points="70,92 230,70 230,215 70,215" fill="url(#f${i})"/><polygon points="230,70 335,98 335,215 230,215" fill="hsl(${h} 24% 52%)"/><polygon points="62,92 230,64 342,94 335,100 230,76 70,100" fill="hsl(${h} 30% 28%)"/>`;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) b += `<rect x="${86 + c * 48}" y="${104 + r * 27}" width="30" height="19" rx="3" fill="url(#w${i})" opacity="${(r + c) % 3 ? 1 : .45}"/>`;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) b += `<rect x="${244 + c * 30}" y="${112 + r * 25 + c * 7}" width="19" height="16" rx="2" fill="url(#w${i})" opacity="${(r + c) % 2 ? .9 : .4}"/>`;
    b += `<rect x="140" y="178" width="26" height="37" rx="3" fill="hsl(${h} 40% 22%)"/><ellipse cx="200" cy="218" rx="150" ry="9" fill="#000" opacity=".28" filter="url(#b${i})"/>`;
  }
  b += `<circle cx="40" cy="205" r="26" fill="hsl(130 45% 22%)" filter="url(#b${i})"/><circle cx="372" cy="200" r="30" fill="hsl(130 45% 20%)" filter="url(#b${i})"/>`;
  return `<svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" class="w-full h-full" aria-hidden="true">${defs(i, h)}${b}</svg>`;
}
function inn(i, h, t) {
  let b;
  if (t === 'Plot') {
    b = `<rect width="400" height="260" fill="hsl(105 40% 34%)"/><path d="M0 120h400v34H0z" fill="hsl(${h} 10% 28%)"/><path d="M0 137h400" stroke="#fff" stroke-width="2" stroke-dasharray="14 10" opacity=".7"/><path d="M90 160h190l-12 80H70z" fill="hsl(105 55% 50%)" stroke="#fff" stroke-width="3" stroke-dasharray="9 6"/><g fill="#fff" font-family="Sora,sans-serif" font-weight="800" font-size="15" text-anchor="middle"><text x="175" y="206">Aapka Plot</text></g><circle cx="320" cy="70" r="16" fill="#fde047" filter="url(#b${i})"/>`;
  } else {
    b = `<rect width="400" height="260" fill="hsl(${h} 30% 88%)"/><rect y="170" width="400" height="90" fill="hsl(28 38% 46%)"/><rect y="170" width="400" height="5" fill="#000" opacity=".15"/><rect x="250" y="34" width="116" height="124" rx="6" fill="url(#k${i})" stroke="#fff" stroke-width="6"/><path d="M308 34v124M250 96h116" stroke="#fff" stroke-width="4"/><polygon points="250,158 366,158 330,260 190,260" fill="#fff" opacity=".22"/><ellipse cx="130" cy="214" rx="105" ry="12" fill="#000" opacity=".3" filter="url(#b${i})"/><rect x="30" y="118" width="26" height="80" rx="8" fill="hsl(${h} 35% 30%)"/><rect x="40" y="150" width="170" height="56" rx="14" fill="hsl(${h} 55% 58%)"/><rect x="48" y="132" width="62" height="26" rx="12" fill="#fff"/><rect x="118" y="136" width="54" height="22" rx="10" fill="#fff" opacity=".92"/><rect x="40" y="176" width="170" height="30" rx="12" fill="hsl(${h} 50% 46%)"/><circle cx="228" cy="118" r="34" fill="#ffe08a" opacity=".35" filter="url(#b${i})"/><rect x="226" y="122" width="4" height="50" fill="hsl(${h} 20% 35%)"/>`;
  }
  return `<svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" class="w-full h-full" aria-hidden="true">${defs(i, h)}${b}</svg>`;
}
const media = p => [ext(p.id, p.h, p.t), inn(p.id + 10, p.h, p.t)];

/* --- RENDER FUNCTIONS --- */
function renderLocs() {
  $('#pills').innerHTML = LOCS.map(l => `<button class="chip ${l === S.loc ? 'on' : ''}" data-loc="${l}">${l}</button>`).join('');
  $('#locMenu').innerHTML = LOCS.map(l => `<button data-loc="${l}" class="w-full text-left px-3 py-2 rounded-xl font-bold ${l === S.loc ? 'soft' : ''}">${l}</button>`).join('');
  $('#locLbl').textContent = S.loc;
}
function renderCats() {
  $('#cats').innerHTML = CATS.map(c => `<button data-cat="${c.k}" class="cat ${S.cat === c.k ? 'on' : ''}"><i class="${S.cat === c.k ? '' : 'soft'}">${ic(c.i, '!w-6 !h-6')}</i><b>${c.l}</b><small>${DATA.filter(p => p.t === c.k).length} listings</small></button>`).join('');
}
function renderFeat() {
  $('#feat').innerHTML = [DATA[1], DATA[2], DATA[0]].map(p => `<button data-go="${p.id}" class="ft text-left text-white">${media(p)[0]}<div class="shade"></div><span class="absolute top-3 left-3 glassc rounded-full px-2.5 py-1 text-[10px] font-extrabold flex items-center gap-1">${ic('shield', '!w-3 !h-3')}Verified</span><div class="absolute bottom-3.5 left-4 right-4"><div class="hd font-extrabold text-xl">${p.price}<small class="text-xs font-semibold opacity-80">${p.u}</small></div><div class="text-[13px] font-bold leading-tight line-clamp-1">${p.title}</div><div class="text-[11px] opacity-80 mt-0.5">${p.loc}, Patna</div></div></button>`).join('');
}
function renderFeed() {
  const q = S.q.toLowerCase();
  const L = DATA.filter(p => (!S.cat || p.t === S.cat) && (S.loc === 'All Patna' || p.loc === S.loc) && (!S.savedOnly || S.saved.has(p.id)) && (!q || (p.title + p.loc + p.t + p.d + p.tags).toLowerCase().includes(q)));
  $('#count').textContent = L.length + ' mile';
  $('#feed').innerHTML = L.length ? L.map((p, n) => {
    const m = media(p), sv = S.saved.has(p.id);
    return `<article id="p${p.id}" class="pc" style="animation-delay:${n * 70}ms">
    <div class="relative"><div class="gal noscroll">${m.map(x => `<div>${x}</div>`).join('')}</div>
      <span class="absolute top-3.5 left-3.5 glassc text-white rounded-full px-3 py-1.5 text-[11px] font-extrabold flex items-center gap-1" style="box-shadow:0 0 16px rgba(255,255,255,.25)">${ic('shield', '!w-3.5 !h-3.5')}Verified Owner</span>
      <button data-save="${p.id}" class="absolute top-3 right-3 w-10 h-10 rounded-full grid place-items-center glassc transition active:scale-90" style="color:${sv ? '#fb7185' : '#fff'}" aria-label="Save"><svg class="ic" style="fill:${sv ? '#fb7185' : 'none'}"><use href="#i-heart"/></svg></button>
      <span class="cnt absolute bottom-3.5 right-3.5 glassc text-white rounded-full px-2.5 py-1 text-[10px] font-bold">1/${m.length}</span>
      <div class="grad absolute bottom-3.5 left-3.5 rounded-2xl px-4 py-2 hd font-extrabold text-xl shadow-lg">${p.price}<small class="text-xs font-semibold opacity-85">${p.u}</small></div></div>
    <div class="p-4 pt-4">
      <h3 class="hd font-bold text-[17px] leading-snug">${p.title}</h3>
      <p class="flex items-center gap-1 text-xs font-bold mt-1.5" style="color:var(--a)">${ic('pin', '!w-3.5 !h-3.5')}${p.loc}, Patna <span style="color:var(--mut)" class="font-semibold">· ${p.ago}</span></p>
      <div class="flex flex-wrap gap-1.5 mt-3">${p.tags.map(x => `<span class="tag soft">${x}</span>`).join('')}</div>
      <p class="text-[13px] mt-3 leading-relaxed" style="color:var(--mut)">${p.d}</p>
      <div class="flex gap-2.5 mt-4">
        <button data-act="call" class="btn call grad">${ic('phone')}Call Seller</button>
        <button data-act="wa" class="btn wa">${ic('chat')}WhatsApp</button>
      </div></div></article>`;
  }).join('') : `<div class="pc p-9 text-center text-sm font-bold" style="color:var(--mut)">Koi listing nahi mili.<br><span style="color:var(--a)">Filter badal kar dekhein.</span></div>`;
}

const refresh = () => { renderLocs(); renderCats(); renderFeed(); };

$('#feed').addEventListener('scroll', e => {
  const g = e.target;
  if (g.classList.contains('gal')) {
    g.parentElement.querySelector('.cnt').textContent = (Math.round(g.scrollLeft / g.clientWidth) + 1) + '/2';
  }
}, true);

/* --- MODAL / OTP --- */
const M = $('#modal'), steps = ['#s1', '#s2', '#s3'];
function showOtpStep(n) {
  S.otpStep = n;
  steps.forEach((s, i) => $(s).classList.toggle('hidden', i !== n));
  $('#mIcon').firstElementChild.setAttribute('href', n === 1 ? '#i-finger' : '#i-shield');
}
function openModal(after) {
  S.after = after || null;
  showOtpStep(0);
  $('#pErr').textContent = '';
  M.classList.add('open');
  pushAppState('#login-modal');
}
function closeModal() {
  if (M.classList.contains('open')) {
    M.classList.remove('open');
    if (location.hash === '#login-modal' || location.hash === '#otp-step') {
      history.back();
    }
  }
}
$('#mClose').onclick = closeModal;
M.onclick = e => { if (e.target === M) closeModal(); };
$('#phone').oninput = e => e.target.value = e.target.value.replace(/\D/g, '');
$('#sendOtp').onclick = () => {
  const v = $('#phone').value;
  if (!/^[6-9]\d{9}$/.test(v)) {
    $('#pErr').textContent = 'Sahi 10-digit mobile number daalein';
    return;
  }
  $('#sentTo').textContent = '+91 ' + v.slice(0, 2) + 'XXXXXX' + v.slice(-2);
  $$('.otp').forEach(o => o.value = '');
  showOtpStep(1);
  pushAppState('#otp-step');
  setTimeout(() => $('.otp').focus(), 350);
};
$('#back').onclick = () => history.back();

$$('.otp').forEach((o, i, a) => {
  o.oninput = () => {
    o.value = o.value.replace(/\D/g, '');
    if (o.value && a[i + 1]) a[i + 1].focus();
  };
  o.onkeydown = e => {
    if (e.key === 'Backspace' && !o.value && a[i - 1]) a[i - 1].focus();
  };
});

$('#verify').onclick = () => {
  if ($$('.otp').map(o => o.value).join('').length < 4) {
    $('#oErr').textContent = '4-digit OTP poora daalein';
    return;
  }
  $('#oErr').textContent = '';
  S.logged = true;
  showOtpStep(2);
  setTimeout(() => {
    M.classList.remove('open');
    if (S.after) S.after();
  }, 1100);
};

/* --- USER ACTIONS & NAVIGATION --- */
const act = kind => {
  const go = () => {
    const ph = '919000000000';
    kind === 'call'
      ? location.href = 'tel:+' + ph
      : window.open('https://wa.me/' + ph + '?text=' + encodeURIComponent('Namaste! Maine AwasPatna par aapki listing dekhi. Kya yeh available hai?'), '_blank', 'noopener');
  };
  S.logged ? go() : openModal(go);
};

const R = document.documentElement;
document.addEventListener('click', e => {
  const t = e.target.closest('[data-loc],[data-cat],[data-save],[data-act],[data-nav],[data-go],[data-pal],[data-mode]');
  if (!e.target.closest('#palMenu,#palBtn')) $('#palMenu').classList.add('hidden');
  if (!e.target.closest('#locMenu,#locBtn')) $('#locMenu').classList.add('hidden');
  if (!t) return;
  const d = t.dataset;
  if (d.pal !== undefined) R.dataset.pal = d.pal;
  else if (d.mode !== undefined) {
    const cur = R.dataset.theme || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
    R.dataset.theme = cur === 'dark' ? 'light' : 'dark';
  }
  else if (d.loc) {
    S.loc = d.loc;
    $('#locMenu').classList.add('hidden');
    pushAppState(`#loc-${d.loc.toLowerCase().replace(/\s+/g, '-')}`);
    refresh();
  }
  else if (d.cat) {
    S.cat = S.cat === d.cat ? null : d.cat;
    pushAppState(S.cat ? `#cat-${S.cat.toLowerCase()}` : '#home');
    refresh();
  }
  else if (d.go) {
    Object.assign(S, { tab: 'home', cat: null, loc: 'All Patna', q: '', savedOnly: false });
    $('#q').value = '';
    pushAppState(`#listing-${d.go}`);
    syncNavUI();
    refresh();
    setTimeout(() => $('#p' + d.go)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
  }
  else if (d.save) {
    const id = +d.save;
    S.saved.has(id) ? S.saved.delete(id) : S.saved.add(id);
    renderFeed();
  }
  else if (d.act) act(d.act);
  else if (d.nav) {
    const n = d.nav;
    if (n === 'home' || n === 'saved') {
      if (S.tab !== n) {
        S.tab = n;
        S.savedOnly = n === 'saved';
        pushAppState(`#${n}`);
        syncNavUI();
        renderFeed();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else if (n === 'alerts') {
      toast('Naye listings ke alerts jald aa rahe hain');
    } else if (n === 'profile') {
      S.logged ? toast('Aap login hain ✓') : openModal();
    }
  }
});

$('#locBtn').onclick = e => {
  e.stopPropagation();
  $('#palMenu').classList.add('hidden');
  const isOpening = $('#locMenu').classList.contains('hidden');
  $('#locMenu').classList.toggle('hidden');
  if (isOpening) pushAppState('#location-menu');
};
$('#palBtn').onclick = e => {
  e.stopPropagation();
  $('#locMenu').classList.add('hidden');
  const isOpening = $('#palMenu').classList.contains('hidden');
  $('#palMenu').classList.toggle('hidden');
  if (isOpening) pushAppState('#theme-menu');
};
$('#bellBtn').onclick = () => toast('Koi naya notification nahi');
$('#fab').onclick = () => {
  const go = () => toast('Listing form jald aa raha hai — bilkul Free!');
  S.logged ? go() : openModal(go);
};
$('#q').oninput = e => { S.q = e.target.value.trim(); renderFeed(); };

// Initial state registration + Service Worker
history.replaceState(getSnapshot(), '', '#home');
renderFeat();
refresh();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
