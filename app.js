// ════════════════════════════════════════
// HALEON PARTNERS CLUB — app.js
// Firebase Realtime DB + Google Sheets sync
// ════════════════════════════════════════

const SHEETS_WEBHOOK = "https://script.google.com/macros/s/AKfycbwHj5I-AiO5mQhxJCUHjFf-p1spOTU-E5LZH3-Lc4cq5zkTHs2U-RrTsSY8JFzl2KrX/exec";

const state = {
  uid: null, user: null, score: 0, quizzesCompleted: 0,
  claimedBadges: [], answeredQuestions: [], gamesCompleted: {},
  active: false, attendance: false, cardId: "", redeemedReward: null
};

let currentTab = 0;
const answeredSet = new Set();
const tabOrder = ["home", "rewards", "scanner", "profile"];
const TOTAL_GAMES = 7; // Updated games

function makeQRUrl(data, size = 200) {
  // Using QuickChart API — modern, active, and reliable
  return `https://quickchart.io/qr?text=${encodeURIComponent(data)}&size=${size}&margin=1`;
}

// Renamed from 'badges' to 'badgeDefs' and uses 'image' property
const badgeDefs = [
  { id: 0, name: 'Health Advocate', image: 'assets/Health Advocate.png', pts: 200 },
  { id: 1, name: 'Daily Mover', image: 'assets/Daily Mover.png', pts: 400 },
  { id: 2, name: 'Wellness Leader', image: 'assets/Wellness Leader.png', pts: 600 }
];

const rewardsData = [
  { key: "pen", title: "Haleon Branded Pen", pts: 100, image: "assets/Pen.png" },
  { key: "notebook", title: "Haleon Notebook", pts: 200, image: "assets/Notebook.png" },
  { key: "flask", title: "Haleon Flask", pts: 300, image: "assets/Flask.png" },
  { key: "mug", title: "Ceramic Mug", pts: 400, image: "assets/Mug.png" },
];

window.bootApp = function (uid, data, showWelcome) {
  state.uid = uid; state.user = data.profile; state.score = data.score || 0;
  state.quizzesCompleted = data.quizzesCompleted || 0; state.claimedBadges = data.claimedBadges || [];
  state.answeredQuestions = data.answeredQuestions || []; state.gamesCompleted = data.gamesCompleted || {};
  state.active = data.active !== undefined ? data.active : false;
  state.attendance = data.attendance !== undefined ? data.attendance : false;
  state.cardId = data.cardId || "";
  state.redeemedReward = data.redeemedReward || null;

  answeredSet.clear();
  state.answeredQuestions.forEach((i) => answeredSet.add(i));

  document.getElementById("nav-username").textContent = state.user.name;
  document.getElementById("bottom-nav").classList.add("visible");
  
  const urlParams = new URLSearchParams(window.location.search);
  const rGame = urlParams.get('rewardGame');
  const rPts = parseInt(urlParams.get('rewardPts'), 10);

  if (rGame && !isNaN(rPts)) {
    window.history.replaceState({}, document.title, window.location.pathname); 
    if (!state.gamesCompleted[rGame]) {
      state.score += rPts;
      state.gamesCompleted[rGame] = rPts;
      saveToFirebase(); 
      setTimeout(() => showToast(`Success! +${rPts} points added.`), 500);
      setTimeout(() => checkBadgeUnlocks(), 1200);
    } else {
      setTimeout(() => showToast("Points already claimed for this game."), 500);
    }
  }
  
  updateHomeUI(); updateGamesUI(); renderRewardsPage(); updateProfilePage();

  // Go to Home on login
  showView("view-home"); currentTab = 0;
  document.querySelectorAll(".nav-tab").forEach((t) => t.classList.remove("active"));
  document.getElementById("tab-home").classList.add("active");
  startCarousel();
  
  // Manage inline card banner visibility based on if the card is linked
  const slideBannerCard = document.getElementById('slide-banner-card');
  const bannerDotsWrapper = document.getElementById('banner-carousel-dots');
  const bannerTrack = document.getElementById('banner-carousel-track');
  const topBannersWrap = document.getElementById('top-banners-wrap');

  if (slideBannerCard) {
    if (state.cardId) {
      slideBannerCard.style.display = 'none';
      if (bannerDotsWrapper) bannerDotsWrapper.style.display = 'none';
      if (topBannersWrap) {
        topBannersWrap.style.marginLeft = '0';
        topBannersWrap.style.marginRight = '0';
        topBannersWrap.style.padding = '0';
      }
      if (bannerTrack) {
        bannerTrack.style.display = 'block';
        bannerTrack.style.transform = 'none';
      }
      goToBannerSlide(0);
    } else {
      slideBannerCard.style.display = 'block';
      if (bannerDotsWrapper) bannerDotsWrapper.style.display = 'flex';
      if (topBannersWrap) {
        topBannersWrap.style.marginLeft = '';
        topBannersWrap.style.marginRight = '';
        topBannersWrap.style.padding = '';
      }
      if (bannerTrack) {
        bannerTrack.style.display = 'flex';
      }
    }
  }

  if (showWelcome === true && state.user) {
    document.getElementById("welcome-name").textContent = "👋 Hi, " + state.user.name + "!";
    document.getElementById("welcome-email").textContent = state.user.email;
    setTimeout(() => { document.getElementById("welcome-dialog").classList.add("open"); launchConfetti(4000); }, 400);
  }
};

window.showView = function showView(id) { document.querySelectorAll(".view").forEach((v) => v.classList.remove("active")); const el = document.getElementById(id); if (el) el.classList.add("active"); };

window.switchTab = function switchTab(tab) {
  document.querySelectorAll(".nav-tab").forEach((t) => t.classList.remove("active"));
  document.getElementById("tab-" + tab).classList.add("active");
  currentTab = tabOrder.indexOf(tab);
  
  if (tab === "home") { showView("view-home"); updateHomeUI(); } 
  else if (tab === "rewards") { showView("view-rewards"); renderRewardsPage(); } 
  else if (tab === "scanner") { showView("view-scanner"); } 
  else if (tab === "profile") { 
    showView("view-profile"); 
    updateProfilePage(); 
    // Card animation: flip, wait 2s, flip back
    const cardInner = document.getElementById('card-inner');
    if (cardInner) {
      cardInner.classList.remove('flipped');
      setTimeout(() => {
        cardInner.classList.add('flipped');
        setTimeout(() => {
          cardInner.classList.remove('flipped');
        }, 2000);
      }, 400);
    }
  }

  if (tab !== "scanner") stopPointScanner();
};

// Swipe navigation removed per request

window.doLogin = async function() {
  const email = document.getElementById("login-email").value.trim(); 
  let pass = document.getElementById("login-pass").value.trim(); 
  const errEl = document.getElementById("login-error"); 
  const btn = document.getElementById("btn-login");
  errEl.textContent = ""; if (!email || !pass) { errEl.textContent = "Please fill in all fields."; return; }
  
  const rawPin = pass;
  while (pass.length > 0 && pass.length < 6) pass += "0";

  btn.textContent = "Logging in…"; btn.disabled = true;
  try {
    const cred = await window._fb.signInWithEmailAndPassword(window._fb.auth, email, pass);
    const snap = await window._fb.getDoc(window._fb.doc(window._fb.db, "users", cred.user.uid));
    if (snap.exists()) {
      const userData = snap.data();
      // Check active status
      if (userData.active === false) {
        await window._fb.signOut(window._fb.auth);
        errEl.innerHTML = '⚠️ Your account is not yet activated.<br><span style="font-size:0.85rem;color:var(--muted)">Please contact your Haleon event admin to activate your account.</span>';
        btn.textContent = "LOGIN"; btn.disabled = false;
        return;
      }
      window.bootApp(cred.user.uid, userData, false);
    } else {
      errEl.textContent = "Account data not found.";
    }
  } catch (e) { errEl.textContent = friendlyError(e.code); } finally { btn.textContent = "LOGIN"; btn.disabled = false; }
};

window.doRegister = async function() {
  const name = document.getElementById("reg-name").value.trim(); const email = document.getElementById("reg-email").value.trim(); const phone = document.getElementById("reg-phone").value.trim(); const pharmacy = document.getElementById("reg-pharmacy").value.trim(); const pass = document.getElementById("reg-pass").value; const errEl = document.getElementById("reg-error"); const btn = document.getElementById("btn-register");
  errEl.textContent = ""; if (!name || !email || !phone || !pharmacy || !pass) { errEl.textContent = "Please fill in all fields."; return; }
  if (pass.length < 6) { errEl.textContent = "Password must be at least 6 characters."; return; }
  btn.textContent = "Creating account…"; btn.disabled = true;
  try {
    const cred = await window._fb.createUserWithEmailAndPassword(window._fb.auth, email, pass);
    const uid = cred.user.uid; const memberId = uid.slice(0, 8).toUpperCase();
    const profile = { name, email, phone, pharmacy, memberId };
    const userData = { profile, score: 0, quizzesCompleted: 0, claimedBadges: [], answeredQuestions: [], gamesCompleted: {}, tier: "Student", createdAt: new Date().toISOString() };
    await window._fb.setDoc(window._fb.doc(window._fb.db, "users", uid), userData);
    syncToSheets(uid, userData); window.bootApp(uid, userData, true);
  } catch (e) { errEl.textContent = friendlyError(e.code); } finally { btn.textContent = "CREATE ACCOUNT"; btn.disabled = false; }
};

window.doFindPin = async function() {
  const email  = document.getElementById("forgot-email").value.trim();
  const errEl  = document.getElementById("forgot-error");
  const btn    = document.getElementById("btn-forgot");
  errEl.textContent = "";
  if (!email) { errEl.textContent = "Please enter your email address."; return; }
  btn.textContent = "Searching…"; btn.disabled = true;
  try {
    const { collection, query, where, getDocs } = window._fb;
    const usersRef = collection(window._fb.db, "users");
    const q = query(usersRef, where("profile.email", "==", email.toLowerCase()));
    const snap = await getDocs(q);
    if (snap.empty) {
      errEl.textContent = "No account found with this email address.";
    } else {
      const userData = snap.docs[0].data();
      const pin = userData.profile?.pin || "";
      if (!pin) {
        errEl.textContent = "PIN not found for this account. Please contact support.";
      } else {
        document.getElementById("pin-reveal-value").textContent = pin;
        document.getElementById("pin-reveal-dialog").classList.add("open");
      }
    }
  } catch (e) {
    errEl.textContent = "An error occurred. Please try again.";
    console.error("doFindPin error:", e);
  } finally {
    btn.textContent = "CHECK"; btn.disabled = false;
  }
};

window.closePinRevealDialog = function() {
  document.getElementById("pin-reveal-dialog").classList.remove("open");
  showView("view-login");
};


window.doLogout = async function() {
  await window._fb.signOut(window._fb.auth); state.uid = null; state.user = null; state.score = 0; state.quizzesCompleted = 0; state.claimedBadges = []; state.answeredQuestions = []; state.gamesCompleted = {};
  answeredSet.clear(); document.getElementById("bottom-nav").classList.remove("visible"); showView("view-login");
};

function friendlyError(code) { const map = { "auth/user-not-found": "No account found.", "auth/wrong-password": "Incorrect password.", "auth/email-already-in-use": "Email already exists.", "auth/invalid-email": "Invalid email.", "auth/weak-password": "Min 6 characters.", "auth/invalid-credential": "Incorrect email or password." }; return map[code] || "Something went wrong. Please try again."; }

async function saveToFirebase() {
  if (!state.uid) return;
  const tier = getTier().name;
  const data = { score: state.score, quizzesCompleted: state.quizzesCompleted, claimedBadges: state.claimedBadges, answeredQuestions: [...answeredSet], gamesCompleted: state.gamesCompleted, tier, lastUpdated: window._fb.serverTimestamp() };
  try {
    await window._fb.updateDoc(window._fb.doc(window._fb.db, "users", state.uid), data);
    syncToSheets(state.uid, { profile: state.user, ...data, lastUpdated: new Date().toISOString() });
    showSyncStatus("✓ Synced");
  } catch (e) { showSyncStatus("⚠ Sync failed"); }
}

function showSyncStatus(msg) { const el = document.getElementById("sync-status"); if (!el) return; el.textContent = msg; el.style.opacity = "1"; setTimeout(() => { el.style.opacity = "0"; }, 2500); }

function syncToSheets(uid, data) {
  if (!SHEETS_WEBHOOK || SHEETS_WEBHOOK === "YOUR_APPS_SCRIPT_WEB_APP_URL") return;
  const badgeNames = (data.claimedBadges || []).map((id) => { const def = badgeDefs.find((b) => b.id === id); return def ? def.name : id; }).join(", ");
  const payload = { uid, name: data.profile?.name || "", email: data.profile?.email || "", phone: data.profile?.phone || "", pharmacy: data.profile?.pharmacy || "", memberId: data.profile?.memberId || "", score: data.score || 0, quizzesCompleted: data.quizzesCompleted || 0, tier: data.tier || "Student", badges: badgeNames, badgesCount: (data.claimedBadges || []).length, lastUpdated: data.lastUpdated || new Date().toISOString(), pin: data.profile?.pin || "" };
  fetch(SHEETS_WEBHOOK, { method: "POST", mode: "no-cors", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(() => {});
}

function getTier() { 
    if (state.user && state.user.profession) {
        const prof = state.user.profession.toLowerCase();
        if (prof.includes("owner"))     return { name: "Pharmacy Owner",       cls: "card-owner" };
        if (prof.includes("pharmacist")) return { name: "Pharmacist",           cls: "card-community" };
    }
    return { name: "Haleon Partner", cls: "card-student" }; 
}

function updateHomeUI() {
  const tier = getTier();
  const completedCount = Object.keys(state.gamesCompleted || {}).length;
  const pct = Math.round((completedCount / TOTAL_GAMES) * 100);
  const circumference = 2 * Math.PI * 60;
  document.getElementById("progress-ring").style.strokeDashoffset = circumference - (pct / 100) * circumference;
  document.getElementById("progress-pct").textContent = pct + "%";
  document.getElementById("pts-display").textContent = state.score.toLocaleString() + " Points";
  document.getElementById("tier-badge-home").textContent = tier.name;
  if (state.user) document.getElementById("nav-username").textContent = state.user.name;
  updateBadgeStates(); updateHomeRedeemBtns();
}

function updateHomeRedeemBtns() { const flask = document.getElementById("home-redeem-flask"); const pen = document.getElementById("home-redeem-pen"); if (flask) flask.disabled = state.score < 300; if (pen) pen.disabled = state.score < 100; }

function updateGamesUI() {
  const games = ['basket', 'myth', 'buzzer', 'memory', 'catch', 'prescription', 'placement', 'mitohype', 'spin'];
  games.forEach(g => { 
    const statusEl = document.getElementById('gstatus-' + g); 
    if (statusEl) { 
      if (state.gamesCompleted[g]) { 
        statusEl.textContent = "✓ Completed"; 
        statusEl.style.color = "var(--green)"; 
      } else { 
        statusEl.textContent = "Play"; 
        statusEl.style.color = "var(--muted)"; 
      } 
    } 
  });
}

const GAMES_INFO = {
  'basket': { name: 'Build Basket', icon: 'assets/Build Basket.png' },
  'myth': { name: 'Myth vs Fact', icon: 'assets/Myth & Fact.png' },
  'match': { name: 'Matching Game', icon: 'assets/Matching.png' },
  // 'memory': { name: 'Memory Challenge', icon: 'assets/Memory Challenge.png' },
  // 'catch': { name: 'Catch & Win', icon: 'assets/Catch.png' },
  // 'prescription': { name: 'Rx Challenge', icon: 'assets/Rx Challenge.png' },
  'mitohype': { name: 'Panadol Game', icon: 'assets/Panadol Challenge.png' },
  // 'spin': { name: 'Spin to Win', icon: 'assets/Spin to Win.png' },
  'spot': { name: 'Centrum Game', icon: 'assets/Magnifier.png' },
  // 'pacman': { name: 'Pacman', icon: 'assets/Buzzer Battle.png' },
  'buzzer': { name: 'Buzzer Battle', icon: 'assets/Buzzer Battle.png' },
  'placement': { name: 'Best Place', icon: 'assets/Best Place.png' }
};

window.openGame = function(url, gameId) {
  if (state.gamesCompleted[gameId]) {
    const info = GAMES_INFO[gameId] || { name: 'Game', icon: 'assets/logo1.png' };
    const pts = state.gamesCompleted[gameId];
    const ptsStr = (pts === true) ? "Points Collected" : (pts + " Points Collected");

    const iconEl = document.getElementById('replay-dialog-icon');
    if (iconEl) iconEl.innerHTML = `<img src="${info.icon}" style="width: 80px; height: 80px; object-fit: contain;">`;
    
    const nameEl = document.getElementById('replay-dialog-name');
    if (nameEl) nameEl.textContent = info.name;
    
    const ptsEl = document.getElementById('replay-dialog-pts');
    if (ptsEl) ptsEl.textContent = ptsStr;
    
    const dialogEl = document.getElementById('replay-dialog');
    if (dialogEl) dialogEl.classList.add('open');
    
    const playBtn = document.getElementById('replay-dialog-play-btn');
    if (playBtn) {
      playBtn.style.display = 'block';
      playBtn.onclick = function() {
        dialogEl.classList.remove('open');
        window.location.href = url + `?uid=${state.uid}&exhausted=true`;
      };
    }
  } else {
    window.location.href = url + `?uid=${state.uid}`;
  }
};

// ════════════════════════════════════════
// GAME POINTS SCANNER
// ════════════════════════════════════════
let scanStream = null; let scanTicker = null;

window.startPointScanner = async function() { 
  document.getElementById("scan-status-text").textContent = "Scanning..."; 
  document.getElementById("scan-video-wrap").style.display = "block"; 
  document.getElementById("btn-start-scan").style.display = "none"; 
  document.getElementById("btn-stop-scan").style.display = "block"; 
  try { 
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }); 
    const vid = document.getElementById("scan-video"); 
    vid.srcObject = scanStream; 
    await vid.play(); 
    scanTicker = setInterval(tickScan, 200); 
  } catch (e) { 
    stopPointScanner(); showToast("Camera access denied."); 
  } 
};

window.stopPointScanner = function() { 
  if (scanTicker) clearInterval(scanTicker); 
  if (scanStream) scanStream.getTracks().forEach(t => t.stop()); 
  document.getElementById("scan-video-wrap").style.display = "none"; 
  document.getElementById("btn-start-scan").style.display = "block"; 
  document.getElementById("btn-stop-scan").style.display = "none"; 
  document.getElementById("scan-status-text").textContent = "Camera stopped"; 
};

function tickScan() { 
  const vid = document.getElementById("scan-video"); 
  if (!vid || vid.readyState < 2) return; 
  const cvs = document.createElement("canvas"); 
  cvs.width = vid.videoWidth; 
  cvs.height = vid.videoHeight; 
  const ctx = cvs.getContext("2d"); 
  ctx.drawImage(vid, 0, 0); 
  const px = ctx.getImageData(0, 0, cvs.width, cvs.height); 
  const result = jsQR(px.data, px.width, px.height, { inversionAttempts: "dontInvert" }); 
  if (result && result.data) { 
    stopPointScanner(); 
    processGameQR(result.data); 
  } 
}

async function processGameQR(raw) {
  try {
    const data = JSON.parse(raw);
    if (data.type !== "game_reward" || !data.gameId || !data.points) throw new Error();
    
    if (state.gamesCompleted[data.gameId]) {
        const info = GAMES_INFO[data.gameId] || { name: 'Game', icon: 'assets/logo1.png' };
        const pts = state.gamesCompleted[data.gameId];
        const ptsStr = (pts === true) ? "Points Already Collected" : (pts + " Points Already Collected");

        const iconEl = document.getElementById('replay-dialog-icon');
        if (iconEl) iconEl.innerHTML = `<img src="${info.icon}" style="width: 80px; height: 80px; object-fit: contain;">`;
        const nameEl = document.getElementById('replay-dialog-name');
        if (nameEl) nameEl.textContent = info.name;
        const ptsEl = document.getElementById('replay-dialog-pts');
        if (ptsEl) ptsEl.textContent = ptsStr;
        
        const dialogEl = document.getElementById('replay-dialog');
        if (dialogEl) dialogEl.classList.add('open');
        
        const playBtn = document.getElementById('replay-dialog-play-btn');
        if (playBtn) playBtn.style.display = 'none';

        return;
    }
    
    state.score += data.points;
    state.gamesCompleted[data.gameId] = data.points;
    await saveToFirebase();
    showToast(`Success! +${data.points} points added.`);
    updateHomeUI();
    updateGamesUI();
    updateProfilePage();
    switchTab("home");
  } catch (e) {
    showToast("Invalid QR code.");
  }
}

// ════════════════════════════════════════
// PHYSICAL CARD LINKING LOGIC
// ════════════════════════════════════════
let dialogStream = null;

window.openCardLinkDialog = function() {
  document.getElementById('card-link-step-scan').style.display = 'block';
  document.getElementById('card-link-step-success').style.display = 'none';
  document.getElementById('dialog-video-wrap').style.display = 'none';
  document.getElementById('btn-dialog-scan').style.display = 'block';
  
  document.getElementById('card-link-dialog').classList.add('open');
};

window.closeCardLinkDialog = function() {
  document.getElementById('card-link-dialog').classList.remove('open');
  window.stopDialogScanner();
};

window.startDialogScanner = async function() {
  const videoWrap = document.getElementById('dialog-video-wrap');
  const videoEl = document.getElementById('dialog-scan-video');
  const scanBtn = document.getElementById('btn-dialog-scan');
  
  videoWrap.style.display = 'block';
  scanBtn.style.display = 'none';

  try {
    dialogStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    videoEl.srcObject = dialogStream;
    videoEl.setAttribute("playsinline", true);
    await videoEl.play();
    requestAnimationFrame(tickDialogScan);
  } catch (err) {
    console.error("Camera access denied:", err);
    showToast("Please allow camera access to scan your card.");
  }
};

window.stopDialogScanner = function() {
  if (dialogStream) {
    dialogStream.getTracks().forEach(track => track.stop());
    dialogStream = null;
  }
};

function tickDialogScan() {
  if (!dialogStream) return; 
  
  const videoEl = document.getElementById('dialog-scan-video');
  if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
    const canvas = document.createElement("canvas");
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Assuming jsQR is globally available from the HTML CDN
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
    
    if (code && code.data) {
      handleSuccessfulCardLink(code.data.trim());
      return; 
    }
  }
  requestAnimationFrame(tickDialogScan);
}

async function handleSuccessfulCardLink(qrData) {
  window.stopDialogScanner();
  
  if (!state.uid) return;
  if (state.cardId) {
    showToast('Card already linked: ' + state.cardId);
    return;
  }

  // Extract just the ID value after '=' from a URL like:
  // https://www.sirkil.com/hpc.html?hid=HPC000501
  const cardId = extractCardId(qrData);

  try {
    await window._fb.updateDoc(window._fb.doc(window._fb.db, 'users', state.uid), { cardId: cardId });
    state.cardId = cardId;
    
    // Update local UI
    updateProfilePage();
    
    // Switch dialog state to success message
    document.getElementById('card-link-step-scan').style.display = 'none';
    document.getElementById('card-link-step-success').style.display = 'block';
  } catch(e) {
    console.error("Error saving card ID", e);
    showToast('Failed to link card. Please try again.');
  }
}

function extractCardId(raw) {
  // If it's a URL, extract the value after the last '='
  if (raw.includes('=')) {
    return raw.split('=').pop().trim();
  }
  return raw.trim();
}

window.finishCardLinking = function() {
  window.closeCardLinkDialog();
  
  // Remove the banner from the Home View so it doesn't show again
  const slideBannerCard = document.getElementById('slide-banner-card');
  const bannerDotsWrapper = document.getElementById('banner-carousel-dots');
  const bannerTrack = document.getElementById('banner-carousel-track');
  const topBannersWrap = document.getElementById('top-banners-wrap');

  if (slideBannerCard) slideBannerCard.style.display = 'none';
  if (bannerDotsWrapper) bannerDotsWrapper.style.display = 'none';
  
  if (topBannersWrap) {
    topBannersWrap.style.marginLeft = '0';
    topBannersWrap.style.marginRight = '0';
    topBannersWrap.style.padding = '0';
  }
  if (bannerTrack) {
    bannerTrack.style.display = 'block';
    bannerTrack.style.transform = 'none';
  }
  
  if (window.goToBannerSlide) window.goToBannerSlide(0);
};

// ════════════════════════════════════════
// MISC & UTILS
// ════════════════════════════════════════

function updateBadgeStates() { badgeDefs.forEach((b) => { const chip = document.getElementById("badge-" + b.id); if (!chip) return; if (state.claimedBadges.includes(b.id)) chip.className = "badge-chip claimed"; else if (state.score >= b.pts) chip.className = "badge-chip claimable"; else chip.className = "badge-chip locked"; }); }

function checkBadgeUnlocks() { 
  const newlyUnlocked = badgeDefs.filter((b) => !state.claimedBadges.includes(b.id) && state.score >= b.pts); 
  if (newlyUnlocked.length === 0) return; 
  newlyUnlocked.forEach((b) => state.claimedBadges.push(b.id)); 
  updateBadgeStates(); 
  const b = newlyUnlocked[0]; 
  setTimeout(() => { 
    document.getElementById("badge-dialog-icon").innerHTML = `<img src="${b.image}" alt="Badge" style="width: 60px; height: 60px; object-fit: contain;">`;
    document.getElementById("badge-dialog-name").textContent = b.name; 
    document.getElementById("badge-dialog").classList.add("open"); 
    launchConfetti(4000); 
  }, 2200); 
  saveToFirebase(); 
}

window.tryClaimBadge = async function(id) { 
  const b = badgeDefs[id]; 
  if (state.claimedBadges.includes(id) || state.score < b.pts) return; 
  state.claimedBadges.push(id); 
  updateBadgeStates(); 
  document.getElementById("badge-dialog-icon").innerHTML = `<img src="${b.image}" alt="Badge" style="width: 60px; height: 60px; object-fit: contain;">`;
  document.getElementById("badge-dialog-name").textContent = b.name; 
  document.getElementById("badge-dialog").classList.add("open"); 
  launchConfetti(3000); 
  await saveToFirebase(); 
};

window.closeWelcomeDialog = function() { document.getElementById("welcome-dialog").classList.remove("open"); };
window.closeBadgeDialog = function() { document.getElementById("badge-dialog").classList.remove("open"); updateHomeUI(); if (document.getElementById("view-profile").classList.contains("active")) updateProfilePage(); };

let highlightIdx = 0; let highlightTimer = null;
window.goToSlide = function(idx) { 
  highlightIdx = idx; 
  const track = document.getElementById("carousel-track"); 
  if (!track || !track.parentElement) return; 
  track.style.transform = `translateX(-${idx * track.parentElement.clientWidth}px)`; 
  const dotsContainer = document.getElementById("highlights-dots-container");
  if (dotsContainer) {
    dotsContainer.querySelectorAll(".dot").forEach((d, i) => d.classList.toggle("active", i === idx)); 
  }
};

let bannerIdx = 0; let bannerTimer = null;
window.goToBannerSlide = function(idx) {
  bannerIdx = idx;
  const track = document.getElementById("banner-carousel-track");
  if (!track || !track.parentElement) return;
  track.style.transform = `translateX(-${idx * track.parentElement.clientWidth}px)`;
  const dotsContainer = document.getElementById("banner-carousel-dots");
  if (dotsContainer) {
    const dotsArray = Array.from(dotsContainer.querySelectorAll(".dot"));
    // Since some dots may be hidden, we toggle them directly by index within the array
    dotsArray.forEach((d, i) => d.classList.toggle("active", i === idx));
  }
};

function startCarousel() { 
  if (highlightTimer) clearInterval(highlightTimer); 
  highlightTimer = setInterval(() => { 
    const track = document.getElementById("carousel-track");
    if(track) {
      const slides = track.querySelectorAll(".carousel-slide");
      const total = slides.length; 
      if (total > 0) goToSlide((highlightIdx + 1) % total); 
    }
  }, 3500); 

  if (bannerTimer) clearInterval(bannerTimer);
  bannerTimer = setInterval(() => {
    const track = document.getElementById("banner-carousel-track");
    if(track) {
      const slides = Array.from(track.querySelectorAll(".carousel-slide"));
      const total = slides.length;
      if (total > 0) {
        let nextIdx = (bannerIdx + 1) % total;
        // Skip hidden slides
        while(slides[nextIdx].style.display === 'none') {
           nextIdx = (nextIdx + 1) % total;
           if(nextIdx === bannerIdx) break; // Avoid infinite loop if all hide/none are hidden
        }
        goToBannerSlide(nextIdx); 
      }
    }
  }, 3500);
}

function renderRewardsPage() { 
  const grid = document.getElementById("rewards-full-grid"); 
  const noteContainer = document.getElementById("rewards-note-container");
  const ptsEl = document.getElementById("rewards-pts-display"); 
  if (!grid) return; 
  if (ptsEl) ptsEl.textContent = state.score.toLocaleString() + " pts"; 
  
  grid.innerHTML = ""; 
  
  if (noteContainer) {
    noteContainer.innerHTML = `<div style="background:rgba(255,193,7,0.1);border:1px solid rgba(255,193,7,0.4);border-radius:12px;padding:14px 16px;color:#fbbf24;font-size:0.88rem;font-weight:600;text-align:center;max-width:600px;margin:0 auto;">
      ⚠️ You can only redeem <strong>one reward</strong>. Choose your reward wisely.
    </div>`;
  }
  
  rewardsData.forEach((r) => { 
    const canRedeem = !state.redeemedReward && state.score >= r.pts; 
    const isLocked = !!state.redeemedReward && state.redeemedReward !== r.key;
    grid.innerHTML += `
      <div class="reward-card" style="position:relative;overflow:hidden;">
        ${isLocked ? `<div style="position:absolute;inset:0;background:rgba(0,0,0,0.5);z-index:10;border-radius:inherit;display:flex;align-items:center;justify-content:center;"><img src="assets/Lock.png" alt="Locked" style="width:48px;height:48px;object-fit:contain;opacity:0.9;"></div>` : ''}
        <div class="reward-img" style="background: linear-gradient(135deg, #1a2820, #0d1a12); padding: 12px; height: 120px;">
          <img src="${r.image}" alt="${r.title}" style="width: 100%; height: 100%; object-fit: contain;">
        </div>
        <div class="reward-info">
          <div class="reward-title">${r.title}</div>
          <button class="redeem-btn" ${canRedeem ? "" : "disabled"} onclick="openRedeemQR('${r.key}','${r.title}',${r.pts})">
            ${r.pts} Pts — Redeem
          </button>
        </div>
      </div>`; 
  }); 
}
let qrTimerInterval = null; let redeemUnsubscribe = null; let redeemOpenedAt = 0;
window.openRedeemQR = function(key, title, pts) { redeemOpenedAt = Date.now(); document.getElementById('qr-dialog-title').textContent = 'Redeem: ' + title; const payload = JSON.stringify({ uid: state.uid, memberId: state.user?.memberId || '', name: state.user?.name || '', email: state.user?.email || '', phone: state.user?.phone || '', pharmacy: state.user?.pharmacy || '', reward: title, pts, key, ts: Date.now() }); const imgEl = document.getElementById('qr-dialog-img'); imgEl.style.opacity = '0.2'; imgEl.src = ''; setTimeout(() => { imgEl.onload = () => { imgEl.style.opacity = '1'; }; imgEl.onerror = () => { imgEl.style.opacity = '1'; }; imgEl.src = makeQRUrl(payload, 200) + '&t=' + Date.now(); }, 80); let secs = 60; document.getElementById('qr-timer').textContent = secs; if (qrTimerInterval) clearInterval(qrTimerInterval); qrTimerInterval = setInterval(() => { secs--; const el = document.getElementById('qr-timer'); if (el) el.textContent = secs; if (secs <= 0) { clearInterval(qrTimerInterval); closeQRDialog(); } }, 1000); document.getElementById('qr-dialog').classList.add('open'); stopRedeemListener(); if (window._fb?.onSnapshot && state.uid) { redeemUnsubscribe = window._fb.onSnapshot(window._fb.doc(window._fb.db, 'users', state.uid), snap => { if (!snap.exists()) return; const d = snap.data(); if (d.lastRedemptionAt && d.lastRedemptionAt > redeemOpenedAt) { stopRedeemListener(); showRedeemSuccess(d.lastRedemptionReward || title, d.lastRedemptionPts || pts, d.score ?? state.score, key); } }); } };
function stopRedeemListener() { if (redeemUnsubscribe) { redeemUnsubscribe(); redeemUnsubscribe = null; } }
window.closeQRDialog = function() { stopRedeemListener(); if (qrTimerInterval) clearInterval(qrTimerInterval); document.getElementById('qr-dialog').classList.remove('open'); };
function showRedeemSuccess(reward, pts, newScore, rewardKey) { closeQRDialog(); state.score = newScore; state.redeemedReward = rewardKey; updateHomeUI(); renderRewardsPage(); if (document.getElementById('view-profile')?.classList.contains('active')) updateProfilePage(); document.getElementById('redeem-success-reward').textContent = reward; document.getElementById('redeem-success-pts').textContent = '−' + pts + ' pts deducted · New balance: ' + newScore.toLocaleString() + ' pts'; document.getElementById('redeem-success-dialog').classList.add('open'); launchConfetti(3000); }
window.closeRedeemSuccessDialog = function() { document.getElementById('redeem-success-dialog').classList.remove('open'); };

function updateProfilePage() { 
  if (!state.user) return; 
  const tier = getTier(); 
  
  // Set member name on the card
  document.getElementById('card-name-back').textContent = state.user.name; 

// --- 100% RELIABLE LOCAL QR CODE GENERATION ---
  // 1. Get the phone number securely
  const userPhone = state.user?.phone || state.user?.whatsapp || '00000000000';
  const qrText = 'H' + userPhone;

  const qrContainer = document.querySelector('.cb-qr');
  
  if (qrContainer) {
    // 2. Completely empty the container to prevent ghost images from a previous account
    qrContainer.innerHTML = '';
    qrContainer.style.backgroundColor = '#ffffff';
    qrContainer.style.padding = '6px';
    
    // 3. Generate the QR code in an off-screen temporary div
    const tempDiv = document.createElement('div');
    new QRCode(tempDiv, {
        text: qrText,
        width: 150,
        height: 150,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.M
    });
    
    // 4. Force a slight delay to ensure qrcode.js finishes drawing the new data
    setTimeout(() => {
      const canvas = tempDiv.querySelector('canvas');
      if (canvas) {
        const img = document.createElement('img');
        img.src = canvas.toDataURL("image/png");
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain';
        
        // Clear one more time just before appending to avoid double images
        qrContainer.innerHTML = '';
        qrContainer.appendChild(img);
      }
    }, 50);
  }
  // ----------------------------------

  // Update Stats & Profile Info
  document.getElementById('stat-pts').textContent = state.score.toLocaleString(); 
  document.getElementById('stat-quizzes').textContent = Object.keys(state.gamesCompleted || {}).length;
  document.getElementById('info-fname').textContent = state.user.firstName || state.user.name || '—'; 
  document.getElementById('info-lname').textContent = state.user.lastName || '—'; 
  document.getElementById('info-email').textContent = state.user.email; 
  document.getElementById('info-phone').textContent = state.user.phone || state.user.whatsapp || '—'; 
  document.getElementById('info-pharmacy').textContent = state.user.pharmacy || '—'; 
  document.getElementById('info-city').textContent = state.user.city || '—'; 
  document.getElementById('info-profession').textContent = state.user.profession || '—'; 
  
  // Set the Physical Card ID safely 
  const cardIdEl = document.getElementById('info-card-id');
  if (cardIdEl) {
    if (state.cardId) {
      cardIdEl.textContent = state.cardId;
    } else {
      cardIdEl.innerHTML = '<a href="#" onclick="openCardLinkDialog(); return false;" style="color:var(--green); text-decoration:underline; font-weight:bold;">Link Card</a>';
    }
  }
  
  // Update Badges
  const badgesEl = document.getElementById('profile-badges'); 
  if (state.claimedBadges.length === 0) {
    badgesEl.innerHTML = '<div class="profile-badge-empty">No badges claimed yet. Earn points to unlock!</div>'; 
  } else {
    badgesEl.innerHTML = state.claimedBadges.map(id => { 
      const b = badgeDefs.find(d => d.id === id); 
      return b ? `<div class="profile-badge-item" style="display: flex; align-items: center; gap: 8px;"><img src="${b.image}" alt="${b.name}" style="width: 20px; height: 20px; object-fit: contain;"> ${b.name}</div>` : ''; 
    }).join(''); 
  }
}
window.flipCard = function() { document.getElementById("card-inner").classList.toggle("flipped"); };

function launchConfetti(duration) {
  const canvas = document.getElementById("confetti-canvas");
  if(!canvas) return;
  const ctx = canvas.getContext("2d");
  canvas.style.display = "block";
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const pieces = [];
  const colors = ["#4ade80", "#22c55e", "#f0f4f8", "#facc15", "#60a5fa", "#f472b6"];
  for (let i = 0; i < 100; i++) pieces.push({ x: Math.random() * canvas.width, y: -10 - Math.random() * 200, r: 4 + Math.random() * 6, color: colors[Math.floor(Math.random() * colors.length)], vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 4, rot: Math.random() * 360, rs: (Math.random() - 0.5) * 6 });
  const end = Date.now() + duration;
  (function frame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach((p) => {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate((p.rot * Math.PI) / 180); ctx.fillStyle = p.color;
      ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6); ctx.restore();
      p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.rot += p.rs;
    });
    if (Date.now() < end) requestAnimationFrame(frame);
    else { ctx.clearRect(0, 0, canvas.width, canvas.height); canvas.style.display = "none"; }
  })();
}
window.showToast = function(msg) { const toast = document.getElementById("toast"); toast.textContent = msg; toast.classList.add("show"); setTimeout(() => toast.classList.remove("show"), 2400); };
window.addEventListener("DOMContentLoaded", () => { startCarousel(); const lbl = document.querySelector('.progress-label'); if(lbl) lbl.textContent = "Games Completed"; });