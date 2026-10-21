// ═══════════════════════════════════════════════════════════
// NipPik v2.1.1 — Блок 1 (баги + quick fixes)
// ═══════════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, sendPasswordResetEmail,
  GoogleAuthProvider, signInWithRedirect, getRedirectResult, sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, setDoc, updateDoc, deleteDoc,
  addDoc, query, where, orderBy, limit, startAfter, getDocs, onSnapshot,
  serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDno9L-TbRHZJptl_rIo2ggB6PMAslPku8",
  authDomain: "tiktok-8170f.firebaseapp.com",
  projectId: "tiktok-8170f",
  storageBucket: "tiktok-8170f.firebasestorage.app",
  messagingSenderId: "774916663696",
  appId: "1:774916663696:web:820b35c219c8695c53eb15"
};

const CLOUDINARY = { cloudName: 'wgoo094d', uploadPreset: 'nippik_unsigned' };
const CLOUDINARY_READY = true;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ═══ HELPERS ═══
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

const fmtNum = n => {
  n = n || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.0','') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace('.0','') + 'K';
  return String(n);
};
const escapeHtml = s => String(s || '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

const renderText = (text) => {
  const esc = escapeHtml(text || '');
  return esc
    .replace(/(@[a-z0-9._]+)/gi, '<span class="tag-link" data-mention="$1">$1</span>')
    .replace(/(#[a-z0-9_]+)/gi, '<span class="tag-link" data-hashtag="$1">$1</span>');
};

const timeAgo = ts => {
  if (!ts) return '';
  const d = ts.toDate?.() || new Date(ts);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'только что';
  if (s < 3600) return Math.floor(s/60) + ' мин';
  if (s < 86400) return Math.floor(s/3600) + ' ч';
  if (s < 604800) return Math.floor(s/86400) + ' дн';
  if (s < 2592000) return Math.floor(s/604800) + ' нед';
  return Math.floor(s/2592000) + ' мес';
};

let toastTimer = null;
const toast = (msg, ms = 2400) => {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
};
const showScreen = id => {
  $$('.screen').forEach(s => s.classList.add('hidden'));
  $('#' + id).classList.remove('hidden');
};
function handleError(err, ctx = '') {
  console.error('❌ [' + ctx + ']', err);
  const code = err?.code || '';
  if (code === 'permission-denied') toast('🚫 Нет прав. Обнови правила Firestore!', 5000);
  else if (code === 'failed-precondition' || String(err.message).includes('index'))
    toast('📇 Нужен индекс. F12 → Console → ссылка', 5000);
  else toast('❌ ' + (code || err.message || 'Ошибка'));
}

// ═══ SETTINGS ═══
const settings = {
  theme: localStorage.getItem('np_theme') || 'dark',
  autoplay: localStorage.getItem('np_autoplay') !== 'false',
  sound: localStorage.getItem('np_sound') === 'true',
  dataSaver: localStorage.getItem('np_dataSaver') === 'true',
  hideLikes: localStorage.getItem('np_hideLikes') === 'true',
  apply() {
    const actual = this.theme === 'system'
      ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
      : this.theme;
    document.documentElement.dataset.theme = actual;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = actual === 'light' ? '#ffffff' : '#000000';
    $$('.theme-card').forEach(b => b.classList.toggle('active', b.dataset.themeVal === this.theme));
    const setChk = (id, v) => { const el = $(id); if (el) el.checked = v; };
    setChk('#settingAutoplay', this.autoplay);
    setChk('#settingSound', this.sound);
    setChk('#settingDataSaver', this.dataSaver);
    setChk('#settingHideLikes', this.hideLikes);
    const gsb = $('#globalSoundBtn');
    if (gsb) gsb.classList.toggle('muted', !this.sound);
  },
  set(key, value) {
    this[key] = value;
    const v = value === true ? 'true' : value === false ? 'false' : value;
    localStorage.setItem('np_' + key, v);
    this.apply();
  }
};
matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  if (settings.theme === 'system') settings.apply();
});

// ═══ LOCAL STORAGE HELPERS ═══
const history = {
  KEY: 'np_history', MAX: 100,
  getAll() { try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); } catch { return []; } },
  add(item) {
    let arr = this.getAll().filter(x => x.videoId !== item.videoId);
    arr.unshift({ ...item, viewedAt: Date.now() });
    if (arr.length > this.MAX) arr = arr.slice(0, this.MAX);
    localStorage.setItem(this.KEY, JSON.stringify(arr));
  },
  clear() { localStorage.removeItem(this.KEY); }
};
const notInterested = {
  KEY: 'np_notInterested',
  getAll() { try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); } catch { return []; } },
  add(id) {
    const arr = this.getAll();
    if (!arr.includes(id)) { arr.push(id); localStorage.setItem(this.KEY, JSON.stringify(arr)); }
  },
  has(id) { return this.getAll().includes(id); }
};
const drafts = {
  KEY: 'np_drafts',
  getAll() { try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); } catch { return []; } },
  add(d) {
    const arr = this.getAll();
    arr.push({ ...d, id: 'd_' + Date.now(), savedAt: Date.now() });
    localStorage.setItem(this.KEY, JSON.stringify(arr));
  },
  remove(id) {
    const arr = this.getAll().filter(x => x.id !== id);
    localStorage.setItem(this.KEY, JSON.stringify(arr));
  }
};

// ═══ CLOUDINARY ═══
async function uploadToCloudinary(file, type = 'auto', onProgress) {
  const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY.cloudName}/${type}/upload`;
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', CLOUDINARY.uploadPreset);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.timeout = 5 * 60 * 1000;
    xhr.upload.onprogress = e => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status === 200) {
        try { resolve(JSON.parse(xhr.responseText).secure_url); } catch { reject(new Error('Bad response')); }
      } else {
        let detail = '';
        try { detail = JSON.parse(xhr.responseText).error?.message || ''; } catch {}
        reject(new Error(`Cloudinary ${xhr.status}: ${detail || 'ошибка'}`));
      }
    };
    xhr.onerror = () => reject(new Error('Сетевая ошибка. Проверь AdBlock / размер <30MB'));
    xhr.ontimeout = () => reject(new Error('Таймаут 5 мин'));
    xhr.send(fd);
  });
}

// ═══ STATE ═══
const state = {
  user: null, profile: null,
  tab: 'feed', feedMode: 'foryou',
  feedCursor: null, feedExhausted: false,
  renderedCards: new Map(), viewedVideos: new Set(),
  subs: new Map(),
  viewingProfileUid: null,
  currentCommentsVideo: null, replyTo: null,
  uploadFile: null, inited: false,
  trendingTags: [], pendingVideoId: null, pendingOpenVideo: null,
  pendingSound: null,
  unreadNotifs: 0, inboxFilter: 'all',
  searchFilter: 'all', searchTerm: '',
  allNotifs: [],
};
const unsub = key => {
  if (state.subs.has(key)) { try { state.subs.get(key)(); } catch {} state.subs.delete(key); }
};
const unsubAll = () => { for (const k of state.subs.keys()) unsub(k); };

// ═══ AUTH ═══
getRedirectResult(auth).then(async r => {
  if (r?.user) {
    const p = await getUserProfile(r.user.uid).catch(() => null);
    if (!p) await createUserProfile(r.user.uid, r.user.email || '').catch(() => {});
  }
}).catch(err => console.error('Redirect:', err));

onAuthStateChanged(auth, async (u) => {
  state.user = u;
  if (u) {
    let p = await getUserProfile(u.uid).catch(() => null);
    if (!p) { await createUserProfile(u.uid, u.email || '').catch(() => {}); p = await getUserProfile(u.uid).catch(() => null); }
    state.profile = p;
    if (!p || !p.username) showScreen('onboardingScreen');
    else {
      showScreen('mainApp');
      initMainApp();
      subscribeOwnProfile();
      subscribeNotifications();
      refreshTrending();
    }
  } else {
    unsubAll();
    state.profile = null; state.renderedCards.clear();
    state.viewingProfileUid = null; state.inited = false;
    showScreen('authScreen');
  }
});

let authMode = 'in';
$('#toggleAuthMode').addEventListener('click', () => {
  authMode = authMode === 'in' ? 'up' : 'in';
  $('#authSubmitBtn').textContent = authMode === 'in' ? 'Войти' : 'Создать аккаунт';
  $('#toggleAuthMode').textContent = authMode === 'in' ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти';
  $('#forgotBtn').classList.toggle('hidden', authMode === 'up');
  $('#authError').classList.add('hidden');
});

$('#authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#authEmail').value.trim();
  const pwd = $('#authPassword').value;
  const errEl = $('#authError');
  const btn = $('#authSubmitBtn');
  errEl.classList.add('hidden');
  btn.disabled = true; const orig = btn.textContent; btn.textContent = 'Загрузка...';
  try {
    if (authMode === 'in') await signInWithEmailAndPassword(auth, email, pwd);
    else {
      const cred = await createUserWithEmailAndPassword(auth, email, pwd);
      await createUserProfile(cred.user.uid, email);
      sendEmailVerification(cred.user).catch(() => {});
    }
  } catch (err) {
    errEl.textContent = err.message || 'Ошибка';
    errEl.classList.remove('hidden');
  }
  btn.disabled = false; btn.textContent = orig;
});

$('#googleBtn').addEventListener('click', async () => {
  try { await signInWithRedirect(auth, new GoogleAuthProvider()); }
  catch (err) { $('#authError').textContent = err.message; $('#authError').classList.remove('hidden'); }
});

$('#forgotBtn').addEventListener('click', async () => {
  const email = $('#authEmail').value.trim();
  if (!email) return toast('Введите email');
  try { await sendPasswordResetEmail(auth, email); toast('Письмо отправлено ✔'); }
  catch (err) { toast(err.message); }
});

// ═══ USERS ═══
async function createUserProfile(uid, email) {
  await setDoc(doc(db, 'users', uid), {
    uid, email, username: '', displayName: '', avatar: '', bio: '',
    followersCount: 0, followingCount: 0, likesCount: 0,
    createdAt: serverTimestamp(),
  }, { merge: true });
}
async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { ...snap.data(), uid: snap.id } : null;
}
async function isUsernameAvailable(un, excludeUid) {
  const q = query(collection(db, 'users'), where('username', '==', un.toLowerCase()), limit(2));
  const snap = await getDocs(q);
  return snap.empty || snap.docs.every(d => d.id === excludeUid);
}
function subscribeOwnProfile() {
  unsub('ownProfile');
  const u = onSnapshot(doc(db, 'users', state.user.uid),
    snap => {
      if (snap.exists()) {
        const p = { ...snap.data(), uid: snap.id };
        state.profile = p;
        if (state.tab === 'profile' && !state.viewingProfileUid) updateProfileUI(p, true);
      }
    }, err => handleError(err, 'ownProfile'));
  state.subs.set('ownProfile', u);
}

// ═══ NOTIFICATIONS ═══
async function createNotification(recipientId, type, data = {}) {
  if (recipientId === state.user.uid) return;
  try {
    await addDoc(collection(db, 'notifications'), {
      recipientId, type,
      actorId: state.user.uid,
      actorUsername: state.profile.username,
      actorAvatar: state.profile.avatar || '',
      read: false,
      createdAt: serverTimestamp(),
      ...data,
    });
  } catch (err) { console.warn('Notif:', err); }
}
function subscribeNotifications() {
  unsub('notifications');
  const q = query(collection(db, 'notifications'),
    where('recipientId', '==', state.user.uid), orderBy('createdAt', 'desc'), limit(50));
  const u = onSnapshot(q,
    snap => {
      state.allNotifs = snap.docs.map(d => ({ notifId: d.id, ...d.data() }));
      renderInbox();
      const unread = state.allNotifs.filter(n => !n.read).length;
      state.unreadNotifs = unread;
      const badge = $('#inboxBadge');
      if (badge) {
        if (unread > 0) { badge.textContent = unread > 9 ? '9+' : unread; badge.classList.remove('hidden'); }
        else badge.classList.add('hidden');
      }
    }, err => console.warn('Notif subscribe:', err));
  state.subs.set('notifications', u);
}
const notifLabels = {
  like: { text: 'лайкнул(а) видео', icon: '❤️', cls: 'like' },
  comment: { text: 'прокомментировал(а)', icon: '💬', cls: 'comment' },
  follow: { text: 'подписался(ась)', icon: '👤', cls: 'follow' },
  repost: { text: 'сделал(а) репост', icon: '🔁', cls: 'repost' },
};
function renderInbox() {
  const el = $('#inboxList');
  if (!el) return;
  let notifs = state.allNotifs || [];
  if (state.inboxFilter !== 'all') notifs = notifs.filter(n => n.type === state.inboxFilter);
  if (!notifs.length) {
    el.innerHTML = `<div class="inbox-empty">
      <p style="font-size:40px;margin-bottom:12px;">🔔</p>
      <p>Пока нет уведомлений</p>
      <p class="small" style="margin-top:4px;">${state.inboxFilter === 'all' ? 'Лайки, комменты и подписки появятся здесь' : 'Нет в этой категории'}</p>
    </div>`;
    return;
  }
  el.innerHTML = notifs.map(n => {
    const label = notifLabels[n.type] || { text: 'активность', icon: '📌', cls: '' };
    return `<div class="notif-item ${n.read ? '' : 'unread'}" data-nid="${n.notifId}" data-vid="${n.videoId || ''}" data-type="${n.type}">
      ${n.actorAvatar ? `<img class="notif-avatar" src="${n.actorAvatar}" />` : `<div class="notif-avatar">👤</div>`}
      <div class="notif-body">
        <p class="notif-text"><b>@${escapeHtml(n.actorUsername || 'user')}</b> ${label.text}
          ${n.commentText ? `<br><span style="color:var(--text-3);font-size:13px;">«${escapeHtml(n.commentText.slice(0,60))}${n.commentText.length>60?'…':''}»</span>` : ''}
        </p>
        <p class="notif-time">${timeAgo(n.createdAt)}</p>
      </div>
      <div class="notif-icon ${label.cls}">${label.icon}</div>
    </div>`;
  }).join('');
  el.querySelectorAll('.notif-item').forEach(item =>
    item.addEventListener('click', async () => {
      const nid = item.dataset.nid, vid = item.dataset.vid, type = item.dataset.type;
      try { await updateDoc(doc(db, 'notifications', nid), { read: true }); } catch {}
      if (vid && (type === 'like' || type === 'comment' || type === 'repost')) {
        state.pendingOpenVideo = vid;
        switchTab('feed');
      } else if (type === 'follow') {
        const snap = await getDoc(doc(db, 'notifications', nid));
        if (snap.exists()) { state.viewingProfileUid = snap.data().actorId; switchTab('profile'); }
      }
    }));
}

// ═══ ONBOARDING ═══
let avatarFile = null;
$('#avatarInput').addEventListener('change', e => {
  const f = e.target.files?.[0]; if (!f) return;
  avatarFile = f;
  $('#avatarPreview').innerHTML = `<img src="${URL.createObjectURL(f)}" />`;
});
let unTimer;
$('#usernameInput').addEventListener('input', e => {
  const v = e.target.value.replace(/\s/g, '');
  e.target.value = v;
  clearTimeout(unTimer);
  if (!v) { $('#usernameStatus').textContent = ''; $('#usernameHint').textContent = ''; return; }
  unTimer = setTimeout(async () => {
    const ok = await isUsernameAvailable(v);
    $('#usernameStatus').textContent = ok ? '✅' : '❌';
    const h = $('#usernameHint');
    h.textContent = ok ? 'Свободен' : 'Занят';
    h.style.color = ok ? '#10b981' : '#ef4444';
  }, 350);
});
$('#onboardSubmitBtn').addEventListener('click', async () => {
  const username = $('#usernameInput').value.trim().toLowerCase();
  const displayName = $('#displayNameInput').value.trim() || username;
  const bio = $('#bioInput').value.trim();
  const errEl = $('#onboardError');
  errEl.classList.add('hidden');
  if (!/^[a-z0-9._]{3,20}$/i.test(username)) return showOnboardErr('Username: 3–20 символов a-z/0-9/._');
  if (!(await isUsernameAvailable(username, state.user.uid))) return showOnboardErr('Username занят');
  const btn = $('#onboardSubmitBtn');
  btn.disabled = true; btn.textContent = 'Сохраняем...';
  try {
    let avatarUrl = '';
    if (avatarFile) avatarUrl = await uploadToCloudinary(avatarFile, 'image');
    await setDoc(doc(db, 'users', state.user.uid),
      { username, displayName, bio, avatar: avatarUrl }, { merge: true });
    state.profile = await getUserProfile(state.user.uid);
    showScreen('mainApp');
    initMainApp();
    subscribeOwnProfile();
    subscribeNotifications();
    refreshTrending();
  } catch (err) { showOnboardErr(err.message); }
  btn.disabled = false; btn.textContent = 'Продолжить';
});
function showOnboardErr(msg) {
  const e = $('#onboardError');
  e.textContent = msg;
  e.classList.remove('hidden');
}

// ═══ TRENDING ═══
async function refreshTrending() {
  try {
    const q = query(collection(db, 'videos'), orderBy('createdAt', 'desc'), limit(300));
    const snap = await getDocs(q);
    const stats = new Map();
    snap.docs.forEach(d => {
      const v = d.data();
      const score = (v.viewsCount || 0) + (v.likesCount || 0) * 5 + (v.commentsCount || 0) * 3 + (v.sharesCount || 0) * 4;
      (v.hashtags || []).forEach(tag => {
        const t = String(tag).toLowerCase().replace(/^#/, '').trim();
        if (!t) return;
        if (!stats.has(t)) stats.set(t, { tag: t, posts: 0, score: 0 });
        const s = stats.get(t); s.posts++; s.score += score;
      });
    });
    const arr = [...stats.values()];
    if (!arr.length) { state.trendingTags = []; renderTrending(); return; }
    const avg = arr.reduce((s, x) => s + x.score, 0) / arr.length || 1;
    arr.forEach(x => x.boost = Math.round(((x.score - avg) / avg) * 100));
    arr.sort((a, b) => b.score - a.score);
    arr.forEach((x, i) => x.rank = i + 1);
    state.trendingTags = arr.slice(0, 20);
    renderTrending();
  } catch (e) { console.error('Trending:', e); renderTrending(); }
}
function getTrendingRank(tag) {
  const c = String(tag).toLowerCase().replace(/^#/, '').trim();
  const f = state.trendingTags.find(t => t.tag === c);
  return f ? f.rank : 0;
}
function getVideoBoost(video) {
  let b = 0;
  (video.hashtags || []).forEach(t => {
    const r = getTrendingRank(t);
    if (r > 0 && r <= 20) b += (21 - r);
  });
  return b;
}
function renderTrending() {
  const el = $('#trendsList');
  if (!el) return;
  if (!state.trendingTags.length) { el.innerHTML = `<p class="muted small">Пока нет трендов</p>`; return; }
  el.innerHTML = state.trendingTags.slice(0, 12).map(t => {
    const label = t.boost > 0 ? `🔥 +${t.boost}%` : t.rank <= 3 ? '🔥 TOP' : `📈 ${t.posts}`;
    return `<button class="trend-chip ${t.rank <= 3 ? 'trend-hot' : ''}" data-trend="#${t.tag}">
      <span>#${escapeHtml(t.tag)}</span><span class="trend-boost">${label}</span></button>`;
  }).join('');
  el.querySelectorAll('.trend-chip').forEach(c =>
    c.addEventListener('click', () => {
      $('#searchInput').value = c.dataset.trend;
      doSearch(c.dataset.trend);
    }));
}

// ═══ ACTION SHEET ═══
function openActionSheet(items) {
  const sheet = $('#actionSheet');
  const content = $('#actionSheetContent');
  content.innerHTML = items.map((it, i) =>
    `<button class="sheet-item ${it.danger ? 'danger' : ''}" data-idx="${i}">${it.icon}<span>${it.label}</span></button>`
  ).join('');
  content.querySelectorAll('.sheet-item').forEach(btn =>
    btn.addEventListener('click', () => {
      const item = items[+btn.dataset.idx];
      sheet.classList.add('hidden');
      setTimeout(() => item.action(), 50);
    }));
  sheet.classList.remove('hidden');
}
$('#actionSheet').addEventListener('click', e => {
  if (e.target.id === 'actionSheet') $('#actionSheet').classList.add('hidden');
});

// ═══ MINI PROFILE ═══
async function openMiniProfile(uid) {
  if (uid === state.user.uid) {
    state.viewingProfileUid = null;
    switchTab('profile');
    return;
  }
  const p = await getUserProfile(uid);
  if (!p) return toast('Профиль не найден');
  const followId = `${state.user.uid}_${uid}`;
  const followSnap = await getDoc(doc(db, 'follows', followId));
  const isFollowing = followSnap.exists();

  const modal = document.createElement('div');
  modal.className = 'overlay';
  modal.innerHTML = `
    <div class="mini-profile-sheet">
      <div class="mp-avatar">${p.avatar ? `<img src="${p.avatar}" />` : '👤'}</div>
      <div class="mp-name">${escapeHtml(p.displayName || p.username)}</div>
      <div class="mp-username">@${escapeHtml(p.username)}</div>
      <div class="mp-stats">
        <div><b>${fmtNum(p.followingCount)}</b><small>Подписки</small></div>
        <div><b>${fmtNum(p.followersCount)}</b><small>Подписчики</small></div>
        <div><b>${fmtNum(p.likesCount)}</b><small>Лайки</small></div>
      </div>
      ${p.bio ? `<p class="mp-bio">${escapeHtml(p.bio)}</p>` : ''}
      <div class="mp-actions">
        <button class="btn-${isFollowing ? 'secondary' : 'primary'}" id="mpFollowBtn">
          ${isFollowing ? 'Отписаться' : 'Подписаться'}
        </button>
        <button class="btn-secondary" id="mpOpenBtn">Открыть профиль</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  modal.querySelector('#mpFollowBtn').addEventListener('click', async () => {
    const btn = modal.querySelector('#mpFollowBtn');
    try {
      if (isFollowing) {
        await deleteDoc(doc(db, 'follows', followId));
        try { await updateDoc(doc(db, 'users', uid), { followersCount: increment(-1) }); } catch {}
        try { await updateDoc(doc(db, 'users', state.user.uid), { followingCount: increment(-1) }); } catch {}
        btn.textContent = 'Подписаться';
        btn.className = 'btn-primary';
      } else {
        await setDoc(doc(db, 'follows', followId), { followerId: state.user.uid, followingId: uid, createdAt: serverTimestamp() });
        try { await updateDoc(doc(db, 'users', uid), { followersCount: increment(1) }); } catch {}
        try { await updateDoc(doc(db, 'users', state.user.uid), { followingCount: increment(1) }); } catch {}
        createNotification(uid, 'follow', {});
        btn.textContent = 'Отписаться';
        btn.className = 'btn-secondary';
      }
      modal.remove();
    } catch (err) { handleError(err, 'mini.follow'); }
  });
  modal.querySelector('#mpOpenBtn').addEventListener('click', () => {
    modal.remove();
    state.viewingProfileUid = uid;
    switchTab('profile');
  });
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

// ═══ INIT ═══
function initMainApp() {
  if (state.inited) return;
  state.inited = true;

  $$('.nav-item').forEach(btn => btn.addEventListener('click', () => {
    const t = btn.dataset.tab;
    if (!t) return;
    if (t === 'profile') state.viewingProfileUid = null;
    switchTab(t);
  }));
  $('#tabForYou').addEventListener('click', () => setFeedMode('foryou'));
  $('#tabFollowing').addEventListener('click', () => setFeedMode('following'));

  const globalSoundBtn = $('#globalSoundBtn');
  if (globalSoundBtn) {
    globalSoundBtn.classList.toggle('muted', !settings.sound);
    globalSoundBtn.addEventListener('click', () => {
      settings.set('sound', !settings.sound);
      globalSoundBtn.classList.toggle('muted', !settings.sound);
      $$('.video-card video').forEach(v => { v.muted = !settings.sound; });
      $$('.video-card .sound-line').forEach(l => { l.style.display = !settings.sound ? 'block' : 'none'; });
    });
  }

  let searchTimer;
  $('#searchInput').addEventListener('input', e => {
    clearTimeout(searchTimer);
    const term = e.target.value.trim();
    $('#searchClearBtn').classList.toggle('hidden', !term);
    $('#searchFilterTabs').classList.toggle('hidden', !term);
    $('#trendingTitle').classList.toggle('hidden', !!term);
    if (!term) { $('#searchResults').innerHTML = ''; state.searchTerm = ''; return; }
    state.searchTerm = term;
    searchTimer = setTimeout(() => doSearch(term), 400);
  });
  $('#searchClearBtn').addEventListener('click', () => {
    $('#searchInput').value = '';
    $('#searchClearBtn').classList.add('hidden');
    $('#searchFilterTabs').classList.add('hidden');
    $('#trendingTitle').classList.remove('hidden');
    $('#searchResults').innerHTML = '';
  });
  $$('.sft-btn').forEach(b => b.addEventListener('click', () => {
    $$('.sft-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    state.searchFilter = b.dataset.sft;
    if (state.searchTerm) doSearch(state.searchTerm);
  }));

  $('#videoInput').addEventListener('change', onVideoPicked);
  $('#uploadSubmitBtn').addEventListener('click', submitUpload);
  $('#uploadCancelBtn').addEventListener('click', resetUpload);
  $('#saveDraftBtn').addEventListener('click', saveDraft);
  renderDrafts();

  $('#profileLogoutBtn').addEventListener('click', () => signOut(auth));
  $('#profileBackBtn').addEventListener('click', () => { state.viewingProfileUid = null; switchTab('profile'); });
  $('#profileSettingsBtn').addEventListener('click', () => switchTab('settings'));
  $('#profileQrBtn').addEventListener('click', () => openQrProfile(state.user.uid));
  $('#settingsBackBtn').addEventListener('click', () => switchTab('profile'));
  $('#historyBackBtn').addEventListener('click', () => switchTab('profile'));
  $('#openHistoryBtn').addEventListener('click', () => switchTab('history'));
  $('#clearHistoryBtn').addEventListener('click', clearHistory);
  $('#clearHistoryBtn2').addEventListener('click', clearHistory);
  $('#inboxReadAllBtn').addEventListener('click', readAllNotifs);
  $$('.if-btn').forEach(b => b.addEventListener('click', () => {
    $$('.if-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    state.inboxFilter = b.dataset.if;
    renderInbox();
  }));
  $$('.profile-tab').forEach(tab => tab.addEventListener('click', () => {
    $$('.profile-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    loadProfileGrid(tab.dataset.ptab);
  }));

  $('#commentsCloseBtn').addEventListener('click', closeComments);
  $('#commentsOverlay').addEventListener('click', e => { if (e.target.id === 'commentsOverlay') closeComments(); });
  $('#commentSendBtn').addEventListener('click', sendComment);
  $('#commentInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendComment(); });
  $('#cancelReplyBtn').addEventListener('click', cancelReply);
  $('#emojiToggleBtn').addEventListener('click', toggleEmojiBar);

  $('#feedContainer').addEventListener('scroll', e => {
    const el = e.target;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 400) loadMoreFeed();
  });

  $$('.theme-card').forEach(b => b.addEventListener('click', () => settings.set('theme', b.dataset.themeVal)));
  $('#settingAutoplay').addEventListener('change', e => settings.set('autoplay', e.target.checked));
  $('#settingSound').addEventListener('change', e => settings.set('sound', e.target.checked));
  $('#settingDataSaver').addEventListener('change', e => settings.set('dataSaver', e.target.checked));
  $('#settingHideLikes').addEventListener('change', e => settings.set('hideLikes', e.target.checked));
  $('#clearCacheBtn').addEventListener('click', () => {
    if (!confirm('Очистить кэш?')) return;
    const keep = { np_theme: settings.theme };
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('np_') && !(k in keep)) localStorage.removeItem(k);
    });
    toast('Кэш очищен');
  });
  $('#testCloudBtn').addEventListener('click', testCloudinary);
  $('#testFirestoreBtn').addEventListener('click', testFirestore);
  $('#exportSettingsBtn').addEventListener('click', exportSettings);
  $('#settingsCloudInfo').textContent = `${CLOUDINARY.cloudName} · ${CLOUDINARY.uploadPreset}`;

  initPwa();
  settings.apply();
  setFeedMode('foryou');
  refreshTrending();
  setInterval(() => { if (state.user && state.tab === 'feed') refreshTrending(); }, 60000);
}

function switchTab(tab) {
  state.tab = tab;
  $$('.tab-screen').forEach(s => s.classList.remove('active'));
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.tab === tab));
  const el = $('#' + tab + 'Screen');
  if (el) el.classList.add('active');
  if (tab === 'feed') setFeedMode(state.feedMode);
  if (tab === 'profile') loadProfile(state.viewingProfileUid || state.user.uid);
  if (tab === 'discover') refreshTrending();
  if (tab === 'settings') settings.apply();
  if (tab === 'history') renderHistory();
}

// ═══ FEED ═══
function setFeedMode(mode) {
  state.feedMode = mode;
  $('#tabForYou').classList.toggle('active', mode === 'foryou');
  $('#tabFollowing').classList.toggle('active', mode === 'following');
  state.feedExhausted = false; state.feedCursor = null;
  state.renderedCards.clear();
  $('#feedContainer').innerHTML = '';
  unsub('feed'); unsub('feedFollowing');
  subscribeFeed();
}
function feedScore(video) {
  const now = Date.now();
  const created = video.createdAt?.toDate?.()?.getTime?.() || now;
  const recency = 1000 / ((now - created) / 3600000 + 1);
  return recency + getVideoBoost(video) * 30;
}
function subscribeFeed() {
  const container = $('#feedContainer');
  if (container && state.renderedCards.size === 0) {
    container.innerHTML = `<div class="skeleton-feed"><div class="skeleton-video"></div></div>`;
  }
  if (state.feedMode === 'foryou') {
    const q = query(collection(db, 'videos'), orderBy('createdAt', 'desc'), limit(50));
    const u = onSnapshot(q,
      async snap => {
        const videos = await Promise.all(snap.docs.map(async d => {
          const data = d.data();
          const author = await getUserProfile(data.authorId).catch(() => null);
          return { videoId: d.id, ...data, author };
        }));
        videos.sort((a, b) => feedScore(b) - feedScore(a));
        if (videos.length) state.feedCursor = snap.docs.at(-1);
        diffFeed(videos);
      }, err => handleError(err, 'feed'));
    state.subs.set('feed', u);
  } else {
    const uf = onSnapshot(
      query(collection(db, 'follows'), where('followerId', '==', state.user.uid)),
      fs => {
        const ids = fs.docs.map(d => d.data().followingId).slice(0, 30);
        unsub('feedFollowing');
        if (!ids.length) {
          $('#feedContainer').innerHTML = emptyFeedHTML('Подпишись на кого-нибудь');
          state.renderedCards.clear(); return;
        }
        const q = query(collection(db, 'videos'), where('authorId', 'in', ids), orderBy('createdAt', 'desc'), limit(30));
        const u = onSnapshot(q,
          async snap => {
            const videos = await Promise.all(snap.docs.map(async d => {
              const data = d.data();
              const author = await getUserProfile(data.authorId).catch(() => null);
              return { videoId: d.id, ...data, author };
            }));
            if (videos.length) state.feedCursor = snap.docs.at(-1);
            if (!videos.length) {
              $('#feedContainer').innerHTML = emptyFeedHTML('Пока нет видео от подписок');
              state.renderedCards.clear();
            } else diffFeed(videos);
          }, err => handleError(err, 'followingFeed'));
        state.subs.set('feedFollowing', u);
      }, err => handleError(err, 'follows'));
    state.subs.set('feed', uf);
  }
}
function emptyFeedHTML(text) {
  return `<div class="empty-state" style="height:100%;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="m9 18 6-6-6-6"/></svg><p>${escapeHtml(text)}</p></div>`;
}
async function loadMoreFeed() {
  if (state.feedExhausted || state.feedMode === 'following' || !state.feedCursor) return;
  state.feedExhausted = true;
  try {
    const q = query(collection(db, 'videos'), orderBy('createdAt', 'desc'), startAfter(state.feedCursor), limit(20));
    const snap = await getDocs(q);
    if (snap.empty) return;
    state.feedCursor = snap.docs.at(-1);
    const videos = await Promise.all(snap.docs.map(async d => {
      const data = d.data();
      const author = await getUserProfile(data.authorId).catch(() => null);
      return { videoId: d.id, ...data, author };
    }));
    videos.forEach(v => {
      if (state.renderedCards.has(v.videoId)) return;
      const card = renderVideoCard(v);
      $('#feedContainer').appendChild(card);
      state.renderedCards.set(v.videoId, card);
    });
  } catch (err) { handleError(err, 'loadMore'); }
  finally { state.feedExhausted = false; }
}
function diffFeed(videos) {
  const container = $('#feedContainer');
  videos = videos.filter(v => !notInterested.has(v.videoId));
  if (!videos.length) {
    container.innerHTML = emptyFeedHTML('Пока нет видео');
    state.renderedCards.clear(); return;
  }
  if (container.querySelector('.empty-state') || container.querySelector('.skeleton-feed')) container.innerHTML = '';
  const newIds = new Set(videos.map(v => v.videoId));
  for (const [id, card] of state.renderedCards) {
    if (!newIds.has(id)) { card.remove(); state.renderedCards.delete(id); }
  }
  videos.forEach((v, idx) => {
    let card = state.renderedCards.get(v.videoId);
    if (!card) {
      card = renderVideoCard(v);
      const target = container.children[idx];
      if (target) container.insertBefore(card, target);
      else container.appendChild(card);
      state.renderedCards.set(v.videoId, card);
    } else updateCardCounts(card, v);
  });
  const targetVid = state.pendingOpenVideo || state.pendingVideoId;
  if (targetVid) {
    const el = container.querySelector(`[data-video-id="${targetVid}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    state.pendingOpenVideo = null; state.pendingVideoId = null;
  }
}
function updateCardCounts(card, v) {
  ['likes', 'comments', 'shares', 'views'].forEach(k => {
    const el = card.querySelector(`[data-count="${k}"]`);
    if (el) el.textContent = fmtNum(v[k + 'Count']);
  });
}

// ═══ VIDEO CARD ═══
function renderVideoCard(video) {
  const card = document.createElement('div');
  card.className = 'video-card';
  card.dataset.videoId = video.videoId;

  const isRepost = video.repostOf && video.originalAuthorUsername;
  const a = isRepost
    ? {
        username: video.originalAuthorUsername,
        avatar: video.originalAuthorAvatar || '',
        uid: video.originalAuthorId,
      }
    : (video.author || { username: 'user', avatar: '', uid: video.authorId });
  const isOwn = !isRepost && state.user.uid === video.authorId;
  const isMyRepost = isRepost && state.user.uid === video.authorId;
  const boost = getVideoBoost(video);

  card.innerHTML = `
    <video src="${video.videoUrl}" ${video.thumbnailUrl ? `poster="${video.thumbnailUrl}"` : ''}
      loop ${settings.sound ? '' : 'muted'} playsinline preload="metadata"></video>
    <div class="video-progress"><div class="video-progress-bar"></div></div>
    ${isRepost ? `<div class="repost-badge">🔁 Репост от @${escapeHtml(video.originalAuthorUsername)}</div>` : ''}
    ${boost > 0 && !isRepost ? `<div class="boost-badge">🔥 +${boost}</div>` : ''}
    <div class="video-overlay-top-right">
      <button class="mute-btn" data-act="mute">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5 6 9H2v6h4l5 4V5z"/><line class="sound-line" x1="23" y1="9" x2="17" y2="15"/><line class="sound-line" x1="17" y1="9" x2="23" y2="15"/></svg>
      </button>
    </div>
    <div class="action-rail">
      <button class="author-avatar-btn" data-act="avatar">
        ${a.avatar ? `<img src="${a.avatar}" />` : `<div class="avatar-placeholder">👤</div>`}
        ${!isOwn && !isMyRepost ? `<span class="follow-badge" data-act="follow">+</span>` : ''}
      </button>
      <button class="action-btn" data-act="like">
        <svg class="heart-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        <span class="count" data-count="likes">${fmtNum(video.likesCount)}</span>
      </button>
      <button class="action-btn" data-act="comments">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span class="count" data-count="comments">${fmtNum(video.commentsCount)}</span>
      </button>
      <button class="action-btn" data-act="save">
        <svg class="bookmark-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
      </button>
      <button class="action-btn dots" data-act="more">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="6" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="18" r="1.5"/></svg>
      </button>
    </div>
    <div class="video-info">
      ${isMyRepost ? `<p style="font-size:12px;color:rgba(255,255,255,0.7);margin-bottom:4px;">🔁 Репост от тебя</p>` : ''}
      <button class="video-author" data-act="profile">@${escapeHtml(a.username)}</button>
      <p class="video-caption">${renderText(video.caption || '')}</p>
      ${video.hashtags?.length ? `<p class="video-hashtags">${video.hashtags.slice(0,5).map(h => `<span class="tag-link" data-hashtag="#${h}">#${escapeHtml(h)}</span>`).join(' ')}</p>` : ''}
      <div class="video-music">
        <span>♪</span><span>${escapeHtml(video.music || 'original sound')}</span>
        <span class="video-views">· ${fmtNum(video.viewsCount)}</span>
        <span class="video-time">· ${timeAgo(video.createdAt)}</span>
      </div>
    </div>`;

  const vid = card.querySelector('video');
  vid.muted = !settings.sound;
  card.querySelectorAll('.sound-line').forEach(l => l.style.display = vid.muted ? '' : 'none');

  const progressBar = card.querySelector('.video-progress-bar');
  vid.addEventListener('timeupdate', () => {
    if (vid.duration) progressBar.style.width = (vid.currentTime / vid.duration * 100) + '%';
  });

  const io = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      if (settings.autoplay) vid.play().catch(() => {});
      if (!state.viewedVideos.has(video.videoId)) {
        state.viewedVideos.add(video.videoId);
        updateDoc(doc(db, 'videos', video.videoId), { viewsCount: increment(1) }).catch(() => {});
        history.add({
          videoId: video.videoId, videoUrl: video.videoUrl, thumbnailUrl: video.thumbnailUrl,
          caption: video.caption, authorUsername: a.username, authorId: video.authorId,
        });
      }
    } else vid.pause();
  }, { threshold: 0.6 });
  io.observe(card);

  let tapTimer = null, lastTap = 0;
  vid.addEventListener('click', e => {
    if (e.target.closest('button')) return;
    const now = Date.now();
    if (now - lastTap < 280) {
      clearTimeout(tapTimer);
      doLike(video, card, true);
      showBigHeart(card);
    } else {
      tapTimer = setTimeout(() => {
        if (vid.paused) { vid.play().catch(() => {}); removePlayIndicator(card); }
        else { vid.pause(); showPlayIndicator(card); }
      }, 260);
    }
    lastTap = now;
  });

  card.querySelectorAll('[data-hashtag]').forEach(t =>
    t.addEventListener('click', e => {
      e.stopPropagation();
      switchTab('discover');
      $('#searchInput').value = t.dataset.hashtag;
      doSearch(t.dataset.hashtag);
    }));
  card.querySelectorAll('[data-mention]').forEach(t =>
    t.addEventListener('click', async e => {
      e.stopPropagation();
      const username = t.dataset.mention.replace('@', '');
      const q = query(collection(db, 'users'), where('username', '==', username), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) { state.viewingProfileUid = snap.docs[0].id; switchTab('profile'); }
    }));

  card.querySelectorAll('[data-act]').forEach(btn =>
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const act = btn.dataset.act;
      if (act === 'avatar') {
        const authorUid = isRepost ? video.originalAuthorId : video.authorId;
        openMiniProfile(authorUid);
        return;
      }
      if (act === 'mute') { vid.muted = !vid.muted; card.querySelectorAll('.sound-line').forEach(l => l.style.display = vid.muted ? '' : 'none'); }
      if (act === 'like') doLike(video, card);
      if (act === 'comments') openComments(video);
      if (act === 'save') doSave(video, card);
      if (act === 'more') openVideoMoreMenu(video, card);
      if (act === 'profile') { 
        state.viewingProfileUid = isRepost ? video.originalAuthorId : video.authorId; 
        switchTab('profile'); 
      }
      if (act === 'follow') doFollow(isRepost ? video.originalAuthorId : video.authorId, btn);
    }));

  (async () => {
    try {
      const followTarget = isRepost ? video.originalAuthorId : video.authorId;
      const [l, s, f] = await Promise.all([
        getDoc(doc(db, 'likes', `${state.user.uid}_${video.videoId}`)),
        getDoc(doc(db, 'saves', `${state.user.uid}_${video.videoId}`)),
        (isOwn || isMyRepost) ? Promise.resolve(null) : getDoc(doc(db, 'follows', `${state.user.uid}_${followTarget}`))
      ]);
      if (l.exists()) card.querySelector('.heart-icon').classList.add('liked');
      if (s.exists()) card.querySelector('.bookmark-icon').classList.add('saved');
      const badge = card.querySelector('.follow-badge');
      if (badge && f?.exists()) badge.classList.add('following');
    } catch {}
  })();

  return card;
}

// ═══ MORE MENU ═══
function openVideoMoreMenu(video, card) {
  const isOwn = video.authorId === state.user.uid;
  const items = [
    { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>', label: 'Репост', action: () => doRepost(video) },
    { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>', label: 'Поделиться', action: () => shareVideo(video) },
    { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>', label: 'Скачать', action: () => downloadVideo(video) },
    { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>', label: 'Использовать звук', action: () => useSound(video) },
    { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 2"/><circle cx="12" cy="12" r="10"/></svg>', label: 'Смотреть позже', action: () => addWatchLater(video) },
    { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>', label: 'В коллекцию', action: () => addToCollection(video) },
    { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>', label: 'Пожаловаться', action: () => openReport(video) },
  ];
  if (!isOwn) items.push({
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>',
    label: 'Не интересно', action: () => markNotInterested(video, card)
  });
  if (isOwn && !video.repostOf) items.push(
    { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>', label: 'Редактировать', action: () => editVideo(video) },
    { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M2 12h20"/></svg>', label: 'Закрепить', action: () => pinVideo(video) },
    { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>', label: 'Удалить', danger: true, action: () => doDeleteVideo(video) }
  );
  if (isOwn && video.repostOf) items.push(
    { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>', label: 'Удалить репост', danger: true, action: () => doDeleteVideo(video) }
  );
  openActionSheet(items);
}

// ═══ ACTIONS ═══
async function doDeleteVideo(video) {
  if (video.authorId !== state.user.uid) return;
  if (!confirm('Удалить?')) return;
  try { await deleteDoc(doc(db, 'videos', video.videoId)); toast('Удалено'); refreshTrending(); }
  catch (err) { handleError(err, 'delete'); }
}

async function doRepost(video) {
  if (video.authorId === state.user.uid && !video.repostOf) return toast('Нельзя репостить своё');
  const originalId = video.repostOf || video.videoId;
  try {
    const q = query(collection(db, 'videos'),
      where('authorId', '==', state.user.uid),
      where('repostOf', '==', originalId), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) return toast('Ты уже репостил это видео');
  } catch (err) { console.warn('Repost check:', err); }
  if (!confirm(`Репост @${video.author?.username || video.originalAuthorUsername || 'user'}?`)) return;
  try {
    await addDoc(collection(db, 'videos'), {
      authorId: state.user.uid,
      videoUrl: video.videoUrl,
      thumbnailUrl: video.thumbnailUrl || '',
      caption: video.caption || '',
      hashtags: video.hashtags || [],
      music: video.music || 'original sound',
      repostOf: originalId,
      originalAuthorId: video.originalAuthorId || video.authorId,
      originalAuthorUsername: video.originalAuthorUsername || video.author?.username || '',
      originalAuthorAvatar: video.originalAuthorAvatar || video.author?.avatar || '',
      likesCount: 0, commentsCount: 0, sharesCount: 0, viewsCount: 0,
      createdAt: serverTimestamp(),
    });
    createNotification(video.originalAuthorId || video.authorId, 'repost', { videoId: originalId });
    toast('Репост опубликован ✔');
  } catch (err) { handleError(err, 'repost'); }
}

async function downloadVideo(video) {
  try {
    const res = await fetch(video.videoUrl, { mode: 'cors' });
    if (!res.ok) throw new Error('fail');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `nippik_${video.videoId}.mp4`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast('Скачивание начато');
  } catch {
    window.open(video.videoUrl, '_blank');
    toast('Открыто в новой вкладке');
  }
}

function useSound(video) {
  state.pendingSound = {
    music: video.music || 'original sound',
    videoId: video.videoId,
    authorUsername: video.author?.username || 'user',
  };
  switchTab('upload');
  const sf = $('#soundFromVideo');
  sf.classList.remove('hidden');
  sf.innerHTML = `<div class="music-icon">♪</div>
    <div style="flex:1;">
      <div style="font-weight:600;">${escapeHtml(state.pendingSound.music)}</div>
      <div style="font-size:11px;color:var(--text-3);">от @${escapeHtml(state.pendingSound.authorUsername)}</div>
    </div>
    <button class="btn-small" id="cancelSoundBtn">✕</button>`;
  $('#musicInput').value = state.pendingSound.music;
  $('#cancelSoundBtn').addEventListener('click', () => {
    state.pendingSound = null;
    sf.classList.add('hidden');
    $('#musicInput').value = '';
  });
  toast('Звук выбран');
}

async function addWatchLater(video) {
  try {
    await setDoc(doc(db, 'saves', `${state.user.uid}_wl_${video.videoId}`),
      { userId: state.user.uid, videoId: video.videoId, collection: 'watchlater', createdAt: serverTimestamp() });
    toast('Добавлено в «Смотреть позже»');
  } catch (err) { handleError(err, 'wl'); }
}

async function addToCollection(video) {
  const collections = ['Избранное', 'Красивое', 'Смешное', 'Музыка', 'Для обучения'];
  const items = collections.map(c => ({
    icon: '📁', label: c,
    action: async () => {
      try {
        await setDoc(doc(db, 'saves', `${state.user.uid}_${c}_${video.videoId}`),
          { userId: state.user.uid, videoId: video.videoId, collection: c, createdAt: serverTimestamp() });
        toast(`Сохранено в «${c}»`);
      } catch (err) { handleError(err, 'coll'); }
    }
  }));
  openActionSheet(items);
}

function markNotInterested(video, card) {
  notInterested.add(video.videoId);
  card.remove();
  state.renderedCards.delete(video.videoId);
  toast('Не покажем больше');
}

async function editVideo(video) {
  const modal = document.createElement('div');
  modal.className = 'overlay';
  modal.innerHTML = `<div class="comments-sheet" style="height:auto;">
    <div class="comments-header"><div style="width:24px"></div><p>Редактировать</p>
    <button class="icon-btn ed-close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>
    <div style="padding:20px;">
      <label class="field-label">Описание</label>
      <textarea id="edCaption" rows="3">${escapeHtml(video.caption || '')}</textarea>
      <label class="field-label">Хэштеги</label>
      <input id="edTags" type="text" value="${(video.hashtags || []).map(h => '#' + h).join(' ')}" />
      <button class="btn-primary" style="margin-top:20px;" id="edSave">Сохранить</button>
    </div></div>`;
  document.body.appendChild(modal);
  modal.querySelector('.ed-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  modal.querySelector('#edSave').addEventListener('click', async () => {
    try {
      const caption = modal.querySelector('#edCaption').value.trim();
      const hashtags = modal.querySelector('#edTags').value.trim().split(/\s+/).filter(Boolean).map(h => h.replace(/^#/, '').toLowerCase());
      await updateDoc(doc(db, 'videos', video.videoId), { caption, hashtags });
      toast('Обновлено ✔'); modal.remove();
    } catch (err) { toast(err.message); }
  });
}

async function pinVideo(video) {
  try {
    await updateDoc(doc(db, 'users', state.user.uid), { pinnedVideoId: video.videoId });
    toast('Закреплено');
  } catch (err) { toast(err.message); }
}

async function shareVideo(video) {
  const url = `${location.origin}/?v=${video.videoId}`;
  const items = [
    { icon: '📋', label: 'Копировать ссылку', action: async () => {
      await navigator.clipboard.writeText(url); toast('Скопировано'); } },
    { icon: '📱', label: 'Telegram', action: () => window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}`, '_blank') },
    { icon: '💚', label: 'WhatsApp', action: () => window.open(`https://wa.me/?text=${encodeURIComponent(url)}`, '_blank') },
    { icon: '🐦', label: 'Twitter / X', action: () => window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}`, '_blank') },
    { icon: '🔵', label: 'ВКонтакте', action: () => window.open(`https://vk.com/share.php?url=${encodeURIComponent(url)}`, '_blank') },
  ];
  if (navigator.share) items.unshift({
    icon: '📤', label: 'Системное меню', action: async () => {
      try { await navigator.share({ url, title: 'NipPik' }); } catch {}
    }
  });
  openActionSheet(items);
}

function openReport(video) {
  const reasons = ['Спам', 'Насилие', 'Порнография', 'Наркотики', 'Оскорбления', 'Другое'];
  const items = reasons.map(r => ({
    icon: '🚩', label: r,
    action: async () => {
      try {
        await addDoc(collection(db, 'reports'), {
          videoId: video.videoId, authorId: video.authorId,
          reporterId: state.user.uid, reason: r, createdAt: serverTimestamp()
        });
        toast('Жалоба отправлена ✔');
      } catch (err) { handleError(err, 'report'); }
    }
  }));
  openActionSheet(items);
}

async function openQrProfile(uid) {
  const p = await getUserProfile(uid);
  if (!p) return;
  const url = `${location.origin}/?u=${p.username}`;
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}`;
  const modal = document.createElement('div');
  modal.className = 'overlay';
  modal.innerHTML = `<div class="qr-modal">
    <h3>@${escapeHtml(p.username)}</h3>
    <p>Отсканируй профиль</p>
    <img src="${qr}" />
    <button class="btn-primary" id="qrShare">Поделиться</button>
    <button class="btn-secondary" style="width:100%;margin-top:8px;" id="qrClose">Закрыть</button>
  </div>`;
  document.body.appendChild(modal);
  modal.querySelector('#qrClose').addEventListener('click', () => modal.remove());
  modal.querySelector('#qrShare').addEventListener('click', async () => {
    try {
      if (navigator.share) await navigator.share({ url, title: 'NipPik' });
      else { await navigator.clipboard.writeText(url); toast('Скопировано'); }
    } catch {}
  });
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

// ═══ LIKE/SAVE/FOLLOW ═══
function showBigHeart(card) {
  const el = document.createElement('div');
  el.className = 'big-heart';
  el.innerHTML = `<svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
  card.appendChild(el);
  setTimeout(() => el.remove(), 900);
}
function showPlayIndicator(card) {
  if (card.querySelector('.play-indicator')) return;
  const el = document.createElement('div');
  el.className = 'play-indicator';
  el.innerHTML = `<div class="play-circle"><div class="play-triangle"></div></div>`;
  card.appendChild(el);
}
function removePlayIndicator(card) { card.querySelector('.play-indicator')?.remove(); }

async function doLike(video, card, force = false) {
  const isOwnOriginal = video.authorId === state.user.uid && !video.repostOf;
  if (isOwnOriginal) return toast('Своё нельзя лайкнуть');
  const heart = card.querySelector('.heart-icon');
  const countEl = card.querySelector('[data-count="likes"]');
  const ref = doc(db, 'likes', `${state.user.uid}_${video.videoId}`);
  let existed = false;
  try { existed = (await getDoc(ref)).exists(); } catch (err) { return handleError(err, 'like'); }
  if (!existed) {
    heart.classList.add('liked');
    countEl.textContent = fmtNum((video.likesCount || 0) + 1);
    try { await setDoc(ref, { userId: state.user.uid, videoId: video.videoId, createdAt: serverTimestamp() }); }
    catch (err) { heart.classList.remove('liked'); countEl.textContent = fmtNum(video.likesCount || 0); return handleError(err, 'like'); }
    const notifyAuthor = video.repostOf ? video.originalAuthorId : video.authorId;
    try { await updateDoc(doc(db, 'videos', video.videoId), { likesCount: increment(1) }); } catch {}
    try { await updateDoc(doc(db, 'users', notifyAuthor), { likesCount: increment(1) }); } catch {}
    createNotification(notifyAuthor, 'like', { videoId: video.repostOf || video.videoId });
    video.likesCount = (video.likesCount || 0) + 1;
  } else if (!force) {
    heart.classList.remove('liked');
    countEl.textContent = fmtNum(Math.max(0, (video.likesCount || 1) - 1));
    try { await deleteDoc(ref); }
    catch (err) { heart.classList.add('liked'); countEl.textContent = fmtNum(video.likesCount || 0); return handleError(err, 'unlike'); }
    const notifyAuthor = video.repostOf ? video.originalAuthorId : video.authorId;
    try { await updateDoc(doc(db, 'videos', video.videoId), { likesCount: increment(-1) }); } catch {}
    try { await updateDoc(doc(db, 'users', notifyAuthor), { likesCount: increment(-1) }); } catch {}
    video.likesCount = Math.max(0, (video.likesCount || 1) - 1);
  }
}

async function doSave(video, card) {
  const isOwnOriginal = video.authorId === state.user.uid && !video.repostOf;
  if (isOwnOriginal) return toast('Своё нельзя сохранить');
  const icon = card.querySelector('.bookmark-icon');
  const ref = doc(db, 'saves', `${state.user.uid}_${video.videoId}`);
  let existed = false;
  try { existed = (await getDoc(ref)).exists(); } catch (err) { return handleError(err, 'save'); }
  if (!existed) {
    icon.classList.add('saved');
    try { await setDoc(ref, { userId: state.user.uid, videoId: video.videoId, createdAt: serverTimestamp() }); toast('Сохранено'); }
    catch (err) { icon.classList.remove('saved'); handleError(err, 'save'); }
  } else {
    icon.classList.remove('saved');
    try { await deleteDoc(ref); } catch (err) { icon.classList.add('saved'); handleError(err, 'unsave'); }
  }
}

async function doFollow(authorId, badgeEl) {
  if (authorId === state.user.uid) return toast('Себя подписать нельзя');
  const ref = doc(db, 'follows', `${state.user.uid}_${authorId}`);
  let existed = false;
  try { existed = (await getDoc(ref)).exists(); } catch (err) { return handleError(err, 'follow'); }
  if (!existed) {
    badgeEl.classList.add('following');
    try { await setDoc(ref, { followerId: state.user.uid, followingId: authorId, createdAt: serverTimestamp() }); }
    catch (err) { badgeEl.classList.remove('following'); return handleError(err, 'follow'); }
    try { await updateDoc(doc(db, 'users', authorId), { followersCount: increment(1) }); } catch {}
    try { await updateDoc(doc(db, 'users', state.user.uid), { followingCount: increment(1) }); } catch {}
    createNotification(authorId, 'follow', {});
  } else {
    badgeEl.classList.remove('following');
    try { await deleteDoc(ref); }
    catch (err) { badgeEl.classList.add('following'); return handleError(err, 'unfollow'); }
    try { await updateDoc(doc(db, 'users', authorId), { followersCount: increment(-1) }); } catch {}
    try { await updateDoc(doc(db, 'users', state.user.uid), { followingCount: increment(-1) }); } catch {}
  }
}

// ═══ COMMENTS ═══
const EMOJI_LIST = ['❤️','🔥','😂','😍','😮','😢','👍','👏','💯','🎉','✨','💪','🙌','😎','🤔','🥰','😭','🤣','👀','💀','🎵','🎬','🌟','⚡','🍕','🐱','🐶','🌈','☀️','🌙'];
function toggleEmojiBar() {
  const bar = $('#emojiBar');
  if (!bar.innerHTML) {
    bar.innerHTML = EMOJI_LIST.map(e => `<button class="emoji-btn" data-emoji="${e}">${e}</button>`).join('');
    bar.querySelectorAll('.emoji-btn').forEach(b =>
      b.addEventListener('click', () => {
        const input = $('#commentInput');
        input.value += b.dataset.emoji;
        input.focus();
      }));
  }
  bar.classList.toggle('hidden');
}

function openComments(video) {
  state.currentCommentsVideo = video;
  state.replyTo = null;
  $('#replyIndicator').classList.add('hidden');
  $('#emojiBar').classList.add('hidden');
  $('#commentsOverlay').classList.remove('hidden');
  const listEl = $('#commentsList');
  listEl.innerHTML = `<p class="comment-empty">Загрузка...</p>`;
  unsub('comments');

  const q = query(collection(db, 'comments'), where('videoId', '==', video.videoId), orderBy('createdAt', 'desc'), limit(100));
  const u = onSnapshot(q,
    snap => {
      const comments = snap.docs.map(d => ({ commentId: d.id, ...d.data() }));
      const rootComments = comments.filter(c => !c.parentId);
      const repliesByParent = {};
      comments.filter(c => c.parentId).forEach(r => {
        if (!repliesByParent[r.parentId]) repliesByParent[r.parentId] = [];
        repliesByParent[r.parentId].push(r);
      });
      $('#commentsTitle').textContent = `${comments.length} комментариев`;
      if (!rootComments.length) {
        listEl.innerHTML = `<p class="comment-empty">Пока нет комментариев</p>`;
        return;
      }
      const renderComment = (c, isReply = false) => {
        const liked = (c.likedBy || []).includes(state.user.uid);
        const cls = isReply ? 'comment-reply' : 'comment-main';
        return `<div class="${cls}">
          ${c.authorAvatar ? `<img class="comment-avatar" src="${c.authorAvatar}" />` : `<div class="comment-avatar">👤</div>`}
          <div class="comment-body">
            <p class="comment-author">@${escapeHtml(c.authorUsername || 'user')}</p>
            <p class="comment-text">${renderText(c.text)}</p>
            <div style="display:flex;align-items:center;gap:4px;">
              <button class="comment-like" data-cid="${c.commentId}" style="${liked ? 'color:#fe2c55;' : ''}">
                <svg viewBox="0 0 24 24" fill="${liked ? '#fe2c55' : 'none'}" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                <span>${c.likesCount || 0}</span>
              </button>
              ${!isReply ? `<button class="comment-reply-btn" data-cid="${c.commentId}" data-cuser="${c.authorUsername}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M9 17H7a4 4 0 0 1-4-4V5"/><path d="m9 11-4 4 4 4"/></svg>
                Ответить</button>` : ''}
              <span style="color:var(--text-3);font-size:11px;margin-left:6px;">${timeAgo(c.createdAt)}</span>
            </div>
          </div>
        </div>`;
      };
      listEl.innerHTML = rootComments.map(c => {
        const replies = repliesByParent[c.commentId] || [];
        return `<div class="comment-item has-replies">
          ${renderComment(c, false)}
          ${replies.length ? `<div class="comment-replies">${replies.map(r => renderComment(r, true)).join('')}</div>` : ''}
        </div>`;
      }).join('');
      listEl.querySelectorAll('.comment-like').forEach(b =>
        b.addEventListener('click', () => likeComment(b.dataset.cid, b)));
      listEl.querySelectorAll('.comment-reply-btn').forEach(b =>
        b.addEventListener('click', () => {
          state.replyTo = { commentId: b.dataset.cid, username: b.dataset.cuser };
          $('#replyIndicator').classList.remove('hidden');
          $('#replyToText').textContent = `Ответ @${b.dataset.cuser}`;
          $('#commentInput').focus();
        }));
      listEl.querySelectorAll('[data-hashtag]').forEach(t =>
        t.addEventListener('click', () => {
          closeComments(); switchTab('discover');
          $('#searchInput').value = t.dataset.hashtag; doSearch(t.dataset.hashtag);
        }));
      listEl.querySelectorAll('[data-mention]').forEach(t =>
        t.addEventListener('click', async () => {
          const username = t.dataset.mention.replace('@', '');
          const q = query(collection(db, 'users'), where('username', '==', username), limit(1));
          const snap = await getDocs(q);
          if (!snap.empty) {
            closeComments();
            state.viewingProfileUid = snap.docs[0].id; switchTab('profile');
          }
        }));
    }, err => handleError(err, 'comments'));
  state.subs.set('comments', u);
}

async function likeComment(commentId, btn) {
  try {
    const snap = await getDoc(doc(db, 'comments', commentId));
    if (!snap.exists()) return;
    const data = snap.data();
    const likedBy = data.likedBy || [];
    const already = likedBy.includes(state.user.uid);
    const newLikedBy = already ? likedBy.filter(id => id !== state.user.uid) : [...likedBy, state.user.uid];
    await updateDoc(doc(db, 'comments', commentId), { likedBy: newLikedBy, likesCount: newLikedBy.length });
    btn.querySelector('span').textContent = newLikedBy.length;
    btn.style.color = already ? '' : '#fe2c55';
    btn.querySelector('svg').setAttribute('fill', already ? 'none' : '#fe2c55');
  } catch (err) { handleError(err, 'comment.like'); }
}

function cancelReply() {
  state.replyTo = null;
  $('#replyIndicator').classList.add('hidden');
}
function closeComments() {
  $('#commentsOverlay').classList.add('hidden');
  unsub('comments');
  state.currentCommentsVideo = null;
  state.replyTo = null;
}
async function sendComment() {
  const input = $('#commentInput');
  const text = input.value.trim();
  if (!text || !state.currentCommentsVideo) return;
  const isOwnOriginal = state.currentCommentsVideo.authorId === state.user.uid && !state.currentCommentsVideo.repostOf;
  if (isOwnOriginal) return toast('Своё нельзя комментить');
  input.value = '';
  try {
    const data = {
      videoId: state.currentCommentsVideo.videoId,
      authorId: state.user.uid,
      authorUsername: state.profile.username,
      authorAvatar: state.profile.avatar || '',
      text, likesCount: 0, likedBy: [], createdAt: serverTimestamp()
    };
    if (state.replyTo) {
      data.parentId = state.replyTo.commentId;
      data.replyToUsername = state.replyTo.username;
    }
    await addDoc(collection(db, 'comments'), data);
    const notifyAuthor = state.currentCommentsVideo.repostOf ? state.currentCommentsVideo.originalAuthorId : state.currentCommentsVideo.authorId;
    try { await updateDoc(doc(db, 'videos', state.currentCommentsVideo.videoId), { commentsCount: increment(1) }); } catch {}
    createNotification(notifyAuthor, 'comment', {
      videoId: state.currentCommentsVideo.repostOf || state.currentCommentsVideo.videoId,
      commentText: text
    });
    cancelReply();
  } catch (err) { input.value = text; handleError(err, 'comment.send'); }
}

// ═══ SEARCH ═══
async function doSearch(term) {
  const el = $('#searchResults');
  el.innerHTML = `<p class="muted small" style="margin-top:16px;">Поиск...</p>`;
  try {
    const t = term.toLowerCase().trim();
    const clean = t.replace('#', '');
    const filter = state.searchFilter;
    let users = [], videos = [], tags = [];
    if (filter === 'all' || filter === 'users') {
      const uSnap = await getDocs(query(collection(db, 'users'),
        where('username', '>=', clean), where('username', '<=', clean + '\uf8ff'), limit(15)));
      users = uSnap.docs.map(d => ({ uid: d.id, ...d.data() }));
    }
    if (filter === 'all' || filter === 'videos' || filter === 'tags') {
      const vSnap = t.startsWith('#')
        ? await getDocs(query(collection(db, 'videos'), where('hashtags', 'array-contains', clean), limit(30)))
        : await getDocs(query(collection(db, 'videos'), limit(30)));
      videos = vSnap.docs.map(d => ({ videoId: d.id, ...d.data() }));
      if (filter === 'videos' && !t.startsWith('#')) {
        videos = videos.filter(v => (v.caption || '').toLowerCase().includes(t));
      }
    }
    if (filter === 'all' || filter === 'tags') {
      tags = state.trendingTags.filter(x => x.tag.includes(clean)).slice(0, 10);
    }
    let html = '';
    if (tags.length) {
      html += `<div class="search-section"><h3>Теги</h3><div style="display:flex;flex-wrap:wrap;gap:6px;">`;
      html += tags.map(tg => `<button class="trend-chip" data-tag="#${tg.tag}">
        <span>#${escapeHtml(tg.tag)}</span><span class="trend-boost">${tg.posts}</span></button>`).join('');
      html += `</div></div>`;
    }
    if (users.length) {
      html += `<div class="search-section"><h3>Люди</h3>`;
      html += users.map(u => `<div class="user-result" data-uid="${u.uid}">
        ${u.avatar ? `<img src="${u.avatar}" />` : `<div class="avatar-placeholder">👤</div>`}
        <div class="info"><p class="name">${escapeHtml(u.displayName || u.username)}</p>
        <p class="handle">@${escapeHtml(u.username)}</p></div></div>`).join('');
      html += `</div>`;
    }
    if (videos.length) {
      html += `<div class="search-section"><h3>Видео</h3><div class="video-grid">`;
      html += videos.map(v => {
        const boost = getVideoBoost(v);
        return `<div class="video-thumb" data-vid="${v.videoId}">
          ${v.thumbnailUrl ? `<img src="${v.thumbnailUrl}" />` : `<div style="width:100%;height:100%;background:var(--bg-4);"></div>`}
          ${boost > 0 ? `<span class="thumb-boost">🔥+${boost}</span>` : ''}
          <span class="thumb-likes">❤ ${fmtNum(v.likesCount)}</span></div>`;
      }).join('');
      html += `</div></div>`;
    }
    if (!html) html = `<p class="muted small" style="margin-top:16px;">Ничего не найдено</p>`;
    el.innerHTML = html;
    el.querySelectorAll('.user-result').forEach(x =>
      x.addEventListener('click', () => { state.viewingProfileUid = x.dataset.uid; switchTab('profile'); }));
    el.querySelectorAll('.video-thumb').forEach(x =>
      x.addEventListener('click', () => { state.pendingOpenVideo = x.dataset.vid; switchTab('feed'); }));
    el.querySelectorAll('[data-tag]').forEach(x =>
      x.addEventListener('click', () => {
        $('#searchInput').value = x.dataset.tag;
        doSearch(x.dataset.tag);
      }));
  } catch (err) {
    console.error(err);
    el.innerHTML = `<p class="error-msg">${err.message}</p>`;
  }
}

// ═══ UPLOAD ═══
function onVideoPicked(e) {
  const f = e.target.files?.[0]; if (!f) return;
  if (f.size > 100 * 1024 * 1024) return toast('Видео >100MB. Сожми');
  if (f.size > 30 * 1024 * 1024) toast('⚠️ Большой файл');
  state.uploadFile = f;
  const vid = $('#videoPreview');
  vid.src = URL.createObjectURL(f);
  vid.classList.add('active');
  vid.play().catch(() => {});
  $('#videoPickerHint').classList.add('hidden');
  $('#uploadError').classList.add('hidden');
}
function resetUpload() {
  state.uploadFile = null; state.pendingSound = null;
  $('#videoPreview').src = '';
  $('#videoPreview').classList.remove('active');
  $('#videoPickerHint').classList.remove('hidden');
  $('#videoInput').value = '';
  $('#captionInput').value = ''; $('#hashtagsInput').value = ''; $('#musicInput').value = '';
  $('#soundFromVideo').classList.add('hidden');
  $('#uploadProgress').classList.add('hidden');
  $('#uploadProgressBar').style.width = '0';
  $('#uploadProgressText').textContent = '';
  $('#uploadError').classList.add('hidden');
  switchTab('feed');
}
function saveDraft() {
  const caption = $('#captionInput').value.trim();
  const hashtags = $('#hashtagsInput').value.trim();
  const music = $('#musicInput').value.trim();
  if (!caption && !hashtags && !music && !state.uploadFile) return toast('Пусто');
  drafts.add({ caption, hashtags, music, hasVideo: !!state.uploadFile });
  toast('Черновик сохранён');
  renderDrafts();
}
function renderDrafts() {
  const bar = $('#draftsBar');
  if (!bar) return;
  const all = drafts.getAll();
  if (!all.length) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  bar.innerHTML = `<p style="font-size:12px;color:var(--text-3);margin-bottom:4px;">Черновики (${all.length})</p>` +
    all.map(d => `<span class="draft-chip" data-did="${d.id}">
      📝 ${escapeHtml((d.caption || d.hashtags || 'без описания').slice(0, 30))}
      <button data-del="${d.id}">✕</button>
    </span>`).join('');
  bar.querySelectorAll('.draft-chip').forEach(c =>
    c.addEventListener('click', e => {
      if (e.target.dataset.del) return;
      const d = drafts.getAll().find(x => x.id === c.dataset.did);
      if (!d) return;
      $('#captionInput').value = d.caption || '';
      $('#hashtagsInput').value = d.hashtags || '';
      $('#musicInput').value = d.music || '';
      toast('Черновик загружен');
    }));
  bar.querySelectorAll('[data-del]').forEach(b =>
    b.addEventListener('click', e => {
      e.stopPropagation();
      drafts.remove(b.dataset.del);
      renderDrafts();
    }));
}
async function extractThumbnail(file) {
  return new Promise(resolve => {
    try {
      const video = document.createElement('video');
      video.preload = 'metadata'; video.muted = true;
      video.src = URL.createObjectURL(file);
      video.onloadedmetadata = () => { video.currentTime = Math.min(1, video.duration / 2); };
      video.onseeked = () => {
        try {
          const c = document.createElement('canvas');
          c.width = video.videoWidth; c.height = video.videoHeight;
          c.getContext('2d').drawImage(video, 0, 0);
          c.toBlob(b => { URL.revokeObjectURL(video.src); resolve(b); }, 'image/jpeg', 0.7);
        } catch { resolve(null); }
      };
      video.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}
async function submitUpload() {
  if (!state.uploadFile) return toast('Выберите видео');
  const btn = $('#uploadSubmitBtn');
  btn.disabled = true;
  $('#uploadError').classList.add('hidden');
  $('#uploadProgress').classList.remove('hidden');
  const bar = $('#uploadProgressBar');
  const txt = $('#uploadProgressText');
  try {
    txt.textContent = 'Загрузка...';
    const videoUrl = await uploadToCloudinary(state.uploadFile, 'video', pct => {
      bar.style.width = pct + '%'; txt.textContent = `Видео: ${pct}%`;
    });
    let thumbnailUrl = '';
    const thumbBlob = await extractThumbnail(state.uploadFile);
    if (thumbBlob) {
      txt.textContent = 'Обложка...';
      try {
        const tf = new File([thumbBlob], 'thumb.jpg', { type: 'image/jpeg' });
        thumbnailUrl = await uploadToCloudinary(tf, 'image');
      } catch (e) { console.warn('Thumb:', e); }
    }
    txt.textContent = 'Публикация...';
    const caption = $('#captionInput').value.trim();
    const hashtags = $('#hashtagsInput').value.trim().split(/\s+/).filter(Boolean).map(h => h.replace(/^#/, '').toLowerCase());
    const music = $('#musicInput').value.trim() || 'original sound';
    const privacy = $('#privacySelect').value;
    const docData = {
      authorId: state.user.uid, videoUrl, thumbnailUrl, caption, hashtags, music, privacy,
      likesCount: 0, commentsCount: 0, sharesCount: 0, viewsCount: 0,
      createdAt: serverTimestamp(),
    };
    if (state.pendingSound?.videoId) docData.soundFromVideo = state.pendingSound.videoId;
    const ref = await addDoc(collection(db, 'videos'), docData);
    state.pendingVideoId = ref.id;
    toast('Опубликовано ✔');
    resetUpload();
    setTimeout(() => refreshTrending(), 500);
  } catch (err) {
    console.error(err);
    showUploadError(err.message);
  }
  btn.disabled = false;
}
function showUploadError(msg) {
  const e = $('#uploadError');
  e.style.whiteSpace = 'pre-wrap';
  e.textContent = msg;
  e.classList.remove('hidden');
  $('#uploadProgress').classList.add('hidden');
}

// ═══ PROFILE ═══
async function loadProfile(uid) {
  const isOwn = uid === state.user.uid;
  unsub('viewProfile'); unsub('viewProfileVideos');
  const u = onSnapshot(doc(db, 'users', uid),
    snap => {
      if (snap.exists()) {
        const p = { ...snap.data(), uid: snap.id };
        updateProfileUI(p, isOwn);
        if (isOwn) state.profile = p;
      }
    }, err => handleError(err, 'profile'));
  state.subs.set('viewProfile', u);
  $$('.profile-tab').forEach(t => t.classList.remove('active'));
  const firstTab = document.querySelector('.profile-tab[data-ptab="videos"]');
  if (firstTab) firstTab.classList.add('active');
  loadProfileGrid('videos');
}
function updateProfileUI(p, isOwn) {
  $('#profileUsername').textContent = '@' + p.username;
  $('#profileDisplayName').textContent = p.displayName || p.username;
  $('#profileBio').textContent = p.bio || '';
  $('#statFollowing').textContent = fmtNum(p.followingCount);
  $('#statFollowers').textContent = fmtNum(p.followersCount);
  $('#statLikes').textContent = settings.hideLikes && !isOwn ? '🔒' : fmtNum(p.likesCount);
  const av = $('#profileAvatar');
  av.innerHTML = p.avatar ? `<img src="${p.avatar}" />`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>`;
  $('#profileBackBtn').classList.toggle('hidden', isOwn);
  $('#profileLogoutBtn').classList.toggle('hidden', !isOwn);
  $('#profileSettingsBtn').classList.toggle('hidden', !isOwn);
  $('#profileQrBtn').classList.toggle('hidden', !isOwn);

  const wrap = $('#profileActionBtnWrap');
  wrap.innerHTML = '';
  if (isOwn) {
    const btn = document.createElement('button');
    btn.className = 'btn-secondary';
    btn.textContent = '✏️ Редактировать профиль';
    btn.addEventListener('click', () => openEditProfile(p));
    wrap.appendChild(btn);
  } else {
    const followId = `${state.user.uid}_${p.uid}`;
    getDoc(doc(db, 'follows', followId)).then(d => {
      const isFollowing = d.exists();
      const btn = document.createElement('button');
      btn.className = isFollowing ? 'btn-secondary' : 'btn-primary';
      btn.textContent = isFollowing ? 'Отписаться' : 'Подписаться';
      btn.addEventListener('click', async () => {
        try {
          if (isFollowing) {
            await deleteDoc(doc(db, 'follows', followId));
            try { await updateDoc(doc(db, 'users', p.uid), { followersCount: increment(-1) }); } catch {}
            try { await updateDoc(doc(db, 'users', state.user.uid), { followingCount: increment(-1) }); } catch {}
          } else {
            await setDoc(doc(db, 'follows', followId), { followerId: state.user.uid, followingId: p.uid, createdAt: serverTimestamp() });
            try { await updateDoc(doc(db, 'users', p.uid), { followersCount: increment(1) }); } catch {}
            try { await updateDoc(doc(db, 'users', state.user.uid), { followingCount: increment(1) }); } catch {}
            createNotification(p.uid, 'follow', {});
          }
          loadProfile(p.uid);
        } catch (err) { handleError(err, 'profile.follow'); }
      });
      wrap.appendChild(btn);
    });
  }
}
function openEditProfile(p) {
  const modal = document.createElement('div');
  modal.className = 'overlay';
  modal.innerHTML = `<div class="comments-sheet" style="height:auto;max-height:85vh;">
    <div class="comments-header"><div style="width:24px"></div><p>Редактировать профиль</p>
    <button class="icon-btn edit-close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>
    <div style="padding:20px;overflow-y:auto;">
      <label class="avatar-upload" style="margin-top:0;">
        <div id="editAvatar" class="avatar-preview">${p.avatar ? `<img src="${p.avatar}" />` : '👤'}</div>
        <input id="editAvatarInput" type="file" accept="image/*" hidden />
        <span class="upload-hint">Сменить фото</span>
      </label>
      <label class="field-label">Отображаемое имя</label>
      <input id="editDisplayName" type="text" value="${escapeHtml(p.displayName || '')}" />
      <label class="field-label">Био</label>
      <textarea id="editBio" rows="3">${escapeHtml(p.bio || '')}</textarea>
      <p id="editError" class="error-msg hidden" style="margin-top:8px;"></p>
      <button id="editSave" class="btn-primary" style="margin-top:20px;">Сохранить</button>
    </div></div>`;
  document.body.appendChild(modal);
  let newAvatarFile = null;
  modal.querySelector('#editAvatarInput').addEventListener('change', e => {
    const f = e.target.files?.[0]; if (!f) return;
    newAvatarFile = f;
    modal.querySelector('#editAvatar').innerHTML = `<img src="${URL.createObjectURL(f)}" />`;
  });
  modal.querySelector('.edit-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  modal.querySelector('#editSave').addEventListener('click', async () => {
    const saveBtn = modal.querySelector('#editSave');
    const errEl = modal.querySelector('#editError');
    errEl.classList.add('hidden');
    saveBtn.disabled = true; saveBtn.textContent = 'Сохраняем...';
    try {
      const update = {
        displayName: modal.querySelector('#editDisplayName').value.trim() || p.username,
        bio: modal.querySelector('#editBio').value.trim(),
      };
      if (newAvatarFile) update.avatar = await uploadToCloudinary(newAvatarFile, 'image');
      await updateDoc(doc(db, 'users', state.user.uid), update);
      toast('Обновлено ✔'); modal.remove();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
    saveBtn.disabled = false; saveBtn.textContent = 'Сохранить';
  });
}
function loadProfileGrid(type) {
  unsub('viewProfileVideos');
  const uid = state.viewingProfileUid || state.user.uid;
  const grid = $('#profileGrid');
  grid.innerHTML = Array(6).fill('<div class="skeleton-thumb"></div>').join('');

  let q;
  if (type === 'liked') q = query(collection(db, 'likes'), where('userId', '==', uid), limit(30));
  else if (type === 'saved' || type === 'watchlater') q = query(collection(db, 'saves'), where('userId', '==', uid), limit(50));
  else q = query(collection(db, 'videos'), where('authorId', '==', uid), limit(50));

  const u = onSnapshot(q,
    async snap => {
      let videos = [];
      if (type === 'liked' || type === 'saved' || type === 'watchlater') {
        let saves = snap.docs.map(d => d.data());
        if (type === 'saved') saves = saves.filter(s => !s.collection || s.collection === undefined || s.collection === 'default');
        if (type === 'watchlater') saves = saves.filter(s => s.collection === 'watchlater');
        const ids = saves.map(s => s.videoId);
        if (ids.length) {
          const vSnap = await Promise.all(ids.map(id => getDoc(doc(db, 'videos', id))));
          videos = vSnap.filter(x => x.exists()).map(x => ({ videoId: x.id, ...x.data() }));
        }
      } else {
        videos = snap.docs.map(d => ({ videoId: d.id, ...d.data() }));
        if (type === 'reposts') videos = videos.filter(v => v.repostOf);
        else videos = videos.filter(v => !v.repostOf);
      }
      if (!videos.length) {
        const labels = { liked: 'Нет лайкнутых', saved: 'Нет сохранённых', reposts: 'Нет репостов', watchlater: 'Пусто', videos: 'Пока нет видео' };
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;padding:40px 20px;"><p>${labels[type] || 'Пусто'}</p></div>`;
        return;
      }
      grid.innerHTML = videos.map(v => {
        const boost = getVideoBoost(v);
        return `<div class="video-thumb" data-vid="${v.videoId}">
          ${v.thumbnailUrl ? `<img src="${v.thumbnailUrl}" />` : `<div style="width:100%;height:100%;background:var(--bg-4);"></div>`}
          ${boost > 0 ? `<span class="thumb-boost">🔥+${boost}</span>` : ''}
          <span class="thumb-likes">❤ ${fmtNum(v.likesCount)}</span></div>`;
      }).join('');
      grid.querySelectorAll('.video-thumb').forEach(x =>
        x.addEventListener('click', () => { state.pendingOpenVideo = x.dataset.vid; switchTab('feed'); }));
    }, err => {
      grid.innerHTML = `<p class="error-msg" style="grid-column:1/-1;">${err.message}</p>`;
      handleError(err, 'profileGrid');
    });
  state.subs.set('viewProfileVideos', u);
}

// ═══ HISTORY ═══
function renderHistory() {
  const el = $('#historyList');
  if (!el) return;
  const items = history.getAll();
  if (!items.length) {
    el.innerHTML = `<div class="empty-state"><p>История пуста</p></div>`;
    return;
  }
  el.innerHTML = items.map(h => `<div class="history-item" data-vid="${h.videoId}">
    ${h.thumbnailUrl ? `<img class="history-thumb" src="${h.thumbnailUrl}" />` : `<div class="history-thumb"></div>`}
    <div class="history-info">
      <div class="history-author">@${escapeHtml(h.authorUsername || 'user')}</div>
      <div class="history-caption">${escapeHtml(h.caption || '')}</div>
      <div class="history-time">${timeAgo(h.viewedAt)}</div>
    </div></div>`).join('');
  el.querySelectorAll('.history-item').forEach(x =>
    x.addEventListener('click', () => { state.pendingOpenVideo = x.dataset.vid; switchTab('feed'); }));
}
function clearHistory() {
  if (!confirm('Очистить историю?')) return;
  history.clear(); renderHistory(); toast('История очищена');
}
async function readAllNotifs() {
  try {
    const all = (state.allNotifs || []).filter(n => !n.read);
    await Promise.all(all.map(n =>
      updateDoc(doc(db, 'notifications', n.notifId), { read: true }).catch(() => {})
    ));
    toast('Все прочитаны');
  } catch (err) { toast(err.message); }
}

// ═══ DIAGNOSTICS ═══
async function testCloudinary() {
  const el = $('#testCloudResult');
  el.className = 'settings-result';
  el.textContent = '⏳ Проверяем...';
  el.classList.remove('hidden');
  try {
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const blob = await (await fetch('data:image/png;base64,' + b64)).blob();
    const file = new File([blob], 'test.png', { type: 'image/png' });
    const start = Date.now();
    const url = await uploadToCloudinary(file, 'image');
    el.classList.add('ok');
    el.textContent = `✅ OK (${Date.now() - start}ms)\n${url}`;
  } catch (err) {
    el.classList.add('err');
    el.textContent = `❌ ${err.message}`;
  }
}
async function testFirestore() {
  const el = $('#testFirestoreResult');
  el.className = 'settings-result';
  el.textContent = '⏳ Проверяем...';
  el.classList.remove('hidden');
  try {
    const start = Date.now();
    await getDoc(doc(db, 'users', state.user.uid));
    await updateDoc(doc(db, 'users', state.user.uid), { _test: Date.now() });
    const testId = 'test_' + Date.now();
    await setDoc(doc(db, 'videos', testId), {
      authorId: state.user.uid, videoUrl: 'test', thumbnailUrl: '',
      caption: 'test', hashtags: [], music: '', likesCount: 0,
      commentsCount: 0, sharesCount: 0, viewsCount: 0, createdAt: serverTimestamp()
    });
    await deleteDoc(doc(db, 'videos', testId));
    el.classList.add('ok');
    el.textContent = `✅ OK (${Date.now() - start}ms)\nВсё работает`;
  } catch (err) {
    el.classList.add('err');
    el.textContent = `❌ ${err.code || err.message}\n\n${err.code === 'permission-denied' ? '⚠️ Обнови правила Firestore!' : ''}`;
  }
}
function exportSettings() {
  const data = {
    theme: settings.theme, autoplay: settings.autoplay, sound: settings.sound,
    dataSaver: settings.dataSaver, hideLikes: settings.hideLikes,
    history: history.getAll(), notInterested: notInterested.getAll(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'nippik_settings.json';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast('Настройки скачаны');
}

// ═══ PWA ═══
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const box = $('#pwaInstallBox');
  if (box) box.classList.remove('hidden');
});
function initPwa() {
  const btn = $('#pwaInstallBtn');
  if (btn) btn.addEventListener('click', async () => {
    if (!deferredPrompt) return toast('Установка недоступна');
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    const box = $('#pwaInstallBox');
    if (box) box.classList.add('hidden');
  });
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

// ═══ INIT ═══
settings.apply();