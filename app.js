import { 
  db, auth, googleProvider, signInWithPopup,
  collection, doc, onSnapshot, addDoc, setDoc, deleteDoc, getDoc, query, where, limit,
  RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged, signOut 
} from "./firebase-config.js";

const LOCS = [
  'All Patna', 'Boring Road', 'Kankarbagh', 'Rajendra Nagar', 'Patliputra', 
  'Bailey Road', 'Danapur', 'Kumhrar', 'Ashok Rajpath', 'Fraser Road', 
  'Exhibition Road', 'Gandhi Maidan', 'Anisabad', 'Phulwari Sharif', 'Digha', 
  'Rajiv Nagar', 'Keshri Nagar', 'Ashiana Nagar', 'Rukanpura', 'Saguna More', 
  'Gola Road', 'RPS More', 'Khajpura', 'Jagdeo Path', 'Raja Bazar', 
  'Punaichak', 'Shivpuri', 'Patel Nagar', 'Shastri Nagar', 'Gardanibagh', 
  'Mithapur', 'Sipara', 'Beur', 'ByPass Road', 'Zero Mile', 'Bazar Samiti', 
  'Musallahpur Hat', 'Bhikhna Pahari', 'Mahendru', 'Sultanganj', 'Agamkuan', 
  'Gulzarbagh', 'Patna City', 'Didarganj', 'Fatuha', 'Khagaul', 'Neora', 'Bihta'
];

const BUDGETS = [
  { k: 'all', l: 'Sab Budget' },
  { k: 'u5', l: '₹5,000 tak' },
  { k: '5to10', l: '₹5k – ₹10k' },
  { k: '10to20', l: '₹10k – ₹20k' },
  { k: '20p', l: '₹20,000+' }
];

const CATS = [
  { k: 'Room', l: 'Room / PG', i: 'bed' },
  { k: 'Flat', l: 'Flat', i: 'flat' },
  { k: 'Plot', l: 'Plot/Zameen', i: 'plot' },
  { k: 'Commercial', l: 'Commercial', i: 'shop' }
];

const FALLBACK_DATA = [
  { id: 'd1', t: 'Room', h: 22, title: 'Furnished Single Room + Attached Bath', loc: 'Kankarbagh', price: '₹4,200', numPrice: 4200, u: '/mo', ago: 'Aaj', tags: ['Furnished', 'WiFi', '24×7 Water'], d: 'Ground floor room, students aur working professionals ke liye ideal.', phone: '919812300001', ownerName: 'Verified Owner', photos: [], status: 'approved' },
  { id: 'd2', t: 'Flat', h: 262, title: 'Premium 2 BHK, 3rd Floor', loc: 'Boring Road', price: '₹14,500', numPrice: 14500, u: '/mo', ago: 'Aaj', tags: ['2 BHK', 'Lift', 'Parking'], d: 'Modular kitchen, power backup aur gated society. Family preferred.', phone: '919934500002', ownerName: 'Verified Owner', photos: [], status: 'approved' },
  { id: 'd3', t: 'Plot', h: 140, title: '1,200 sq ft Residential Plot', loc: 'Rajendra Nagar', price: '₹48 Lakh', numPrice: 4800000, u: '', ago: 'Kal', tags: ['East Facing', 'Corner', 'Ready Registry'], d: '20 ft road, clear title aur registry ke liye taiyar.', phone: '919771100003', ownerName: 'Verified Owner', photos: [], status: 'approved' }
];

const PAGE_SIZE = 10;
let DATA = [...FALLBACK_DATA];
let MY_LISTINGS = [];
let myListingsUnsub = null;
let knownListingIds = new Set();
let firstLoadDone = false;

const S = { 
  tab: 'home', cat: null, loc: 'All Patna', budget: 'all', q: '', pageLimit: PAGE_SIZE,
  saved: new Set(JSON.parse(localStorage.getItem('ap_saved') || '[]')), 
  savedOnly: false, logged: false, uid: null, userPhone: '', userName: '',
  after: null, otpStep: 0, confirmResult: null, freeAllowed: true,
  photo1: null, photo2: null
};

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const ic = (n, c = '') => `<svg class="ic ${c}"><use href="#i-${n}"/></svg>`;

const esc = str => String(str ?? '').replace(/[&<>"']/g, m => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[m]));

function parseNumericPrice(priceStr) {
  const s = String(priceStr || '').toLowerCase();
  const num = parseFloat(s.replace(/[^0-9.]/g, '')) || 0;
  if (s.includes('cr')) return num * 10000000;
  if (s.includes('lakh') || s.includes('lac')) return num * 100000;
  if (s.includes('k')) return num * 1000;
  return num;
}

function matchesBudget(numPrice, bKey) {
  if (!bKey || bKey === 'all') return true;
  if (bKey === 'u5') return numPrice > 0 && numPrice <= 5000;
  if (bKey === '5to10') return numPrice > 5000 && numPrice <= 10000;
  if (bKey === '10to20') return numPrice > 10000 && numPrice <= 20000;
  if (bKey === '20p') return numPrice > 20000;
  return true;
}

function formatWhatsAppAndCallPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length >= 10) return '91' + digits.slice(-10);
  return '';
}

function toast(m) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = m;
  t.style.opacity = 1;
  t.style.transform = 'translate(-50%,-8px)';
  clearTimeout(toast.x);
  toast.x = setTimeout(() => {
    t.style.opacity = 0;
    t.style.transform = 'translate(-50%,0)';
  }, 2500);
}

/* --- 0. 7-SECOND STRICT AUTO-REMOVE INSTALL POPUP --- */
let deferredInstallPrompt = null;
const installPopup = $('#userInstallPopup');

function removeInstallPopup() {
  if (!installPopup) return;
  installPopup.style.opacity = '0';
  installPopup.style.pointerEvents = 'none';
  setTimeout(() => installPopup.remove(), 300);
}

const installTimer = setTimeout(removeInstallPopup, 7000);

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
});

if ($('#popupCloseBtn')) {
  $('#popupCloseBtn').onclick = () => {
    clearTimeout(installTimer);
    removeInstallPopup();
  };
}

if ($('#popupInstallBtn')) {
  $('#popupInstallBtn').onclick = async () => {
    clearTimeout(installTimer);
    removeInstallPopup();
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
    } else {
      toast('Chrome ke 3-dot menu (⋮) se "Add to Home screen / Install App" dabayein');
    }
  };
}

/* --- 1. PUSH NOTIFICATION PERMISSION SYSTEM --- */
function updateNotifBadge() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted' && $('#alertLbl')) {
    $('#alertLbl').textContent = 'Alerts ON';
  }
}

async function askNotificationPermission() {
  $('#notifModal')?.classList.remove('open');
  if (window.Android && typeof window.Android.requestNotificationPermission === 'function') {
    window.Android.requestNotificationPermission();
  }
  if (!('Notification' in window)) {
    toast('App Notifications Enabled ✓');
    return;
  }
  try {
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      localStorage.setItem('ap_notif_granted', 'true');
      updateNotifBadge();
      toast('Notifications Chalu Ho Gayi ✓');
      sendLocalNotification('AwasPatna Alerts Active ✓', 'Ab Patna mein naye Room, Flat ya Plot aate hi aapko turant khabar milegi!');
      if (auth.currentUser) {
        setDoc(doc(db, "users", auth.currentUser.uid), { notifEnabled: true, notifUpdatedAt: Date.now() }, { merge: true }).catch(() => {});
      }
    } else {
      toast('Notification permission allow nahi ki gayi');
    }
  } catch (e) {
    toast('Browser settings se Notification Allow karein');
  }
}

async function sendLocalNotification(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg && reg.showNotification) {
      reg.showNotification(title, {
        body,
        icon: './logo.svg',
        badge: './logo.svg',
        vibrate: [200, 100, 200]
      });
    } else {
      new Notification(title, { body });
    }
  } catch (e) {}
}

if ($('#notifAllow')) $('#notifAllow').onclick = askNotificationPermission;
if ($('#notifLater')) $('#notifLater').onclick = () => $('#notifModal').classList.remove('open');

setTimeout(() => {
  if ('Notification' in window && Notification.permission === 'default' && !sessionStorage.getItem('ap_notif_asked')) {
    sessionStorage.setItem('ap_notif_asked', '1');
    $('#notifModal')?.classList.add('open');
  }
  updateNotifBadge();
}, 8000);

/* --- 2. ULTRA-LIGHT WEBP 16:10 IMAGE AUTO-CROPPER (~50KB PER IMAGE) --- */
function cropImageToFixedRatio(file, targetW = 720, targetH = 450, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');

        const targetRatio = targetW / targetH;
        const srcRatio = img.width / img.height;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;

        if (srcRatio > targetRatio) {
          sw = img.height * targetRatio;
          sx = (img.width - sw) / 2;
        } else {
          sh = img.width / targetRatio;
          sy = (img.height - sh) / 2;
        }

        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
        // Try modern WebP format first (3x smaller & faster than JPEG)
        let out = canvas.toDataURL('image/webp', quality);
        if (!out.startsWith('data:image/webp')) {
          out = canvas.toDataURL('image/jpeg', quality);
        }
        resolve(out);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

if ($('#imgIn1')) {
  $('#imgIn1').onchange = async e => {
    const f = e.target.files?.[0];
    if (!f) return;
    toast('Photo 1 fast WebP mein optimize ho rahi hai...');
    try {
      S.photo1 = await cropImageToFixedRatio(f);
      $('#prev1').src = S.photo1;
      $('#prev1').classList.remove('hidden');
      $('#ph1').classList.add('hidden');
    } catch (err) {
      toast('Photo load karne mein samasya aayi');
    }
  };
}

if ($('#imgIn2')) {
  $('#imgIn2').onchange = async e => {
    const f = e.target.files?.[0];
    if (!f) return;
    toast('Photo 2 fast WebP mein optimize ho rahi hai...');
    try {
      S.photo2 = await cropImageToFixedRatio(f);
      $('#prev2').src = S.photo2;
      $('#prev2').classList.remove('hidden');
      $('#ph2').classList.add('hidden');
    } catch (err) {
      toast('Photo load karne mein samasya aayi');
    }
  };
}

/* --- 3. FIREBASE REAL-TIME LISTENERS (BOUNDED QUERY FOR SPEED) --- */
const HUES = { Room: 22, Flat: 262, Plot: 140, Commercial: 200 };
const approvedQuery = query(collection(db, "listings"), where("status", "==", "approved"), limit(150));

onSnapshot(approvedQuery, snap => {
  if (!snap.empty) {
    const live = [];
    snap.forEach(dc => {
      const d = dc.data();
      if (firstLoadDone && !knownListingIds.has(dc.id)) {
        sendLocalNotification(`Nayi Listing: ${d.type || 'Room'} in ${d.loc}`, `${d.title} · ${d.price}`);
      }
      knownListingIds.add(dc.id);

      const cleanOwnerPhone = formatWhatsAppAndCallPhone(d.ownerPhone);
      const priceText = d.price || '₹5,000';

      live.push({
        id: dc.id,
        t: d.type || d.t || 'Room',
        h: Number(d.h) || HUES[d.type] || 22,
        title: d.title || 'Property in Patna',
        loc: d.loc || 'Boring Road',
        price: priceText,
        numPrice: d.numPrice || parseNumericPrice(priceText),
        u: d.u !== undefined ? d.u : (d.type === 'Plot' ? '' : '/mo'),
        ago: d.ago || 'Verified',
        tags: Array.isArray(d.tags) ? d.tags.slice(0, 6) : ['Verified', d.type || 'Room'],
        d: d.d || `${d.title} available in ${d.loc}, Patna.`,
        ownerName: d.ownerName || 'Verified Owner',
        ownerUid: d.ownerUid || '',
        phone: cleanOwnerPhone,
        photos: Array.isArray(d.photos) ? d.photos.filter(Boolean) : [],
        createdAt: d.createdAt || 0
      });
    });
    firstLoadDone = true;
    live.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    DATA = live;
  } else {
    DATA = [];
  }
  renderFeat();
  refresh();
}, () => {
  renderFeat();
  refresh();
});

onSnapshot(doc(db, "settings", "config"), snap => {
  if (!snap.exists()) return;
  const cfg = snap.data();
  if (cfg.set?.name) $('#appName').textContent = cfg.set.name;
  if (cfg.set?.free !== undefined) S.freeAllowed = Boolean(cfg.set.free);
  if (cfg.ads?.home?.on && cfg.ads?.home?.code) {
    $('#homeAdContent').innerHTML = cfg.ads.home.code;
  }
}, () => {});

/* --- 4. FIREBASE AUTH + CLOUD SAVED FAVORITES SYNC + OWNER LISTINGS --- */
onAuthStateChanged(auth, async user => {
  if (myListingsUnsub) {
    myListingsUnsub();
    myListingsUnsub = null;
  }

  if (user) {
    S.logged = true;
    S.uid = user.uid;
    const authPhone = String(user.phoneNumber || '').replace(/\D/g, '').slice(-10);
    const savedProfile = JSON.parse(localStorage.getItem('ap_user') || 'null');
    S.userPhone = authPhone || savedProfile?.phone || '';
    S.userName = savedProfile?.name || user.displayName || 'Verified Owner';

    try {
      const uSnap = await getDoc(doc(db, "users", user.uid));
      if (uSnap.exists()) {
        const uData = uSnap.data();
        if (uData.phone) S.userPhone = String(uData.phone).replace(/\D/g, '').slice(-10);
        if (uData.name) S.userName = uData.name;
        // Restore cloud-synced saved listings
        if (Array.isArray(uData.savedListings)) {
          uData.savedListings.forEach(id => S.saved.add(String(id)));
          localStorage.setItem('ap_saved', JSON.stringify([...S.saved]));
          renderFeed();
        }
      }
    } catch (e) {}

    if ($('#pOwnerPhone') && S.userPhone) {
      $('#pOwnerPhone').value = S.userPhone;
    }

    $('#profLbl').textContent = 'My Listings';

    const myQuery = query(collection(db, "listings"), where("ownerUid", "==", user.uid));
    myListingsUnsub = onSnapshot(myQuery, snap => {
      const arr = [];
      snap.forEach(dc => arr.push({ id: dc.id, ...dc.data() }));
      arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      MY_LISTINGS = arr;
      if (S.tab === 'profile') renderFeed();
    }, () => {
      if (S.tab === 'profile') renderFeed();
    });
  } else {
    S.logged = false;
    S.uid = null;
    S.userPhone = '';
    MY_LISTINGS = [];
    $('#profLbl').textContent = 'Profile';
    if (S.tab === 'profile') renderFeed();
  }
});

/* --- 5. BACK BUTTON HISTORY ROUTER --- */
function getSnapshot() {
  return {
    tab: S.tab, cat: S.cat, loc: S.loc, budget: S.budget, savedOnly: S.savedOnly,
    modalOpen: $('#modal').classList.contains('open'),
    postOpen: $('#postModal').classList.contains('open'),
    policyOpen: $('#policyModal').classList.contains('open'),
    otpStep: S.otpStep
  };
}
function pushAppState(hash = '') {
  history.pushState(getSnapshot(), '', hash || `#${S.tab}`);
}

window.addEventListener('popstate', e => {
  if ($('#notifModal')?.classList.contains('open')) {
    $('#notifModal').classList.remove('open');
    return;
  }
  if ($('#policyModal')?.classList.contains('open')) {
    $('#policyModal').classList.remove('open');
    return;
  }
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
  const st = e.state || { tab: 'home', cat: null, loc: 'All Patna', budget: 'all', savedOnly: false };
  S.tab = st.tab || 'home';
  S.cat = st.cat || null;
  S.loc = st.loc || 'All Patna';
  S.budget = st.budget || 'all';
  S.savedOnly = Boolean(st.savedOnly);
  syncNavUI();
  refresh();
});

function syncNavUI() {
  $$('.nav').forEach(b => b.style.color = b.dataset.nav === S.tab ? 'var(--a)' : '');
  if (S.tab === 'profile') {
    $('#feedTitle').textContent = 'Mera Owner Dashboard';
  } else if (S.savedOnly) {
    $('#feedTitle').textContent = 'Saved Listings';
  } else {
    $('#feedTitle').textContent = 'Taaza Listings';
  }
}

/* --- 6. MEDIA (ASYNC DECODING + LAZY LOADING FOR 60FPS SCROLL) --- */
function defs(i, h) {
  return `<defs><linearGradient id="k${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${h} 55% 24%)"/><stop offset=".6" stop-color="hsl(${h + 28} 80% 62%)"/><stop offset="1" stop-color="hsl(${h + 45} 90% 80%)"/></linearGradient><radialGradient id="r${i}" cx=".78" cy=".6" r=".55"><stop offset="0" stop-color="#fff6d0" stop-opacity=".95"/><stop offset="1" stop-color="#fff6d0" stop-opacity="0"/></radialGradient><linearGradient id="f${i}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="hsl(${h} 28% 92%)"/><stop offset="1" stop-color="hsl(${h} 26% 74%)"/></linearGradient><linearGradient id="w${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9a8"/><stop offset="1" stop-color="#ffb347"/></linearGradient><filter id="b${i}"><feGaussianBlur stdDeviation="3"/></filter></defs>`;
}
function ext(i, h, t) {
  const safeId = esc(i);
  let b = `<rect width="400" height="260" fill="url(#k${safeId})"/><rect width="400" height="260" fill="url(#r${safeId})"/>`;
  [[10, 120, 40], [60, 100, 50], [300, 110, 45], [350, 90, 50]].forEach(([x, y, w]) => b += `<rect x="${x}" y="${y}" width="${w}" height="140" fill="hsl(${h} 35% 30%)" opacity=".55" filter="url(#b${safeId})"/>`);
  if (t === 'Plot') {
    b += `<path d="M0 150L400 120v140H0z" fill="hsl(105 45% 38%)"/><path d="M0 190L400 160v100H0z" fill="hsl(105 50% 30%)"/><path d="M70 170l120-34 150 14-60 52z" fill="hsl(105 55% 52%)" stroke="#fff" stroke-width="3" stroke-dasharray="8 6"/>`;
  } else {
    b += `<rect y="215" width="400" height="45" fill="hsl(${h} 18% 22%)"/><polygon points="70,92 230,70 230,215 70,215" fill="url(#f${safeId})"/><polygon points="230,70 335,98 335,215 230,215" fill="hsl(${h} 24% 52%)"/>`;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) b += `<rect x="${86 + c * 48}" y="${104 + r * 27}" width="30" height="19" rx="3" fill="url(#w${safeId})" opacity="${(r + c) % 3 ? 1 : .45}"/>`;
  }
  return `<svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" class="w-full h-full" aria-hidden="true">${defs(safeId, h)}${b}</svg>`;
}
function inn(i, h, t) {
  const safeId = esc(i);
  let b = t === 'Plot'
    ? `<rect width="400" height="260" fill="hsl(105 40% 34%)"/><path d="M0 120h400v34H0z" fill="hsl(${h} 10% 28%)"/><path d="M90 160h190l-12 80H70z" fill="hsl(105 55% 50%)" stroke="#fff" stroke-width="3" stroke-dasharray="9 6"/>`
    : `<rect width="400" height="260" fill="hsl(${h} 30% 88%)"/><rect y="170" width="400" height="90" fill="hsl(28 38% 46%)"/><rect x="250" y="34" width="116" height="124" rx="6" fill="url(#k${safeId})" stroke="#fff" stroke-width="6"/><rect x="40" y="150" width="170" height="56" rx="14" fill="hsl(${h} 55% 58%)"/>`;
  return `<svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" class="w-full h-full" aria-hidden="true">${defs(safeId, h)}${b}</svg>`;
}

const media = p => {
  if (Array.isArray(p.photos) && p.photos.length > 0) {
    return p.photos.map(src => `<img src="${esc(src)}" class="w-full h-full object-cover" loading="lazy" decoding="async" alt="${esc(p.title)}">`);
  }
  return [ext(p.id, p.h || 22, p.t || p.type || 'Room'), inn(p.id + 'i', p.h || 22, p.t || p.type || 'Room')];
};

function renderLocs() {
  $('#pills').innerHTML = LOCS.map(l => `<button class="chip ${l === S.loc ? 'on' : ''}" data-loc="${esc(l)}">${esc(l)}</button>`).join('');
  if ($('#budgetPills')) {
    $('#budgetPills').innerHTML = BUDGETS.map(b => `<button class="chip !py-1 !px-3 !text-xs ${b.k === S.budget ? 'on' : ''}" data-budget="${esc(b.k)}">💰 ${esc(b.l)}</button>`).join('');
  }
  $('#locMenu').innerHTML = LOCS.map(l => `<button data-loc="${esc(l)}" class="w-full text-left px-3 py-2 rounded-xl font-bold ${l === S.loc ? 'soft' : ''}">${esc(l)}</button>`).join('');
  $('#pLoc').innerHTML = LOCS.filter(l => l !== 'All Patna').map(l => `<option value="${esc(l)}">${esc(l)}</option>`).join('');
  $('#locLbl').textContent = S.loc;
}
function renderCats() {
  $('#cats').innerHTML = CATS.map(c => `<button data-cat="${esc(c.k)}" class="cat ${S.cat === c.k ? 'on' : ''}"><i class="${S.cat === c.k ? '' : 'soft'}">${ic(c.i, '!w-6 !h-6')}</i><b>${esc(c.l)}</b><small>${DATA.filter(p => p.t === c.k).length} listings</small></button>`).join('');
}
function renderFeat() {
  const fList = DATA.slice(0, 4);
  $('#feat').innerHTML = fList.map(p => `<button data-go="${esc(p.id)}" class="ft text-left text-white">${media(p)[0]}<div class="shade"></div><span class="absolute top-3 left-3 glassc rounded-full px-2.5 py-1 text-[10px] font-extrabold flex items-center gap-1">${ic('shield', '!w-3 !h-3')}Verified</span><div class="absolute bottom-3.5 left-4 right-4"><div class="hd font-extrabold text-xl">${esc(p.price)}<small class="text-xs font-semibold opacity-80">${esc(p.u)}</small></div><div class="text-[13px] font-bold leading-tight line-clamp-1">${esc(p.title)}</div><div class="text-[11px] opacity-80 mt-0.5">${esc(p.loc)}, Patna</div></div></button>`).join('');
}

/* --- 7. OWNER PERSONAL DASHBOARD --- */
function renderOwnerDashboard() {
  if (!S.logged) {
    $('#count').textContent = 'Login Required';
    $('#feed').innerHTML = `
      <div class="pc p-7 text-center">
        <div class="grad w-16 h-16 rounded-3xl mx-auto grid place-items-center shadow-lg mb-4">${ic('user', '!w-8 !h-8')}</div>
        <h3 class="hd font-extrabold text-xl">Owner Dashboard</h3>
        <p class="text-xs mt-1.5 leading-relaxed" style="color:var(--mut)">Apni daali gayi properties dekhne, nayi property jodne ya bik chuki property ko delete karne ke liye Google ya OTP se login karein.</p>
        <button data-dash-login class="btn call grad w-full mt-5">Google / Mobile Se Login Karein</button>
      </div>`;
    return;
  }

  const myPhone10 = String(S.userPhone || '').replace(/\D/g, '').slice(-10);
  const combinedMap = new Map();
  MY_LISTINGS.forEach(item => combinedMap.set(item.id, item));
  DATA.forEach(item => {
    const itemPh10 = String(item.phone || '').replace(/\D/g, '').slice(-10);
    if ((S.uid && item.ownerUid === S.uid) || (myPhone10 && itemPh10 === myPhone10)) {
      if (!combinedMap.has(item.id)) {
        combinedMap.set(item.id, { ...item, status: 'approved' });
      }
    }
  });

  const myAll = [...combinedMap.values()];
  const liveCount = myAll.filter(x => x.status === 'approved').length;
  const pendCount = myAll.filter(x => x.status !== 'approved').length;

  $('#count').textContent = `${myAll.length} Total`;

  $('#feed').innerHTML = `
    <div class="pc p-5 mb-5">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <span class="grad w-12 h-12 rounded-2xl grid place-items-center hd font-extrabold text-lg shrink-0">${esc((S.userName || 'O')[0].toUpperCase())}</span>
          <div class="min-w-0">
            <h3 class="hd font-extrabold text-base truncate">${esc(S.userName || 'Verified Owner')}</h3>
            <p class="text-xs font-bold flex items-center gap-1" style="color:var(--a)">✓ ${myPhone10 ? '+91 ' + esc(myPhone10) : 'Google Verified'}</p>
          </div>
        </div>
        <button data-dash-logout class="soft px-3 py-2 rounded-xl text-xs font-extrabold shrink-0">Logout</button>
      </div>

      <div class="grid grid-cols-3 gap-2.5 mt-4 text-center">
        <div class="p-3 rounded-2xl" style="background:var(--bg);border:1px solid var(--line)">
          <div class="hd font-extrabold text-xl" style="color:var(--a)">${myAll.length}</div>
          <div class="text-[10.5px] font-bold" style="color:var(--mut)">Total Post</div>
        </div>
        <div class="p-3 rounded-2xl" style="background:var(--bg);border:1px solid var(--line)">
          <div class="hd font-extrabold text-xl text-green-600">${liveCount}</div>
          <div class="text-[10.5px] font-bold" style="color:var(--mut)">Live App Par</div>
        </div>
        <div class="p-3 rounded-2xl" style="background:var(--bg);border:1px solid var(--line)">
          <div class="hd font-extrabold text-xl text-amber-600">${pendCount}</div>
          <div class="text-[10.5px] font-bold" style="color:var(--mut)">Pending</div>
        </div>
      </div>

      <button data-dash-add class="btn call grad w-full mt-4">${ic('plus')}Nayi Property / Room Dalein (Free)</button>
    </div>

    <div class="mb-3 flex items-center justify-between px-1">
      <h4 class="hd font-extrabold text-sm">Meri Daali Gayi Properties (${myAll.length})</h4>
      <span class="text-[11px] font-bold" style="color:var(--mut)">Bik jane par Delete karein</span>
    </div>

    ${myAll.length ? myAll.map(item => {
      const isLive = item.status === 'approved';
      const statusBadge = isLive
        ? `<span class="tag" style="background:#dcfce7;color:#15803d">● LIVE ON APP</span>`
        : `<span class="tag" style="background:#fef3c7;color:#b45309">● PENDING APPROVAL</span>`;
      const thumb = (Array.isArray(item.photos) && item.photos[0])
        ? `<img src="${esc(item.photos[0])}" class="w-20 h-20 rounded-2xl object-cover shrink-0" loading="lazy" decoding="async">`
        : `<div class="w-20 h-20 rounded-2xl overflow-hidden shrink-0">${ext(item.id, 22, item.type || item.t || 'Room')}</div>`;

      return `
      <div class="pc p-4 mb-4">
        <div class="flex gap-3 items-center">
          ${thumb}
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-1 mb-1">${statusBadge}</div>
            <h4 class="hd font-bold text-sm truncate">${esc(item.title)}</h4>
            <p class="text-xs font-bold mt-0.5" style="color:var(--a)">${esc(item.loc || 'Patna')} · ${esc(item.price)}${esc(item.u || '')}</p>
            <p class="text-[11px] font-semibold mt-0.5" style="color:var(--mut)">Call/WA No: +91 ${esc(String(item.ownerPhone || item.phone || myPhone10).replace(/\D/g, '').slice(-10))}</p>
          </div>
        </div>
        <div class="mt-3 pt-3 flex gap-2" style="border-top:1px solid var(--line)">
          <button data-my-del="${esc(item.id)}" class="btn w-full !h-10 text-xs" style="background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5">
            Property Bik Gayi / Delete Karein ✕
          </button>
        </div>
      </div>`;
    }).join('') : `
      <div class="pc p-8 text-center text-sm font-bold" style="color:var(--mut)">
        Aapne abhi tak koi property list nahi ki hai.<br>
        <span style="color:var(--a)">Upar '+ Nayi Property Dalein' button dabakar free mein post karein!</span>
      </div>
    `}
  `;
}

/* --- 8. MAIN FEED RENDER (WITH BUDGET FILTER + SMART LOAD MORE PAGINATION) --- */
function renderFeed() {
  if (S.tab === 'profile') {
    renderOwnerDashboard();
    return;
  }

  const q = S.q.toLowerCase();
  const filteredAll = DATA.filter(p =>
    (!S.cat || p.t === S.cat) &&
    (S.loc === 'All Patna' || p.loc === S.loc) &&
    matchesBudget(p.numPrice || parseNumericPrice(p.price), S.budget) &&
    (!S.savedOnly || S.saved.has(String(p.id))) &&
    (!q || (p.title + p.loc + p.t + p.d + p.tags.join(' ')).toLowerCase().includes(q))
  );

  $('#count').textContent = filteredAll.length + ' mile';
  const visibleList = filteredAll.slice(0, S.pageLimit);
  const remaining = filteredAll.length - visibleList.length;

  $('#feed').innerHTML = visibleList.length ? (
    visibleList.map((p, n) => {
      const m = media(p), sv = S.saved.has(String(p.id));
      const displayOwner = p.ownerName ? ` · Owner: ${p.ownerName}` : '';
      const isMyOwnListing = (S.logged && ((S.uid && p.ownerUid === S.uid) || (S.userPhone && String(p.phone).endsWith(S.userPhone))));

      return `<article id="p${esc(p.id)}" class="pc" style="animation-delay:${Math.min(n, 5) * 45}ms">
      <div class="relative"><div class="gal noscroll" style="aspect-ratio:16/10;height:auto">${m.map(x => `<div class="w-full h-full">${x}</div>`).join('')}</div>
        <span class="absolute top-3.5 left-3.5 glassc text-white rounded-full px-3 py-1.5 text-[11px] font-extrabold flex items-center gap-1">${ic('shield', '!w-3.5 !h-3.5')}Verified Owner</span>
        <button data-save="${esc(p.id)}" class="absolute top-3 right-3 w-10 h-10 rounded-full grid place-items-center glassc transition active:scale-90" style="color:${sv ? '#fb7185' : '#fff'}"><svg class="ic" style="fill:${sv ? '#fb7185' : 'none'}"><use href="#i-heart"/></svg></button>
        <span class="cnt absolute bottom-3.5 right-3.5 glassc text-white rounded-full px-2.5 py-1 text-[10px] font-bold">1/${m.length}</span>
        <div class="grad absolute bottom-3.5 left-3.5 rounded-2xl px-4 py-2 hd font-extrabold text-xl shadow-lg">${esc(p.price)}<small class="text-xs font-semibold opacity-85">${esc(p.u)}</small></div></div>
      <div class="p-4 pt-4">
        <h3 class="hd font-bold text-[17px] leading-snug">${esc(p.title)}</h3>
        <p class="flex items-center gap-1 text-xs font-bold mt-1.5" style="color:var(--a)">${ic('pin', '!w-3.5 !h-3.5')}${esc(p.loc)}, Patna <span style="color:var(--mut)" class="font-semibold">· ${esc(p.ago)}${esc(displayOwner)}</span></p>
        <div class="flex flex-wrap gap-1.5 mt-3">${p.tags.map(x => `<span class="tag soft">${esc(x)}</span>`).join('')}</div>
        <p class="text-[13px] mt-3 leading-relaxed" style="color:var(--mut)">${esc(p.d)}</p>
        <div class="flex gap-2.5 mt-4">
          <button data-act="call" data-ph="${esc(p.phone)}" data-loc="${esc(p.loc)}" data-title="${esc(p.title)}" class="btn call grad">${ic('phone')}Call Seller</button>
          <button data-act="wa" data-ph="${esc(p.phone)}" data-loc="${esc(p.loc)}" data-title="${esc(p.title)}" class="btn wa">${ic('chat')}WhatsApp</button>
        </div>
        ${isMyOwnListing ? `<button data-my-del="${esc(p.id)}" class="w-full mt-2.5 py-2 rounded-xl text-xs font-extrabold" style="background:#fee2e2;color:#b91c1c">Yeh Aapki Listing Hai · Bik Gayi To Delete Karein ✕</button>` : ''}
      </div></article>`;
    }).join('') +
    (remaining > 0 ? `<button data-load-more class="btn soft w-full !h-12 mb-4 font-extrabold text-sm">Aur Listings Dekhein (${remaining} baki) ↓</button>` : '')
  ) : `<div class="pc p-9 text-center text-sm font-bold" style="color:var(--mut)">Is filter mein abhi koi listing nahi mili.<br><span style="color:var(--a)">Filter badlein ya apni listing free dalein!</span></div>`;
}
const refresh = () => { renderLocs(); renderCats(); renderFeed(); };

$('#feed').addEventListener('scroll', e => {
  const g = e.target;
  if (g.classList.contains('gal')) {
    const total = g.children.length || 1;
    g.parentElement.querySelector('.cnt').textContent = (Math.round(g.scrollLeft / g.clientWidth) + 1) + '/' + total;
  }
}, true);

/* --- 9. PRIVACY POLICY MODAL --- */
const PolM = $('#policyModal');
function openPolicy() { PolM?.classList.add('open'); pushAppState('#privacy-policy'); }
function closePolicy() {
  if (PolM?.classList.contains('open')) {
    PolM.classList.remove('open');
    if (location.hash === '#privacy-policy') history.back();
  }
}
if ($('#openPolicyBtn')) $('#openPolicyBtn').onclick = openPolicy;
if ($('#openPolicyFooter')) $('#openPolicyFooter').onclick = openPolicy;
if ($('#polClose')) $('#polClose').onclick = closePolicy;
if ($('#polAccept')) $('#polAccept').onclick = () => { $('#consentChk').checked = true; closePolicy(); };

/* --- 10. DIRECT GOOGLE LOGIN + PHONE OTP MODAL --- */
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
if ($('#pOwnerPhone')) $('#pOwnerPhone').oninput = e => e.target.value = e.target.value.replace(/\D/g, '');

if ($('#googleLoginBtn')) {
  $('#googleLoginBtn').onclick = async () => {
    const enteredName = $('#uName').value.trim();
    const enteredPhone = $('#phone').value.trim();

    if (!/^[6-9]\d{9}$/.test(enteredPhone)) {
      $('#pErr').textContent = 'Google Login se pehle upar apna 10-digit Call/WhatsApp number zaroor bharein';
      $('#phone').focus();
      return;
    }
    if (!$('#consentChk').checked) {
      $('#pErr').textContent = 'Aage badhne ke liye Privacy Policy & Consent box par tick karein';
      return;
    }

    $('#pErr').textContent = 'Opening Google Login...';
    try {
      const res = await signInWithPopup(auth, googleProvider);
      const user = res.user;
      const finalName = enteredName || user.displayName || 'Verified User';
      S.uid = user.uid;
      S.userName = finalName;
      S.userPhone = enteredPhone;
      S.logged = true;

      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        name: finalName,
        email: user.email || '',
        phone: enteredPhone,
        savedListings: [...S.saved],
        ver: true,
        blk: false,
        consentGiven: true,
        consentText: "Agreed to AwasPatna Privacy Policy, Terms & DPDP Contact Sharing (Google Auth)",
        consentTimestamp: Date.now()
      }, { merge: true });

      localStorage.setItem('ap_user', JSON.stringify({ name: finalName, phone: enteredPhone }));
      if ($('#pOwnerPhone')) $('#pOwnerPhone').value = enteredPhone;
      $('#profLbl').textContent = 'My Listings';
      $('#pErr').textContent = '';
      showOtpStep(2);
      toast('Google se safaltapurvak Login ho gaya ✓');
      setTimeout(() => {
        M.classList.remove('open');
        if (S.after) S.after();
        else renderFeed();
      }, 800);
    } catch (err) {
      $('#pErr').textContent = 'Google Login Error: ' + (err.message || 'Popup blocked');
    }
  };
}

function resetRecaptcha() {
  if (window.recaptchaVerifier) {
    try { window.recaptchaVerifier.clear(); } catch (e) {}
    window.recaptchaVerifier = null;
  }
  const box = $('#recaptcha-container');
  if (box) box.innerHTML = '';
}

$('#sendOtp').onclick = async () => {
  const nm = $('#uName').value.trim();
  const v = $('#phone').value;
  if (nm.length < 2) { $('#pErr').textContent = 'Kripya apna sahi naam likhein'; return; }
  if (!/^[6-9]\d{9}$/.test(v)) { $('#pErr').textContent = 'Sahi 10-digit mobile number daalein'; return; }
  if (!$('#consentChk').checked) { $('#pErr').textContent = 'Aage badhne ke liye Privacy Policy & Consent box par tick karein'; return; }

  S.userName = nm;
  S.userPhone = v;
  $('#pErr').textContent = 'Sending secure OTP...';

  try {
    resetRecaptcha();
    window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' });
    S.confirmResult = await signInWithPhoneNumber(auth, '+91' + v, window.recaptchaVerifier);
    $('#pErr').textContent = '';
    $('#sentTo').textContent = '+91 ' + v.slice(0, 2) + 'XXXXXX' + v.slice(-2);
    $$('.otp').forEach(o => o.value = '');
    showOtpStep(1);
    pushAppState('#otp-step');
    setTimeout(() => $('.otp').focus(), 350);
  } catch (err) {
    resetRecaptcha();
    if (String(err.message).includes('billing-not-enabled') || String(err.code).includes('quota')) {
      $('#pErr').textContent = 'Free SMS limit poori ho gayi hai! Upar "Google se Direct Login Karein" button dabayein.';
    } else {
      $('#pErr').textContent = err.message || 'OTP bhejne mein samasya aayi';
    }
  }
};

$('#back').onclick = () => history.back();

$$('.otp').forEach((o, i, a) => {
  o.oninput = () => {
    o.value = o.value.replace(/\D/g, '');
    if (o.value && a[i + 1]) a[i + 1].focus();
  };
  o.onkeydown = e => { if (e.key === 'Backspace' && !o.value && a[i - 1]) a[i - 1].focus(); };
});

$('#verify').onclick = async () => {
  const code = $$('.otp').map(o => o.value).join('');
  if (code.length < 6) { $('#oErr').textContent = '6-digit OTP poora daalein'; return; }
  if (!S.confirmResult) { $('#oErr').textContent = 'Session expired. Dobara OTP bhejein.'; return; }
  $('#oErr').textContent = 'Verifying...';

  try {
    const cred = await S.confirmResult.confirm(code);
    const uid = cred.user.uid;
    const verified10 = String(cred.user.phoneNumber || S.userPhone).replace(/\D/g, '').slice(-10);
    S.uid = uid;
    S.userPhone = verified10;
    S.logged = true;

    await setDoc(doc(db, "users", uid), {
      uid,
      name: S.userName,
      phone: verified10,
      savedListings: [...S.saved],
      ver: true,
      blk: false,
      consentGiven: true,
      consentText: "Agreed to AwasPatna Privacy Policy, Terms & DPDP Contact Sharing",
      consentTimestamp: Date.now()
    }, { merge: true });

    localStorage.setItem('ap_user', JSON.stringify({ name: S.userName, phone: verified10 }));
    if ($('#pOwnerPhone')) $('#pOwnerPhone').value = verified10;
    $('#profLbl').textContent = 'My Listings';
    $('#oErr').textContent = '';
    showOtpStep(2);
    setTimeout(() => {
      M.classList.remove('open');
      if (S.after) S.after();
      else renderFeed();
    }, 900);
  } catch (e) {
    $('#oErr').textContent = 'Galat OTP code! Kripya sahi 6-digit code daalein.';
  }
};

/* --- 11. FREE LISTING SUBMISSION --- */
const PM = $('#postModal');
function openPostModal() {
  if (!S.freeAllowed) { toast('Abhi nayi listing band hai'); return; }
  $('#postErr').textContent = '';
  if ($('#pOwnerPhone') && S.userPhone) $('#pOwnerPhone').value = S.userPhone;
  PM.classList.add('open');
  pushAppState('#post-listing');
}
$('#pClose').onclick = () => { PM.classList.remove('open'); if (location.hash === '#post-listing') history.back(); };

$('#submitPost').onclick = async () => {
  if (!auth.currentUser) { $('#postErr').textContent = 'Pehle login karein'; return; }
  const title = $('#pTitle').value.trim();
  const type = $('#pType').value;
  const loc = $('#pLoc').value;
  const price = $('#pPrice').value.trim();
  const tags = $('#pTags').value.split(',').map(s => s.trim()).filter(Boolean).slice(0, 5);
  const d = $('#pDesc').value.trim();
  const formPhone = $('#pOwnerPhone') ? $('#pOwnerPhone').value.trim() : '';

  if (title.length < 3 || !price) {
    $('#postErr').textContent = 'Sahi Title aur Kiraya/Price zaroor bharein';
    return;
  }
  if (!S.photo1) {
    $('#postErr').textContent = 'Kripya kam se kam Photo 1 (Main Photo) zaroor lagayein';
    return;
  }
  if (!$('#postConsentChk').checked) {
    $('#postErr').textContent = 'Listing consent box par tick karein';
    return;
  }

  const savedProfile = JSON.parse(localStorage.getItem('ap_user') || 'null');
  const realOwnerPhone = String(
    formPhone || auth.currentUser.phoneNumber || S.userPhone || savedProfile?.phone || ''
  ).replace(/\D/g, '').slice(-10);

  if (!/^[6-9]\d{9}$/.test(realOwnerPhone)) {
    $('#postErr').textContent = 'Kripya apna sahi 10-digit Call/WhatsApp number bharein';
    $('#pOwnerPhone')?.focus();
    return;
  }

  $('#postErr').textContent = 'Uploading fast WebP photo & listing...';
  const photos = [S.photo1, S.photo2].filter(Boolean);

  try {
    await addDoc(collection(db, "listings"), {
      title: title.slice(0, 100),
      type,
      loc,
      price: price.slice(0, 25),
      numPrice: parseNumericPrice(price),
      u: type === 'Plot' ? '' : '/mo',
      tags: tags.length ? tags : ['Verified', type],
      d: (d || `${title} in ${loc}, Patna.`).slice(0, 400),
      photos,
      ownerUid: auth.currentUser.uid,
      ownerName: S.userName || savedProfile?.name || auth.currentUser.displayName || 'Verified Owner',
      ownerPhone: realOwnerPhone,
      consentGiven: true,
      consentTimestamp: Date.now(),
      status: 'pending',
      ago: 'Aaj',
      createdAt: Date.now()
    });

    PM.classList.remove('open');
    $('#pTitle').value = $('#pPrice').value = $('#pTags').value = $('#pDesc').value = '';
    S.photo1 = S.photo2 = null;
    $('#prev1').classList.add('hidden'); $('#ph1').classList.remove('hidden');
    $('#prev2').classList.add('hidden'); $('#ph2').classList.remove('hidden');
    toast('Listing submit ho gayi! "My Listings" tab mein status dekhein.');
    S.tab = 'profile';
    syncNavUI();
    renderFeed();
  } catch (err) {
    $('#postErr').textContent = 'Error: ' + (err.message || 'Submission failed');
  }
};

/* --- 12. NAVIGATION, BUDGET FILTER, CLOUD SAVED & OWNER DELETE ACTIONS --- */
const R = document.documentElement;
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-loc],[data-budget],[data-cat],[data-save],[data-act],[data-nav],[data-go],[data-pal],[data-mode],[data-my-del],[data-dash-add],[data-dash-login],[data-dash-logout],[data-load-more]');
  if (!e.target.closest('#palMenu,#palBtn')) $('#palMenu').classList.add('hidden');
  if (!e.target.closest('#locMenu,#locBtn')) $('#locMenu').classList.add('hidden');
  if (!t) return;
  const d = t.dataset;

  if (d.pal !== undefined) R.dataset.pal = d.pal;
  else if (d.mode !== undefined) {
    const cur = R.dataset.theme || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
    R.dataset.theme = cur === 'dark' ? 'light' : 'dark';
  }
  else if (d.loadMore !== undefined) {
    S.pageLimit += PAGE_SIZE;
    renderFeed();
  }
  else if (d.budget) {
    S.budget = d.budget;
    S.pageLimit = PAGE_SIZE;
    S.tab = 'home';
    syncNavUI();
    refresh();
  }
  else if (d.dashLogin !== undefined) {
    openModal(() => { S.tab = 'profile'; syncNavUI(); renderFeed(); });
  }
  else if (d.dashAdd !== undefined) {
    openPostModal();
  }
  else if (d.dashLogout !== undefined) {
    await signOut(auth);
    localStorage.removeItem('ap_user');
    S.tab = 'home';
    syncNavUI();
    refresh();
    toast('Aap logout ho gaye');
  }
  else if (d.myDel) {
    const delId = d.myDel;
    if (confirm('Kya aapki property bik/rent ho gayi hai aur aap is listing ko hamesha ke liye delete karna chahte hain?')) {
      try {
        await deleteDoc(doc(db, "listings", delId));
        toast('Aapki listing safaltapurvak delete ho gayi ✓');
      } catch (err) {
        toast('Delete karne mein samasya aayi');
      }
    }
  }
  else if (d.loc && !d.act) {
    S.loc = d.loc;
    S.pageLimit = PAGE_SIZE;
    S.tab = 'home';
    $('#locMenu').classList.add('hidden');
    pushAppState(`#loc-${d.loc.toLowerCase().replace(/\s+/g, '-')}`);
    syncNavUI();
    refresh();
  }
  else if (d.cat) {
    S.cat = S.cat === d.cat ? null : d.cat;
    S.pageLimit = PAGE_SIZE;
    S.tab = 'home';
    pushAppState(S.cat ? `#cat-${S.cat.toLowerCase()}` : '#home');
    syncNavUI();
    refresh();
  }
  else if (d.go) {
    Object.assign(S, { tab: 'home', cat: null, loc: 'All Patna', budget: 'all', q: '', savedOnly: false });
    $('#q').value = '';
    pushAppState(`#listing-${d.go}`);
    syncNavUI();
    refresh();
    setTimeout(() => document.getElementById('p' + d.go)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
  }
  else if (d.save) {
    const id = String(d.save);
    S.saved.has(id) ? S.saved.delete(id) : S.saved.add(id);
    const savedArr = [...S.saved];
    localStorage.setItem('ap_saved', JSON.stringify(savedArr));
    renderFeed();
    // Sync Saved Favorites to Cloud Firestore if user is logged in
    if (auth.currentUser) {
      setDoc(doc(db, "users", auth.currentUser.uid), {
        savedListings: savedArr,
        consentGiven: true
      }, { merge: true }).catch(() => {});
    }
  }
  else if (d.act) {
    const cleanPh = formatWhatsAppAndCallPhone(d.ph);
    if (!cleanPh) {
      toast('Is listing mein owner ka number uplabdh nahi hai');
      return;
    }
    const ttl = d.title || 'Property';
    const area = d.loc || 'Patna';
    const go = () => {
      if (d.act === 'call') {
        location.href = 'tel:+' + cleanPh;
      } else {
        const msg = `Namaste! Maine AwasPatna App par aapki property "${ttl}" (${area}, Patna) dekhi. Kya yeh abhi available hai?`;
        window.open(`https://wa.me/${cleanPh}?text=` + encodeURIComponent(msg), '_blank', 'noopener');
      }
    };
    S.logged ? go() : openModal(go);
  }
  else if (d.nav) {
    const n = d.nav;
    if (n === 'home' || n === 'saved' || n === 'profile') {
      S.tab = n;
      S.savedOnly = n === 'saved';
      S.pageLimit = PAGE_SIZE;
      pushAppState(`#${n}`);
      syncNavUI();
      renderFeed();
      if (n === 'profile') {
        document.getElementById('feedTitle')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else if (n === 'alerts') {
      if ('Notification' in window && Notification.permission === 'granted') {
        toast('Notifications All Time Chalu Hain ✓');
      } else {
        $('#notifModal')?.classList.add('open');
      }
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
$('#bellBtn').onclick = () => {
  if ('Notification' in window && Notification.permission === 'granted') {
    toast('Notifications Chalu Hain ✓ Koi naya alert nahi');
  } else {
    $('#notifModal')?.classList.add('open');
  }
};
$('#fab').onclick = () => { S.logged ? openPostModal() : openModal(openPostModal); };

// Debounced Search Input (160ms) for Zero Lag Typing
let searchTimer = null;
$('#q').oninput = e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    S.q = e.target.value.trim();
    S.pageLimit = PAGE_SIZE;
    if (S.tab === 'profile') S.tab = 'home';
    syncNavUI();
    renderFeed();
  }, 160);
};

history.replaceState(getSnapshot(), '', '#home');
renderLocs();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
