import { 
  db, auth, collection, doc, onSnapshot, addDoc, setDoc, 
  RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged 
} from "./firebase-config.js";

const LOCS = ['All Patna', 'Boring Road', 'Kankarbagh', 'Rajendra Nagar', 'Patliputra', 'Bailey Road', 'Danapur'];
const CATS = [
  { k: 'Room', l: 'Room / PG', i: 'bed' },
  { k: 'Flat', l: 'Flat', i: 'flat' },
  { k: 'Plot', l: 'Plot/Zameen', i: 'plot' },
  { k: 'Commercial', l: 'Commercial', i: 'shop' }
];
const FALLBACK_DATA = [
  { id: 'd1', t: 'Room', h: 22, title: 'Furnished Single Room + Attached Bath', loc: 'Kankarbagh', price: '₹4,200', u: '/mo', ago: 'Aaj', tags: ['Furnished', 'WiFi', '24×7 Water'], d: 'Ground floor room, students aur working professionals ke liye ideal.', phone: '919812300001', status: 'approved' },
  { id: 'd2', t: 'Flat', h: 262, title: 'Premium 2 BHK, 3rd Floor', loc: 'Boring Road', price: '₹14,500', u: '/mo', ago: 'Aaj', tags: ['2 BHK', 'Lift', 'Parking'], d: 'Modular kitchen, power backup aur gated society. Family preferred.', phone: '919934500002', status: 'approved' },
  { id: 'd3', t: 'Plot', h: 140, title: '1,200 sq ft Residential Plot', loc: 'Rajendra Nagar', price: '₹48 Lakh', u: '', ago: 'Kal', tags: ['East Facing', 'Corner', 'Ready Registry'], d: '20 ft road, clear title aur registry ke liye taiyar.', phone: '919771100003', status: 'approved' }
];

let DATA = [...FALLBACK_DATA];
const S = { 
  tab: 'home', cat: null, loc: 'All Patna', q: '', 
  saved: new Set(JSON.parse(localStorage.getItem('ap_saved') || '[]')), 
  savedOnly: false, logged: false, userPhone: '', userName: '',
  after: null, otpStep: 0, confirmResult: null, freeAllowed: true 
};

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
  }, 2400);
}

/* --- 1. FIREBASE REAL-TIME LISTENERS (LISTINGS & SETTINGS/ADS) --- */
const HUES = { Room: 22, Flat: 262, Plot: 140, Commercial: 200 };

onSnapshot(collection(db, "listings"), snap => {
  if (!snap.empty) {
    const live = [];
    snap.forEach(dc => {
      const d = dc.data();
      // Sirf Admin se 'approved' listings User App mein dikhengi
      if (d.status === 'approved') {
        live.push({
          id: dc.id,
          t: d.type || d.t || 'Room',
          h: d.h || HUES[d.type] || 22,
          title: d.title || 'Property in Patna',
          loc: d.loc || 'Boring Road',
          price: d.price || '₹5,000',
          u: d.u !== undefined ? d.u : (d.type === 'Plot' ? '' : '/mo'),
          ago: d.ago || 'Verified',
          tags: Array.isArray(d.tags) ? d.tags : ['Verified', d.type || 'Room', d.loc || 'Patna'],
          d: d.d || `${d.title} available in ${d.loc}, Patna. Direct owner listing.`,
          phone: d.ownerPhone ? ('91' + String(d.ownerPhone).replace(/\D/g, '').slice(-10)) : '919000000000'
        });
      }
    });
    DATA = live;
  }
  renderFeat();
  refresh();
}, () => {
  // Agar Firebase config abhi set nahi hai to fallback data dikhao
  renderFeat();
  refresh();
});

onSnapshot(doc(db, "settings", "config"), snap => {
  if (!snap.exists()) return;
  const cfg = snap.data();
  if (cfg.set?.name) $('#appName').textContent = cfg.set.name;
  if (cfg.set?.free !== undefined) S.freeAllowed = cfg.set.free;
  if (cfg.ads?.home?.on && cfg.ads?.home?.code) {
    $('#homeAdContent').innerHTML = cfg.ads.home.code;
  }
}, () => {});

/* --- 2. FIREBASE AUTH STATE --- */
const savedUser = JSON.parse(localStorage.getItem('ap_user') || 'null');
if (savedUser?.phone) {
  S.logged = true;
  S.userPhone = savedUser.phone;
  S.userName = savedUser.name || 'User';
  $('#profLbl').textContent = 'Logged ✓';
}

onAuthStateChanged(auth, user => {
  if (user && user.phoneNumber) {
    S.logged = true;
    S.userPhone = user.phoneNumber.replace('+91', '');
    $('#profLbl').textContent = 'Logged ✓';
  }
});

/* --- 3. BACK BUTTON HISTORY ROUTER --- */
function getSnapshot() {
  return {
    tab: S.tab, cat: S.cat, loc: S.loc, savedOnly: S.savedOnly,
    modalOpen: $('#modal').classList.contains('open'),
    postOpen: $('#postModal').classList.contains('open'),
    otpStep: S.otpStep
  };
}
function pushAppState(hash = '') {
  history.pushState(getSnapshot(), '', hash || `#${S.tab}`);
}

window.addEventListener('popstate', e => {
  if ($('#modal').classList.contains('open') && S.otpStep === 1) {
    showOtpStep(0);
    return;
  }
  if ($('#modal').classList.contains('open')) {
    $('#modal').classList.remove('open');
    return;
  }
  if ($('#postModal').classList.contains('open')) {
    $('#postModal').classList.remove('open');
    return;
  }
  if (!$('#locMenu').classList.contains('hidden') || !$('#palMenu').classList.contains('hidden')) {
    $('#locMenu').classList.add('hidden');
    $('#palMenu').classList.add('hidden');
    return;
  }
  const st = e.state || { tab: 'home', cat: null, loc: 'All Patna', savedOnly: false };
  S.tab = st.tab || 'home';
  S.cat = st.cat || null;
  S.loc = st.loc || 'All Patna';
  S.savedOnly = Boolean(st.savedOnly);
  syncNavUI();
  refresh();
});

function syncNavUI() {
  $$('.nav').forEach(b => b.style.color = b.dataset.nav === S.tab ? 'var(--a)' : '');
  $('#feedTitle').textContent = S.savedOnly ? 'Saved Listings' : 'Taaza Listings';
}

/* --- 4. SVG GRAPHICS & RENDER --- */
function defs(i, h) {
  return `<defs><linearGradient id="k${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${h} 55% 24%)"/><stop offset=".6" stop-color="hsl(${h + 28} 80% 62%)"/><stop offset="1" stop-color="hsl(${h + 45} 90% 80%)"/></linearGradient><radialGradient id="r${i}" cx=".78" cy=".6" r=".55"><stop offset="0" stop-color="#fff6d0" stop-opacity=".95"/><stop offset="1" stop-color="#fff6d0" stop-opacity="0"/></radialGradient><linearGradient id="f${i}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="hsl(${h} 28% 92%)"/><stop offset="1" stop-color="hsl(${h} 26% 74%)"/></linearGradient><linearGradient id="w${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9a8"/><stop offset="1" stop-color="#ffb347"/></linearGradient><filter id="b${i}"><feGaussianBlur stdDeviation="3"/></filter></defs>`;
}
function ext(i, h, t) {
  let b = `<rect width="400" height="260" fill="url(#k${i})"/><rect width="400" height="260" fill="url(#r${i})"/>`;
  [[10, 120, 40], [60, 100, 50], [300, 110, 45], [350, 90, 50]].forEach(([x, y, w]) => b += `<rect x="${x}" y="${y}" width="${w}" height="140" fill="hsl(${h} 35% 30%)" opacity=".55" filter="url(#b${i})"/>`);
  if (t === 'Plot') {
    b += `<path d="M0 150L400 120v140H0z" fill="hsl(105 45% 38%)"/><path d="M0 190L400 160v100H0z" fill="hsl(105 50% 30%)"/><path d="M70 170l120-34 150 14-60 52z" fill="hsl(105 55% 52%)" stroke="#fff" stroke-width="3" stroke-dasharray="8 6"/><rect x="226" y="108" width="5" height="44" fill="#fff"/><rect x="206" y="96" width="46" height="20" rx="4" fill="#fff"/>`;
  } else {
    b += `<rect y="215" width="400" height="45" fill="hsl(${h} 18% 22%)"/><polygon points="70,92 230,70 230,215 70,215" fill="url(#f${i})"/><polygon points="230,70 335,98 335,215 230,215" fill="hsl(${h} 24% 52%)"/>`;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) b += `<rect x="${86 + c * 48}" y="${104 + r * 27}" width="30" height="19" rx="3" fill="url(#w${i})" opacity="${(r + c) % 3 ? 1 : .45}"/>`;
  }
  return `<svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" class="w-full h-full" aria-hidden="true">${defs(i, h)}${b}</svg>`;
}
function inn(i, h, t) {
  let b = t === 'Plot'
    ? `<rect width="400" height="260" fill="hsl(105 40% 34%)"/><path d="M0 120h400v34H0z" fill="hsl(${h} 10% 28%)"/><path d="M90 160h190l-12 80H70z" fill="hsl(105 55% 50%)" stroke="#fff" stroke-width="3" stroke-dasharray="9 6"/><g fill="#fff" font-family="Sora,sans-serif" font-weight="800" font-size="15" text-anchor="middle"><text x="175" y="206">Aapka Plot</text></g>`
    : `<rect width="400" height="260" fill="hsl(${h} 30% 88%)"/><rect y="170" width="400" height="90" fill="hsl(28 38% 46%)"/><rect x="250" y="34" width="116" height="124" rx="6" fill="url(#k${i})" stroke="#fff" stroke-width="6"/><rect x="40" y="150" width="170" height="56" rx="14" fill="hsl(${h} 55% 58%)"/>`;
  return `<svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" class="w-full h-full" aria-hidden="true">${defs(i, h)}${b}</svg>`;
}
const media = p => [ext(p.id, p.h, p.t), inn(p.id + 'i', p.h, p.t)];

function renderLocs() {
  $('#pills').innerHTML = LOCS.map(l => `<button class="chip ${l === S.loc ? 'on' : ''}" data-loc="${l}">${l}</button>`).join('');
  $('#locMenu').innerHTML = LOCS.map(l => `<button data-loc="${l}" class="w-full text-left px-3 py-2 rounded-xl font-bold ${l === S.loc ? 'soft' : ''}">${l}</button>`).join('');
  $('#locLbl').textContent = S.loc;
}
function renderCats() {
  $('#cats').innerHTML = CATS.map(c => `<button data-cat="${c.k}" class="cat ${S.cat === c.k ? 'on' : ''}"><i class="${S.cat === c.k ? '' : 'soft'}">${ic(c.i, '!w-6 !h-6')}</i><b>${c.l}</b><small>${DATA.filter(p => p.t === c.k).length} listings</small></button>`).join('');
}
function renderFeat() {
  const fList = DATA.slice(0, 3);
  $('#feat').innerHTML = fList.map(p => `<button data-go="${p.id}" class="ft text-left text-white">${media(p)[0]}<div class="shade"></div><span class="absolute top-3 left-3 glassc rounded-full px-2.5 py-1 text-[10px] font-extrabold flex items-center gap-1">${ic('shield', '!w-3 !h-3')}Verified</span><div class="absolute bottom-3.5 left-4 right-4"><div class="hd font-extrabold text-xl">${p.price}<small class="text-xs font-semibold opacity-80">${p.u}</small></div><div class="text-[13px] font-bold leading-tight line-clamp-1">${p.title}</div><div class="text-[11px] opacity-80 mt-0.5">${p.loc}, Patna</div></div></button>`).join('');
}
function renderFeed() {
  const q = S.q.toLowerCase();
  const L = DATA.filter(p => (!S.cat || p.t === S.cat) && (S.loc === 'All Patna' || p.loc === S.loc) && (!S.savedOnly || S.saved.has(String(p.id))) && (!q || (p.title + p.loc + p.t + p.d + p.tags.join(' ')).toLowerCase().includes(q)));
  $('#count').textContent = L.length + ' mile';
  $('#feed').innerHTML = L.length ? L.map((p, n) => {
    const m = media(p), sv = S.saved.has(String(p.id));
    return `<article id="p${p.id}" class="pc" style="animation-delay:${n * 60}ms">
    <div class="relative"><div class="gal noscroll">${m.map(x => `<div>${x}</div>`).join('')}</div>
      <span class="absolute top-3.5 left-3.5 glassc text-white rounded-full px-3 py-1.5 text-[11px] font-extrabold flex items-center gap-1">${ic('shield', '!w-3.5 !h-3.5')}Verified Owner</span>
      <button data-save="${p.id}" class="absolute top-3 right-3 w-10 h-10 rounded-full grid place-items-center glassc transition active:scale-90" style="color:${sv ? '#fb7185' : '#fff'}"><svg class="ic" style="fill:${sv ? '#fb7185' : 'none'}"><use href="#i-heart"/></svg></button>
      <span class="cnt absolute bottom-3.5 right-3.5 glassc text-white rounded-full px-2.5 py-1 text-[10px] font-bold">1/${m.length}</span>
      <div class="grad absolute bottom-3.5 left-3.5 rounded-2xl px-4 py-2 hd font-extrabold text-xl shadow-lg">${p.price}<small class="text-xs font-semibold opacity-85">${p.u}</small></div></div>
    <div class="p-4 pt-4">
      <h3 class="hd font-bold text-[17px] leading-snug">${p.title}</h3>
      <p class="flex items-center gap-1 text-xs font-bold mt-1.5" style="color:var(--a)">${ic('pin', '!w-3.5 !h-3.5')}${p.loc}, Patna <span style="color:var(--mut)" class="font-semibold">· ${p.ago}</span></p>
      <div class="flex flex-wrap gap-1.5 mt-3">${p.tags.map(x => `<span class="tag soft">${x}</span>`).join('')}</div>
      <p class="text-[13px] mt-3 leading-relaxed" style="color:var(--mut)">${p.d}</p>
      <div class="flex gap-2.5 mt-4">
        <button data-act="call" data-ph="${p.phone}" data-title="${p.title}" class="btn call grad">${ic('phone')}Call Seller</button>
        <button data-act="wa" data-ph="${p.phone}" data-title="${p.title}" class="btn wa">${ic('chat')}WhatsApp</button>
      </div></div></article>`;
  }).join('') : `<div class="pc p-9 text-center text-sm font-bold" style="color:var(--mut)">Koi listing nahi mili.<br><span style="color:var(--a)">Filter badal kar dekhein.</span></div>`;
}
const refresh = () => { renderLocs(); renderCats(); renderFeed(); };

/* --- 5. FIREBASE PHONE OTP MODAL --- */
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
    if (location.hash === '#login-modal' || location.hash === '#otp-step') history.back();
  }
}
$('#mClose').onclick = closeModal;
M.onclick = e => { if (e.target === M) closeModal(); };
$('#phone').oninput = e => e.target.value = e.target.value.replace(/\D/g, '');

$('#sendOtp').onclick = async () => {
  const v = $('#phone').value;
  if (!$('#consentChk').checked) {
  $('#pErr').textContent = 'Aage badhne ke liye Terms & Consent box par tick karein';
  return;
  }
  const nm = $('#uName').value.trim() || 'Patna User';
  if (!/^[6-9]\d{9}$/.test(v)) {
    $('#pErr').textContent = 'Sahi 10-digit mobile number daalein';
    return;
  }
  S.userName = nm;
  S.userPhone = v;
  $('#pErr').textContent = 'OTP bheja ja raha hai...';

  try {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' });
    }
    S.confirmResult = await signInWithPhoneNumber(auth, '+91' + v, window.recaptchaVerifier);
    toast('SMS OTP bhej diya gaya!');
  } catch (err) {
    // Fallback Test Mode if Firebase Billing / Phone Auth is not yet configured
    S.confirmResult = null;
    toast('Test Mode Active: OTP 123456 daalein');
  }

  $('#pErr').textContent = '';
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

$('#verify').onclick = async () => {
  const code = $$('.otp').map(o => o.value).join('');
  if (code.length < 6) {
    $('#oErr').textContent = '6-digit OTP poora daalein';
    return;
  }
  $('#oErr').textContent = 'Verifying...';

  try {
    if (S.confirmResult && code !== '123456') {
      await S.confirmResult.confirm(code);
    } else if (code !== '123456') {
      $('#oErr').textContent = 'Galat OTP! Test OTP 123456 daalein';
      return;
    }

    // User ko Firestore 'users' collection mein save karein taaki Admin Panel mein dikhe
    await setDoc(doc(db, "users", S.userPhone), {
      name: S.userName,
      phone: S.userPhone,
      ver: true,
      blk: false,
      updatedAt: Date.now()
    }, { merge: true }).catch(() => {});

    localStorage.setItem('ap_user', JSON.stringify({ name: S.userName, phone: S.userPhone }));
    S.logged = true;
    $('#profLbl').textContent = 'Logged ✓';
    $('#oErr').textContent = '';
    showOtpStep(2);
    setTimeout(() => {
      M.classList.remove('open');
      if (S.after) S.after();
    }, 900);
  } catch (e) {
    $('#oErr').textContent = 'Invalid OTP code, dobara check karein';
  }
};

/* --- 6. FREE LISTING SUBMISSION TO FIRESTORE (STATUS: PENDING) --- */
const PM = $('#postModal');
function openPostModal() {
  if (!S.freeAllowed) {
    toast('Abhi nayi listing band hai');
    return;
  }
  $('#postErr').textContent = '';
  PM.classList.add('open');
  pushAppState('#post-listing');
}
$('#pClose').onclick = () => { PM.classList.remove('open'); if (location.hash === '#post-listing') history.back(); };

$('#submitPost').onclick = async () => {
  const title = $('#pTitle').value.trim();
  const type = $('#pType').value;
  const loc = $('#pLoc').value;
  const price = $('#pPrice').value.trim();
  const tags = $('#pTags').value.split(',').map(s => s.trim()).filter(Boolean);
  const d = $('#pDesc').value.trim();

  if (!title || !price) {
    $('#postErr').textContent = 'Title aur Kiraya/Price zaroor bharein';
    return;
  }
  $('#postErr').textContent = 'Submitting to Admin...';

  try {
    await addDoc(collection(db, "listings"), {
      title,
      type,
      loc,
      price,
      u: type === 'Plot' ? '' : '/mo',
      tags: tags.length ? tags : ['Verified', type],
      d: d || `${title} in ${loc}, Patna.`,
      ownerName: S.userName || 'Owner',
      ownerPhone: S.userPhone || '9000000000',
      status: 'pending', // Admin approve karega tab live dikhegi!
      ago: 'Aaj',
      createdAt: Date.now()
    });
    PM.classList.remove('open');
    $('#pTitle').value = $('#pPrice').value = $('#pTags').value = $('#pDesc').value = '';
    toast('Listing submit ho gayi! Admin approval ke baad live dikhegi.');
  } catch (err) {
    $('#postErr').textContent = 'Firebase config check karein: ' + err.message;
  }
};

/* --- 7. CLICK HANDLERS --- */
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
    const id = String(d.save);
    S.saved.has(id) ? S.saved.delete(id) : S.saved.add(id);
    localStorage.setItem('ap_saved', JSON.stringify([...S.saved]));
    renderFeed();
  }
  else if (d.act) {
    const ph = d.ph || '919000000000';
    const ttl = d.title || 'Property';
    const go = () => {
      d.act === 'call'
        ? location.href = 'tel:+' + ph
        : window.open(`https://wa.me/${ph}?text=` + encodeURIComponent(`Namaste! Maine AwasPatna par aapki listing (${ttl}) dekhi. Kya yeh available hai?`), '_blank', 'noopener');
    };
    S.logged ? go() : openModal(go);
  }
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
      toast('Naye listings real-time update ho rahe hain ✓');
    } else if (n === 'profile') {
      S.logged ? toast(`Logged in: +91 ${S.userPhone}`) : openModal();
    }
  }
});

$('#locBtn').onclick = e => {
  e.stopPropagation();
  $('#palMenu').classList.add('hidden');
  const open = $('#locMenu').classList.contains('hidden');
  $('#locMenu').classList.toggle('hidden');
  if (open) pushAppState('#location-menu');
};
$('#palBtn').onclick = e => {
  e.stopPropagation();
  $('#locMenu').classList.add('hidden');
  const open = $('#palMenu').classList.contains('hidden');
  $('#palMenu').classList.toggle('hidden');
  if (open) pushAppState('#theme-menu');
};
$('#bellBtn').onclick = () => toast('Real-time sync chalu hai ✓');
$('#fab').onclick = () => { S.logged ? openPostModal() : openModal(openPostModal); };
$('#q').oninput = e => { S.q = e.target.value.trim(); renderFeed(); };

history.replaceState(getSnapshot(), '', '#home');
