import { 
  db, auth, collection, doc, onSnapshot, addDoc, setDoc, deleteDoc, query, where,
  RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged 
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

const CATS = [
  { k: 'Room', l: 'Room / PG', i: 'bed' },
  { k: 'Flat', l: 'Flat', i: 'flat' },
  { k: 'Plot', l: 'Plot/Zameen', i: 'plot' },
  { k: 'Commercial', l: 'Commercial', i: 'shop' }
];

const FALLBACK_DATA = [
  { id: 'd1', t: 'Room', h: 22, title: 'Furnished Single Room + Attached Bath', loc: 'Kankarbagh', price: '₹4,200', u: '/mo', ago: 'Aaj', tags: ['Furnished', 'WiFi', '24×7 Water'], d: 'Ground floor room, students aur working professionals ke liye ideal.', phone: '919812300001', photos: [], status: 'approved' },
  { id: 'd2', t: 'Flat', h: 262, title: 'Premium 2 BHK, 3rd Floor', loc: 'Boring Road', price: '₹14,500', u: '/mo', ago: 'Aaj', tags: ['2 BHK', 'Lift', 'Parking'], d: 'Modular kitchen, power backup aur gated society. Family preferred.', phone: '919934500002', photos: [], status: 'approved' }
];

let DATA = [];
let myListingsData = [];
let knownListingIds = new Set();
let firstLoadDone = false;

const S = { 
  tab: 'home', cat: null, loc: 'All Patna', q: '', 
  saved: new Set(JSON.parse(localStorage.getItem('ap_saved'] || '[]')), 
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

function toast(m) {
  const t = $('#toast');
  t.textContent = m;
  t.style.opacity = 1;
  t.style.transform = 'translate(-50%,-8px)';
  clearTimeout(toast.x);
  toast.x = setTimeout(() => {
    t.style.opacity = 0;
    t.style.transform = 'translate(-50%,0)';
  }, 2500);
}

/* --- 1. PUSH NOTIFICATIONS --- */
function updateNotifBadge() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    $('#alertLbl').textContent = 'Alerts ON';
  }
}

async function askNotificationPermission() {
  $('#notifModal').classList.remove('open');
  if (!('Notification' in window)) { toast('App Notifications Enabled ✓'); return; }
  try {
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      updateNotifBadge();
      toast('Notifications Chalu Ho Gayi ✓');
    }
  } catch (e) {}
}

async function sendLocalNotification(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg && reg.showNotification) {
      reg.showNotification(title, { body, icon: 'https://cdn-icons-png.flaticon.com/512/619/619153.png' });
    } else {
      new Notification(title, { body });
    }
  } catch (e) {}
}

$('#notifAllow').onclick = askNotificationPermission;
$('#notifLater').onclick = () => $('#notifModal').classList.remove('open');

/* --- 2. IMAGE CROPS --- */
function cropImageToFixedRatio(file, targetW = 800, targetH = 500, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = targetW; canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        const targetRatio = targetW / targetH;
        const srcRatio = img.width / img.height;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (srcRatio > targetRatio) { sw = img.height * targetRatio; sx = (img.width - sw) / 2; }
        else { sh = img.width / targetRatio; sy = (img.height - sh) / 2; }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

$('#imgIn1').onchange = async e => {
  const f = e.target.files?.[0]; if (!f) return;
  toast('Photo 1 crop ho rahi hai...');
  S.photo1 = await cropImageToFixedRatio(f);
  $('#prev1').src = S.photo1; $('#prev1').classList.remove('hidden'); $('#ph1').classList.add('hidden');
};
$('#imgIn2').onchange = async e => {
  const f = e.target.files?.[0]; if (!f) return;
  toast('Photo 2 crop ho rahi hai...');
  S.photo2 = await cropImageToFixedRatio(f);
  $('#prev2').src = S.photo2; $('#prev2').classList.remove('hidden'); $('#ph2').classList.add('hidden');
};

/* --- 3. REAL-TIME LISTENERS --- */
const HUES = { Room: 22, Flat: 262, Plot: 140, Commercial: 200 };
const approvedQuery = query(collection(db, "listings"), where("status", "==", "approved"));

onSnapshot(approvedQuery, snap => {
  const live = [];
  snap.forEach(dc => {
    const d = dc.data();
    if (firstLoadDone && !knownListingIds.has(dc.id)) {
      sendLocalNotification(`Nayi Listing: ${d.type || 'Room'} in ${d.loc}`, `${d.title} · ${d.price}`);
    }
    knownListingIds.add(dc.id);

    // Oner ka real verified phone number yahan bind ho raha hai
    let rawPhone = String(d.ownerPhone || '919000000000').replace(/\D/g, '');
    if (rawPhone.length === 10) rawPhone = '91' + rawPhone;

    live.push({
      id: dc.id,
      t: d.type || 'Room',
      h: Number(d.h) || HUES[d.type] || 22,
      title: d.title || 'Property',
      loc: d.loc || 'Boring Road',
      price: d.price || '₹5,000',
      u: d.u !== undefined ? d.u : (d.type === 'Plot' ? '' : '/mo'),
      ago: d.ago || 'Aaj',
      tags: Array.isArray(d.tags) ? d.tags : ['Verified'],
      d: d.d || '',
      phone: rawPhone,
      ownerUid: d.ownerUid || '',
      photos: Array.isArray(d.photos) ? d.photos : [],
      createdAt: d.createdAt || 0
    });
  });
  firstLoadDone = true;
  live.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  DATA = live.length ? live : FALLBACK_DATA;
  renderFeat(); refresh();
}, () => {
  DATA = FALLBACK_DATA;
  renderFeat(); refresh();
});

/* --- 4. AUTH & MY DASHBOARD LISTINGS --- */
onAuthStateChanged(auth, user => {
  if (user) {
    S.logged = true;
    S.uid = user.uid;
    S.userPhone = (user.phoneNumber || '').replace('+91', '');
    const saved = JSON.parse(localStorage.getItem('ap_user') || 'null');
    if (saved?.name) S.userName = saved->name;
    $('#profLbl').textContent = 'Dashboard';

    // Oner ki apni listings fetch karna real-time mein
    const myQuery = query(collection(db, "listings"), where("ownerUid", "==", user.uid));
    onSnapshot(myQuery, mySnap => {
      myListingsData = [];
      mySnap.forEach(dc => {
        myListingsData.push({ id: dc.id, ...dc.data() });
      });
      if (S.tab === 'profile') renderProfileDashboard();
    });
  } else {
    S.logged = false;
    S.uid = null;
    myListingsData = [];
    $('#profLbl').textContent = 'Profile';
  }
});

/* --- 5. RENDER FEED & DASHBOARD --- */
function defs(i, h) {
  return `<defs><linearGradient id="k${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${h} 55% 24%)"/><stop offset=".6" stop-color="hsl(${h+28} 80% 62%)"/><stop offset="1" stop-color="hsl(${h+45} 90% 80%)"/></linearGradient><radialGradient id="r${i}" cx=".78" cy=".6" r=".55"><stop offset="0" stop-color="#fff6d0" stop-opacity=".95"/><stop offset="1" stop-color="#fff6d0" stop-opacity="0"/></radialGradient></defs>`;
}
function ext(i, h, t) {
  return `<svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" class="w-full h-full"><rect width="400" height="260" fill="url(#k${i})"/><text x="200" y="130" fill="#fff" font-size="20" font-weight="bold" text-anchor="middle">${esc(t)}</text></svg>`;
}
const media = p => {
  if (Array.isArray(p.photos) && p.photos.length > 0) {
    return p.photos.map(src => `<img src="${esc(src)}" class="w-full h-full object-cover" loading="lazy">`);
  }
  return [ext(p.id, p.h, p.t)];
};

function renderLocs() {
  $('#pills').innerHTML = LOCS.map(l => `<button class="chip ${l === S.loc ? 'on' : ''}" data-loc="${esc(l)}">${esc(l)}</button>`).join('');
  $('#locMenu').innerHTML = LOCS.map(l => `<button data-loc="${esc(l)}" class="w-full text-left px-3 py-2 rounded-xl font-bold ${l === S.loc ? 'soft' : ''}">${esc(l)}</button>`).join('');
  $('#pLoc').innerHTML = LOCS.filter(l => l !== 'All Patna').map(l => `<option value="${esc(l)}">${esc(l)}</option>`).join('');
  $('#locLbl').textContent = S.loc;
}
function renderCats() {
  $('#cats').innerHTML = CATS.map(c => `<button data-cat="${esc(c.k)}" class="cat ${S.cat === c.k ? 'on' : ''}"><b>${esc(c.l)}</b></button>`).join('');
}
function renderFeat() {
  $('#feat').innerHTML = DATA.slice(0, 4).map(p => `<button data-go="${esc(p.id)}" class="ft text-left text-white relative overflow-hidden">${media(p)[0]}<div class="absolute bottom-2 left-2 font-bold">${esc(p.price)}</div></button>`).join('');
}

function renderFeed() {
  if (S.tab === 'profile') {
    renderProfileDashboard();
    return;
  }
  const q = S.q.toLowerCase();
  const L = DATA.filter(p => (!S.cat || p.t === S.cat) && (S.loc === 'All Patna' || p.loc === S.loc) && (!S.savedOnly || S.saved.has(String(p.id))) && (!q || (p.title + p.loc + p.t + p.d).toLowerCase().includes(q)));
  $('#count').textContent = L.length + ' mile';
  $('#feed').innerHTML = L.length ? L.map(p => {
    const m = media(p), sv = S.saved.has(String(p.id));
    return `<article class="pc mb-4 bg-white rounded-2xl overflow-hidden shadow">
      <div class="relative" style="aspect-ratio:16/10">${m[0]}</div>
      <div class="p-4">
        <h3 class="font-bold text-base">${esc(p.title)}</h3>
        <p class="text-xs text-indigo-600 font-semibold mt-1">📍 ${esc(p.loc)} · ${esc(p.price)}</p>
        <p class="text-xs text-gray-500 mt-2">${esc(p.d)}</p>
        <div class="flex gap-2 mt-4">
          <button data-act="call" data-ph="${esc(p.phone)}" class="btn call grad flex-1 text-xs py-2 rounded-xl text-white font-bold">Call Owner</button>
          <button data-act="wa" data-ph="${esc(p.phone)}" data-title="${esc(p.title)}" class="btn wa flex-1 text-xs py-2 rounded-xl font-bold border border-green-500 text-green-600">WhatsApp</button>
        </div>
      </div>
    </article>`;
  }).join('') : `<div class="text-center p-8 text-gray-500 font-bold">Koi listing nahi mili.</div>`;
}

/* --- 6. OWNER DASHBOARD (MANAGE & DELETE LISTINGS) --- */
function renderProfileDashboard() {
  if (!S.logged) {
    $('#feed').innerHTML = `<div class="text-center p-8"><p class="mb-4 font-bold">Pehle login karein apna dashboard dekhne ke liye.</p><button id="profLoginBtn" class="grad px-6 py-3 rounded-xl font-bold text-white">Login / Verify Phone</button></div>`;
    $('#profLoginBtn'].onclick = () => openModal();
    return;
  }

  $('#feed').innerHTML = `
    <div class="bg-indigo-600 text-white p-5 rounded-2xl mb-4 shadow">
      <h2 class="font-extrabold text-lg">👤 Owner Dashboard</h2>
      <p class="text-xs opacity-90 mt-1">Mobile: +91 ${esc(S.userPhone)}</p>
      <button id="logoutBtn" class="mt-3 bg-white/20 text-xs px-3 py-1.5 rounded-lg font-bold">Logout</button>
    </div>
    <h3 class="font-extrabold text-sm mb-3">Aapki Daali Gayi Listings (${myListingsData.length})</h3>
    <div id="myListingContainer" class="space-y-3">
      ${myListingsData.length ? myListingsData.map(item => `
        <div class="bg-white p-4 rounded-2xl border shadow-sm flex justify-between items-center">
          <div>
            <h4 class="font-bold text-sm">${esc(item.title)}</h4>
            <p class="text-xs text-gray-500">${esc(item.loc)} · ${esc(item.price)}</p>
            <span class="inline-block mt-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full ${item.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}">${item.status.toUpperCase()}</span>
          </div>
          <button data-del-id="${esc(item.id)}" class="bg-red-50 text-red-600 px-3 py-2 rounded-xl text-xs font-extrabold">Delete</button>
        </div>
      `).join('') : `<p class="text-xs text-gray-400 text-center py-6">Aapne abhi tak koi listing nahi daali hai. Niche '+' button se free dalein!</p>`}
    </div>
  `;

  $('#logoutBtn').onclick = async () => {
    await auth.signOut();
    toast('Logout ho gaye');
    S.tab = 'home'; syncNavUI(); refresh();
  };

  $$('[data-del-id]').forEach(btn => {
    btn.onclick = async () => {
      if (confirm('Kya aap yeh listing delete karna chahte hain?')) {
        try {
          await deleteDoc(doc(db, "listings", btn.dataset.delId));
          toast('Listing delete ho gayi ✓');
        } catch (e) {
          toast('Delete karne mein samasya aayi');
        }
      }
    };
  });
}

const refresh = () => { renderLocs(); renderCats(); renderFeed(); };

/* --- 7. MODALS & NAVIGATION --- */
const M = $('#modal'), steps = ['#s1', '#s2', '#s3'];
function showOtpStep(n) { S.otpStep = n; steps.forEach((s, i) => $(s).classList.toggle('hidden', i !== n)); }
function openModal(after) { S.after = after || null; showOtpStep(0); M.classList.add('open'); }
function closeModal() { M.classList.remove('open'); }
$('#mClose').onclick = closeModal;
$('#phone').oninput = e => e.target.value = e.target.value.replace(/\D/g, '');

function resetRecaptcha() {
  if (window.recaptchaVerifier) { try { window.recaptchaVerifier.clear(); } catch(e){} window.recaptchaVerifier = null; }
  $('#recaptcha-container').innerHTML = '';
}

$('#sendOtp').onclick = async () => {
  const nm = $('#uName').value.trim(), v = $('#phone').value;
  if (nm.length < 2) { $('#pErr').textContent = 'Sahi naam likhein'; return; }
  if (!/^[6-9]\d{9}$/.test(v)) { $('#pErr').textContent = 'Sahi 10-digit number daalein'; return; }
  if (!$('#consentChk').checked) { $('#pErr').textContent = 'Consent box par tick karein'; return; }
  S.userName = nm; S.userPhone = v;
  try {
    resetRecaptcha();
    window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' });
    S.confirmResult = await signInWithPhoneNumber(auth, '+91' + v, window.recaptchaVerifier);
    showOtpStep(1);
  } catch (err) {
    $('#pErr').textContent = err.message;
  }
};

$('#verify').onclick = async () => {
  const code = $$('.otp').map(o => o.value).join('');
  if (code.length < 6) { $('#oErr').textContent = '6-digit OTP poora daalein'; return; }
  try {
    const cred = await S.confirmResult.confirm(code);
    await setDoc(doc(db, "users", cred.user.uid), { uid: cred.user.uid, name: S.userName, phone: S.userPhone, ver: true }, { merge: true });
    localStorage.setItem('ap_user', JSON.stringify({ name: S.userName, phone: S.userPhone }));
    S.logged = true; showOtpStep(2);
    setTimeout(() => { closeModal(); if (S.after) S.after(); }, 900);
  } catch (e) {
    $('#oErr').textContent = 'Galat OTP code!';
  }
};

$$('.otp').forEach((o, i, a) => {
  o.oninput = () => { o.value = o.value.replace(/\D/g, ''); if (o.value && a[i+1]) a[i+1].focus(); };
});

/* --- 8. POST LISTING WITH OWNER PHONE & UID --- */
const PM = $('#postModal');
function openPostModal() {
  if (!S.freeAllowed) { toast('Listing abhi band hai'); return; }
  PM.classList.add('open');
}
$('#pClose').onclick = () => PM.classList.remove('open');

$('#submitPost').onclick = async () => {
  if (!auth.currentUser) { $('#postErr').textContent = 'Pehle login karein'; return; }
  const title = $('#pTitle').value.trim(), price = $('#pPrice').value.trim();
  if (!title || !price || !S.photo1) { $('#postErr').textContent = 'Title, Price aur Photo 1 zaroori hai'; return; }

  try {
    await addDoc(collection(db, "listings"), {
      title, type: $('#pType').value, loc: $('#pLoc').value, price,
      u: $('#pType').value === 'Plot' ? '' : '/mo',
      d: $('#pDesc').value.trim() || `${title} in ${$('#pLoc').value}`,
      photos: [S.photo1, S.photo2].filter(Boolean),
      ownerUid: auth.currentUser.uid,
      ownerName: S.userName || 'Owner',
      ownerPhone: S.userPhone || auth.currentUser.phoneNumber || '',
      status: 'pending', ago: 'Aaj', createdAt: Date.now()
    });
    PM.classList.remove('open');
    $('#pTitle').value = $('#pPrice').value = $('#pDesc').value = '';
    S.photo1 = S.photo2 = null;
    $('#prev1').classList.add('hidden'); $('#ph1').classList.remove('hidden');
    toast('Listing submit ho gayi! Admin approval ke baad live hogi.');
  } catch (err) {
    $('#postErr').textContent = 'Error: ' + err.message;
  }
};

/* --- 9. NAV & ACTIONS --- */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-loc],[data-cat],[data-save],[data-act],[data-nav],[data-go]');
  if (!t) return;
  const d = t.dataset;
  if (d.loc) { S.loc = d.loc; $('#locMenu').classList.add('hidden'); refresh(); }
  else if (d.cat) { S.cat = S.cat === d.cat ? null : d.cat; refresh(); }
  else if (d.act) {
    const ph = String(d.ph || '919000000000').replace(/\D/g, '');
    d.act === 'call' ? location.href = 'tel:+' + ph : window.open(`https://wa.me/${ph}?text=` + encodeURIComponent(`Namaste! Maine AwasPatna par aapki listing dekhi. Kya yeh available hai?`), '_blank');
  }
  else if (d.nav) {
    S.tab = d.nav; S.savedOnly = d.nav === 'saved';
    syncNavUI(); refresh(); window.scrollTo({ top: 0, behavior: 'smooth' });
  }
});

function syncNavUI() {
  $$('.nav').forEach(b => b.style.color = b.dataset.nav === S.tab ? 'var(--a)' : '');
  $('#feedTitle').textContent = S.savedOnly ? 'Saved Listings' : (S.tab === 'profile' ? 'Owner Dashboard' : 'Taaza Listings');
}

$('#locBtn').onclick = () => $('#locMenu').classList.toggle('hidden');
$('#fab').onclick = () => { S.logged ? openPostModal() : openModal(openPostModal); };
$('#q').oninput = e => { S.q = e.target.value.trim(); renderFeed(); };

history.replaceState({ tab: 'home' }, '', '#home');
renderLocs();
