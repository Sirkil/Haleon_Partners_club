// ════════════════════════════════════════
// HALEON PARTNERS CLUB — app.js
// Firebase Realtime DB + Google Sheets sync
// ════════════════════════════════════════

// ═══════════════════════════════════════════════════════
// 🔧 GOOGLE SHEETS APP SCRIPT URL
//    After deploying your Apps Script as a Web App,
//    paste the URL here.
// ═══════════════════════════════════════════════════════
const SHEETS_WEBHOOK =
  "https://script.google.com/macros/s/AKfycbzXv_YPKLL1UUW00yZ07DvlCDgTB_bdf3Cqlb48QPVoG1e4BEeE5mPACs-9tnw7cYkw/exec";

// ── State (in-memory mirror of Firebase) ──
const state = {
  uid: null,
  user: null, // { name, email, phone, pharmacy, memberId }
  score: 0,
  quizzesCompleted: 0,
  claimedBadges: [],
  answeredQuestions: [],
};

const answeredSet = new Set();

// ── QR API helper ──────────────────────
function makeQRUrl(data, size = 200) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`;
}

// ── Badge Definitions ──────────────────
const badgeDefs = [
  { id: 0, icon: "❤️", name: "Health Advocate", pts: 200 },
  { id: 1, icon: "🏃", name: "Daily Mover", pts: 400 },
  { id: 2, icon: "🌿", name: "Wellness Leader", pts: 600 },
];

// ── Rewards ────────────────────────────
const rewardsData = [
  { key: "flask", title: "Haleon Flask", pts: 300, icon: "🧪" },
  { key: "pen", title: "Haleon Branded Pen", pts: 100, icon: "🖊️" },
  { key: "notebook", title: "Haleon Notebook", pts: 200, icon: "📓" },
  { key: "mug", title: "Ceramic Mug", pts: 400, icon: "☕" },
];

// ── Questions ──────────────────────────
const questions = [
  {
    q: "Which vitamin is primarily synthesized by the body through sunlight exposure?",
    choices: ["Vitamin A", "Vitamin C", "Vitamin D", "Vitamin B12"],
    correct: 2,
  },
  {
    q: "What is the recommended daily water intake for an average adult?",
    choices: ["1 Liter", "2 Liters", "3 Liters", "500 ml"],
    correct: 1,
  },
  {
    q: "Which mineral is essential for strong bones and teeth?",
    choices: ["Iron", "Potassium", "Calcium", "Magnesium"],
    correct: 2,
  },
  {
    q: "How many hours of sleep are recommended for adults per night?",
    choices: ["4–5 hours", "6–7 hours", "7–9 hours", "10–12 hours"],
    correct: 2,
  },
];

// ════════════════════════════════════════
// BOOT — called by Firebase onAuthStateChanged
// ════════════════════════════════════════

window.bootApp = function (uid, data, showWelcome) {
  state.uid = uid;
  state.user = data.profile;
  state.score = data.score || 0;
  state.quizzesCompleted = data.quizzesCompleted || 0;
  state.claimedBadges = data.claimedBadges || [];
  state.answeredQuestions = data.answeredQuestions || [];

  // Restore answered set
  answeredSet.clear();
  state.answeredQuestions.forEach((i) => answeredSet.add(i));

  document.getElementById("nav-username").textContent = state.user.name;
  document.getElementById("bottom-nav").classList.add("visible");
  renderQuizCards();
  updateHomeUI();
  renderRewardsPage();
  // Pre-render profile so the membership card QR is generated immediately
  updateProfilePage();
  showView("view-home");
  currentTab = 0;
  document
    .querySelectorAll(".nav-tab")
    .forEach((t) => t.classList.remove("active"));
  document.getElementById("tab-home").classList.add("active");
  startCarousel();
  // Show welcome dialog for new registrations
  if (showWelcome === true && state.user) {
    document.getElementById("welcome-name").textContent =
      "👋 Hi, " + state.user.name + "!";
    document.getElementById("welcome-email").textContent = state.user.email;
    setTimeout(() => {
      document.getElementById("welcome-dialog").classList.add("open");
      launchConfetti(4000);
    }, 400);
  }
};

// ════════════════════════════════════════
// NAVIGATION
// ════════════════════════════════════════

const tabOrder = ["home", "rewards", "profile"];
let currentTab = 0;

window.showView = function showView(id) {
  document
    .querySelectorAll(".view")
    .forEach((v) => v.classList.remove("active"));
  const el = document.getElementById(id);
  if (el) el.classList.add("active");
};

function switchTab(tab) {
  document
    .querySelectorAll(".nav-tab")
    .forEach((t) => t.classList.remove("active"));
  document.getElementById("tab-" + tab).classList.add("active");
  currentTab = tabOrder.indexOf(tab);
  if (tab === "home") {
    showView("view-home");
    updateHomeUI();
    renderQuizCards();
  }
  if (tab === "rewards") {
    showView("view-rewards");
    renderRewardsPage();
  }
  if (tab === "profile") {
    showView("view-profile");
    updateProfilePage();
  }
}

// ── Swipe ──
let swipeX = 0,
  swipeY = 0;
document.addEventListener(
  "touchstart",
  (e) => {
    const a = document.querySelector(".view.active");
    if (!a || !["view-home", "view-rewards", "view-profile"].includes(a.id))
      return;
    swipeX = e.touches[0].clientX;
    swipeY = e.touches[0].clientY;
  },
  { passive: true },
);

document.addEventListener(
  "touchend",
  (e) => {
    const a = document.querySelector(".view.active");
    if (!a || !["view-home", "view-rewards", "view-profile"].includes(a.id))
      return;
    const dx = e.changedTouches[0].clientX - swipeX;
    const dy = e.changedTouches[0].clientY - swipeY;
    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return;
    if (dx < 0 && currentTab < tabOrder.length - 1)
      switchTab(tabOrder[currentTab + 1]);
    else if (dx > 0 && currentTab > 0) switchTab(tabOrder[currentTab - 1]);
  },
  { passive: true },
);

// ════════════════════════════════════════
// AUTH
// ════════════════════════════════════════

async function doLogin() {
  const email = document.getElementById("login-email").value.trim();
  const pass = document.getElementById("login-pass").value;
  const errEl = document.getElementById("login-error");
  const btn = document.getElementById("btn-login");

  errEl.textContent = "";
  if (!email || !pass) {
    errEl.textContent = "Please fill in all fields.";
    return;
  }

  btn.textContent = "Logging in…";
  btn.disabled = true;
  try {
    const cred = await window._fb.signInWithEmailAndPassword(
      window._fb.auth,
      email,
      pass,
    );
    // Manually load Firestore doc so bootApp fires reliably
    const snap = await window._fb.getDoc(
      window._fb.doc(window._fb.db, "users", cred.user.uid),
    );
    if (snap.exists()) {
      window.bootApp(cred.user.uid, snap.data(), false);
    } else {
      errEl.textContent = "Account data not found. Please contact support.";
    }
  } catch (e) {
    errEl.textContent = friendlyError(e.code);
  } finally {
    btn.textContent = "LOGIN";
    btn.disabled = false;
  }
}

async function doRegister() {
  const name = document.getElementById("reg-name").value.trim();
  const email = document.getElementById("reg-email").value.trim();
  const phone = document.getElementById("reg-phone").value.trim();
  const pharmacy = document.getElementById("reg-pharmacy").value.trim();
  const pass = document.getElementById("reg-pass").value;
  const errEl = document.getElementById("reg-error");
  const btn = document.getElementById("btn-register");

  errEl.textContent = "";
  if (!name || !email || !phone || !pharmacy || !pass) {
    errEl.textContent = "Please fill in all fields.";
    return;
  }
  if (pass.length < 6) {
    errEl.textContent = "Password must be at least 6 characters.";
    return;
  }

  btn.textContent = "Creating account…";
  btn.disabled = true;
  try {
    const cred = await window._fb.createUserWithEmailAndPassword(
      window._fb.auth,
      email,
      pass,
    );
    const uid = cred.user.uid;

    // Generate short member ID from uid
    const memberId = uid.slice(0, 8).toUpperCase();

    const profile = { name, email, phone, pharmacy, memberId };
    const userData = {
      profile,
      score: 0,
      quizzesCompleted: 0,
      claimedBadges: [],
      answeredQuestions: [],
      tier: "Student",
      createdAt: new Date().toISOString(),
    };

    // Save to Firestore
    await window._fb.setDoc(
      window._fb.doc(window._fb.db, "users", uid),
      userData,
    );

    // Sync to Google Sheets
    syncToSheets(uid, userData);

    // Boot app — pass true to show welcome dialog
    window.bootApp(uid, userData, true);
  } catch (e) {
    errEl.textContent = friendlyError(e.code);
  } finally {
    btn.textContent = "CREATE ACCOUNT";
    btn.disabled = false;
  }
}

async function doLogout() {
  await window._fb.signOut(window._fb.auth);
  state.uid = null;
  state.user = null;
  state.score = 0;
  state.quizzesCompleted = 0;
  state.claimedBadges = [];
  state.answeredQuestions = [];
  answeredSet.clear();
  document.getElementById("bottom-nav").classList.remove("visible");
  showView("view-login");
}

function friendlyError(code) {
  const map = {
    "auth/user-not-found": "No account found with that email.",
    "auth/wrong-password": "Incorrect password.",
    "auth/email-already-in-use": "An account with this email already exists.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/invalid-login-credentials": "Incorrect email or password.",
  };
  return map[code] || "Something went wrong. Please try again.";
}

// ════════════════════════════════════════
// FIREBASE SAVE
// ════════════════════════════════════════

async function saveToFirebase() {
  if (!state.uid) return;
  const tier = getTier().name;
  const data = {
    score: state.score,
    quizzesCompleted: state.quizzesCompleted,
    claimedBadges: state.claimedBadges,
    answeredQuestions: [...answeredSet],
    tier,
    lastUpdated: window._fb.serverTimestamp(),
  };
  try {
    await window._fb.updateDoc(
      window._fb.doc(window._fb.db, "users", state.uid),
      data,
    );
    // Also push update to Sheets (convert serverTimestamp to ISO for Sheets)
    syncToSheets(state.uid, {
      profile: state.user,
      ...data,
      lastUpdated: new Date().toISOString(),
    });
    showSyncStatus("✓ Synced");
  } catch (e) {
    showSyncStatus("⚠ Sync failed");
    console.error("Firebase save error:", e);
  }
}

function showSyncStatus(msg) {
  const el = document.getElementById("sync-status");
  if (!el) return;
  el.textContent = msg;
  el.style.opacity = "1";
  setTimeout(() => {
    el.style.opacity = "0";
  }, 2500);
}

// ════════════════════════════════════════
// GOOGLE SHEETS SYNC
// ════════════════════════════════════════

function syncToSheets(uid, data) {
  if (!SHEETS_WEBHOOK || SHEETS_WEBHOOK === "YOUR_APPS_SCRIPT_WEB_APP_URL")
    return;
  // Map badge IDs to human-readable names for the spreadsheet
  const badgeNames = (data.claimedBadges || [])
    .map((id) => {
      const def = badgeDefs.find((b) => b.id === id);
      return def ? def.name : id;
    })
    .join(", ");
  const payload = {
    uid,
    name: data.profile?.name || "",
    email: data.profile?.email || "",
    phone: data.profile?.phone || "",
    pharmacy: data.profile?.pharmacy || "",
    memberId: data.profile?.memberId || "",
    score: data.score || 0,
    quizzesCompleted: data.quizzesCompleted || 0,
    tier: data.tier || "Student",
    badges: badgeNames,
    badgesCount:       (data.claimedBadges || []).length,
    lastUpdated: data.lastUpdated || new Date().toISOString(),
  };
  // Fire-and-forget
  fetch(SHEETS_WEBHOOK, {
    method: "POST",
    mode: "no-cors", // Apps Script CORS workaround
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

// ════════════════════════════════════════
// TIER
// ════════════════════════════════════════

function getTier() {
  const s = state.score;
  if (s < 100)  return { name: "Student",  cls: "card-student" };
  if (s < 300)  return { name: "Silver",   cls: "card-silver" };
  if (s < 600)  return { name: "Gold",     cls: "card-gold" };
  return              { name: "Platinum", cls: "card-platinum" };
}

// ════════════════════════════════════════
// HOME UI
// ════════════════════════════════════════

function updateHomeUI() {
  const tier = getTier();
  const pct = Math.round((answeredSet.size / questions.length) * 100);
  const circumference = 2 * Math.PI * 60;

  document.getElementById("progress-ring").style.strokeDashoffset =
    circumference - (pct / 100) * circumference;
  document.getElementById("progress-pct").textContent = pct + "%";
  document.getElementById("pts-display").textContent =
    state.score.toLocaleString() + " Points";
  document.getElementById("tier-badge-home").textContent = tier.name + " Tier";

  if (state.user)
    document.getElementById("nav-username").textContent = state.user.name;

  updateBadgeStates();
  updateHomeRedeemBtns();
}

function updateHomeRedeemBtns() {
  const flask = document.getElementById("home-redeem-flask");
  const pen = document.getElementById("home-redeem-pen");
  if (flask) flask.disabled = state.score < 300;
  if (pen) pen.disabled = state.score < 100;
}

// ════════════════════════════════════════
// BADGES
// ════════════════════════════════════════

function updateBadgeStates() {
  badgeDefs.forEach((b) => {
    const chip = document.getElementById("badge-" + b.id);
    if (!chip) return;
    if (state.claimedBadges.includes(b.id)) {
      chip.className = "badge-chip claimed";
    } else if (state.score >= b.pts) {
      chip.className = "badge-chip claimable";
    } else {
      chip.className = "badge-chip locked";
    }
  });
}

// ── Auto-check badges whenever score changes ──
function checkBadgeUnlocks() {
  const newlyUnlocked = badgeDefs.filter(
    (b) => !state.claimedBadges.includes(b.id) && state.score >= b.pts,
  );
  if (newlyUnlocked.length === 0) return;

  newlyUnlocked.forEach((b, i) => {
    state.claimedBadges.push(b.id);
  });
  updateBadgeStates();

  // Show dialog for the first newly unlocked badge (with delay so correct-dialog shows first)
  const b = newlyUnlocked[0];
  setTimeout(() => {
    document.getElementById("badge-dialog-icon").textContent = b.icon;
    document.getElementById("badge-dialog-name").textContent = b.name;
    document.getElementById("badge-dialog").classList.add("open");
    launchConfetti(4000);
  }, 2200);

  saveToFirebase();
}

async function tryClaimBadge(id) {
  const b = badgeDefs[id];
  if (state.claimedBadges.includes(id) || state.score < b.pts) return;
  state.claimedBadges.push(id);
  updateBadgeStates();
  document.getElementById("badge-dialog-icon").textContent = b.icon;
  document.getElementById("badge-dialog-name").textContent = b.name;
  document.getElementById("badge-dialog").classList.add("open");
  launchConfetti(3000);
  await saveToFirebase();
}

function closeWelcomeDialog() {
  document.getElementById("welcome-dialog").classList.remove("open");
}

function closeBadgeDialog() {
  document.getElementById("badge-dialog").classList.remove("open");
  updateHomeUI();
  if (document.getElementById("view-profile").classList.contains("active")) {
    updateProfilePage();
  }
}

// ════════════════════════════════════════
// QUIZ GRID
// ════════════════════════════════════════

function renderQuizCards() {
  const container = document.getElementById("quiz-cards");
  if (!container) return;
  container.innerHTML = "";
  questions.forEach((q, qi) => {
    const done = answeredSet.has(qi);
    const card = document.createElement("div");
    card.className = "quiz-grid-card" + (done ? " answered" : "");
    card.id = "qcard-" + qi;
    if (!done) card.onclick = () => openQuizScreen(qi);
    card.innerHTML = `
      <div class="quiz-grid-num">${qi + 1}</div>
      <div class="quiz-grid-label">Question ${qi + 1}</div>
      <div class="quiz-grid-status" id="qstatus-${qi}">${done ? "✓ Done" : "Tap to answer"}</div>
    `;
    container.appendChild(card);
  });
}

let activeQuizIdx = null;

function openQuizScreen(qi) {
  if (answeredSet.has(qi)) return;
  activeQuizIdx = qi;
  const q = questions[qi];
  document.getElementById("quiz-screen-q-num").textContent =
    "Question " + (qi + 1);
  document.getElementById("quiz-screen-q-text").textContent = q.q;
  const choicesEl = document.getElementById("quiz-screen-choices");
  choicesEl.innerHTML = "";
  q.choices.forEach((c, ci) => {
    const btn = document.createElement("button");
    btn.className = "quiz-screen-choice";
    btn.textContent = c;
    btn.onclick = () => answerQuizScreen(qi, ci);
    choicesEl.appendChild(btn);
  });
  showView("view-quiz");
}

function closeQuizScreen() {
  showView("view-home");
  updateHomeUI();
  renderQuizCards();
}

async function answerQuizScreen(qi, ci) {
  if (answeredSet.has(qi)) return;
  const q = questions[qi];
  const btns = document.querySelectorAll(
    "#quiz-screen-choices .quiz-screen-choice",
  );
  btns.forEach((btn, i) => {
    btn.disabled = true;
    if (i === q.correct) btn.classList.add("correct");
    else if (i === ci && ci !== q.correct) btn.classList.add("wrong");
  });

  answeredSet.add(qi);
  state.answeredQuestions = [...answeredSet];

  if (ci === q.correct) {
    state.score += 100;
    state.quizzesCompleted++;
    await saveToFirebase();
    // Check badge unlocks after score update
    checkBadgeUnlocks();
    setTimeout(() => {
      document.getElementById("correct-dialog").classList.add("open");
      launchConfetti(3000);
    }, 500);
  } else {
    const correctAnswer = q.choices[q.correct];
    document.getElementById("wrong-dialog-answer").textContent =
      "Correct answer: " + correctAnswer;
    setTimeout(() => {
      document.getElementById("wrong-dialog").classList.add("open");
    }, 500);
    await saveToFirebase();
  }
}

function closeCorrectDialog() {
  document.getElementById("correct-dialog").classList.remove("open");
  closeQuizScreen();
}

function closeWrongDialog() {
  document.getElementById("wrong-dialog").classList.remove("open");
  closeQuizScreen();
}

// ════════════════════════════════════════
// CAROUSEL
// ════════════════════════════════════════

let carouselIdx = 0;
let carouselTimer = null;

function goToSlide(idx) {
  carouselIdx = idx;
  const track = document.getElementById("carousel-track");
  if (!track) return;
  track.style.transform = `translateX(-${idx * 100}%)`;
  document
    .querySelectorAll(".dot")
    .forEach((d, i) => d.classList.toggle("active", i === idx));
}

function startCarousel() {
  if (carouselTimer) clearInterval(carouselTimer);
  carouselTimer = setInterval(() => {
    const total = document.querySelectorAll(".carousel-slide").length;
    goToSlide((carouselIdx + 1) % total);
  }, 3500);
}

// ════════════════════════════════════════
// REWARDS PAGE
// ════════════════════════════════════════

function renderRewardsPage() {
  const grid = document.getElementById("rewards-full-grid");
  const ptsEl = document.getElementById("rewards-pts-display");
  if (!grid) return;
  if (ptsEl) ptsEl.textContent = state.score.toLocaleString() + " pts";

  grid.innerHTML = "";
  rewardsData.forEach((r) => {
    const canRedeem = state.score >= r.pts;
    grid.innerHTML += `
      <div class="reward-card">
        <div class="reward-img">${r.icon}</div>
        <div class="reward-info">
          <div class="reward-title">${r.title}</div>
          <button class="redeem-btn" ${canRedeem ? "" : "disabled"}
            onclick="openRedeemQR('${r.key}','${r.title}',${r.pts})">
            ${r.pts} Pts — Redeem
          </button>
        </div>
      </div>`;
  });
}

let qrTimerInterval = null;
let redeemUnsubscribe = null;
let redeemOpenedAt   = 0;

function openRedeemQR(key, title, pts) {
  redeemOpenedAt = Date.now();
  document.getElementById('qr-dialog-title').textContent = 'Redeem: ' + title;

  // Build payload embedded in QR
  const payload = JSON.stringify({
    uid:      state.uid,
    memberId: state.user?.memberId || '',
    name:     state.user?.name    || '',
    email:    state.user?.email   || '',
    phone:    state.user?.phone   || '',
    pharmacy: state.user?.pharmacy || '',
    reward:   title,
    pts,
    key,
    ts: Date.now(),
  });

  const qrUrl = makeQRUrl(payload, 200);
  const imgEl = document.getElementById('qr-dialog-img');
  imgEl.style.opacity = '0.2';
  imgEl.src = '';
  setTimeout(() => {
    imgEl.onload  = () => { imgEl.style.opacity = '1'; };
    imgEl.onerror = () => { imgEl.style.opacity = '1'; };
    imgEl.src = qrUrl + '&t=' + Date.now();
  }, 80);

  // Countdown
  let secs = 60;
  document.getElementById('qr-timer').textContent = secs;
  if (qrTimerInterval) clearInterval(qrTimerInterval);
  qrTimerInterval = setInterval(() => {
    secs--;
    const el = document.getElementById('qr-timer');
    if (el) el.textContent = secs;
    if (secs <= 0) { clearInterval(qrTimerInterval); closeQRDialog(); }
  }, 1000);

  document.getElementById('qr-dialog').classList.add('open');

  // Watch Firestore for usher confirmation
  stopRedeemListener();
  if (window._fb?.onSnapshot && state.uid) {
    const docRef = window._fb.doc(window._fb.db, 'users', state.uid);
    redeemUnsubscribe = window._fb.onSnapshot(docRef, snap => {
      if (!snap.exists()) return;
      const d = snap.data();
      if (d.lastRedemptionAt && d.lastRedemptionAt > redeemOpenedAt) {
        stopRedeemListener();
        showRedeemSuccess(
          d.lastRedemptionReward || title,
          d.lastRedemptionPts   || pts,
          d.score ?? state.score
        );
      }
    });
  }
}

function stopRedeemListener() {
  if (redeemUnsubscribe) { redeemUnsubscribe(); redeemUnsubscribe = null; }
}

function closeQRDialog() {
  stopRedeemListener();
  if (qrTimerInterval) clearInterval(qrTimerInterval);
  document.getElementById('qr-dialog').classList.remove('open');
}

function showRedeemSuccess(reward, pts, newScore) {
  closeQRDialog();
  state.score = newScore;
  updateHomeUI();
  renderRewardsPage();
  if (document.getElementById('view-profile')?.classList.contains('active')) {
    updateProfilePage();
  }
  document.getElementById('redeem-success-reward').textContent = reward;
  document.getElementById('redeem-success-pts').textContent =
    '−' + pts + ' pts deducted · New balance: ' + newScore.toLocaleString() + ' pts';
  document.getElementById('redeem-success-dialog').classList.add('open');
  launchConfetti(3000);
}

function closeRedeemSuccessDialog() {
  document.getElementById('redeem-success-dialog').classList.remove('open');
}

// ════════════════════════════════════════
// PROFILE
// ════════════════════════════════════════

function updateProfilePage() {
  if (!state.user) return;
  const tier = getTier();

  // Card skins
  document.getElementById('card-face-front').className = `card-face card-front ${tier.cls}`;
  document.getElementById('card-face-back').className  = `card-face card-back-face ${tier.cls}`;

  // Front text
  document.getElementById('card-tier-label').textContent = tier.name + '.';
  document.getElementById('card-watermark').textContent  = tier.name + '.';

  // Back text
  document.getElementById('card-back-watermark').textContent = tier.name + '.';
  document.getElementById('card-name-back').textContent = state.user.name;
  document.getElementById('card-num-back').textContent  = state.user.memberId || '——';

  // Card back QR — encode full identity (160px for legibility)
  const memberPayload = JSON.stringify({
    uid:      state.uid,
    memberId: state.user.memberId,
    name:     state.user.name,
    email:    state.user.email,
    phone:    state.user.phone,
    pharmacy: state.user.pharmacy,
  });
  const cardImg = document.getElementById('card-qr-img');
  cardImg.src = makeQRUrl(memberPayload, 160) + '&t=' + Date.now();
  cardImg.style.opacity = '1';

  // Stats
  document.getElementById('stat-pts').textContent     = state.score.toLocaleString();
  document.getElementById('stat-quizzes').textContent = state.quizzesCompleted;
  document.getElementById('stat-tier').textContent    = tier.name;

  // Info
  document.getElementById('info-name').textContent     = state.user.name;
  document.getElementById('info-email').textContent    = state.user.email;
  document.getElementById('info-phone').textContent    = state.user.phone    || '—';
  document.getElementById('info-pharmacy').textContent = state.user.pharmacy || '—';

  // Badges
  const badgesEl = document.getElementById('profile-badges');
  if (state.claimedBadges.length === 0) {
    badgesEl.innerHTML = '<div class="profile-badge-empty">No badges claimed yet. Earn points to unlock!</div>';
  } else {
    badgesEl.innerHTML = state.claimedBadges.map(id => {
      const b = badgeDefs.find(d => d.id === id);
      return b ? `<div class="profile-badge-item">${b.icon} ${b.name}</div>` : '';
    }).join('');
  }
}

function flipCard() {
  document.getElementById("card-inner").classList.toggle("flipped");
}

// ════════════════════════════════════════
// CONFETTI
// ════════════════════════════════════════

function launchConfetti(duration) {
  const canvas = document.getElementById("confetti-canvas");
  const ctx = canvas.getContext("2d");
  canvas.style.display = "block";
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  const pieces = [];
  const colors = [
    "#4ade80",
    "#22c55e",
    "#f0f4f8",
    "#facc15",
    "#60a5fa",
    "#f472b6",
  ];
  for (let i = 0; i < 130; i++) {
    pieces.push({
      x: Math.random() * canvas.width,
      y: -10 - Math.random() * 200,
      r: 4 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 4,
      vy: 2 + Math.random() * 4,
      rot: Math.random() * 360,
      rs: (Math.random() - 0.5) * 6,
    });
  }
  const end = Date.now() + duration;
  (function frame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach((p) => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6);
      ctx.restore();
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05;
      p.rot += p.rs;
    });
    if (Date.now() < end) requestAnimationFrame(frame);
    else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.style.display = "none";
    }
  })();
}

// ════════════════════════════════════════
// TOAST
// ════════════════════════════════════════

function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2400);
}

// ════════════════════════════════════════
// INIT
// ════════════════════════════════════════

window.addEventListener("DOMContentLoaded", () => {
  startCarousel();
});