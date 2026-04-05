// State
let selectedWorkTime = 5; // minutes
let selectedBreakTime = 5; // minutes
let timeLeftText = selectedWorkTime * 60; // seconds
let isRunning = false;
let isWorkMode = true;
let timerInterval = null;
let sessionsCompleted = parseInt(localStorage.getItem('timer_sessions')) || 0;
let totalWorkMinutes = parseInt(localStorage.getItem('timer_total_minutes')) || 0;
let totalBreakMinutes = parseInt(localStorage.getItem('timer_total_break')) || 0;

// Daily Reset Logic
function checkNewDay() {
  const todayStr = new Date().toDateString();
  const lastDate = localStorage.getItem('timer_last_date');
  
  if (lastDate !== todayStr) {
    sessionsCompleted = 0;
    totalWorkMinutes = 0;
    totalBreakMinutes = 0;
    
    localStorage.setItem('timer_sessions', 0);
    localStorage.setItem('timer_total_minutes', 0);
    localStorage.setItem('timer_total_break', 0);
    localStorage.setItem('timer_last_date', todayStr);
  } else {
    // If it's the same day but no lastDate was set (first time), set it.
    localStorage.setItem('timer_last_date', todayStr);
  }
}

// Check for new day immediately
checkNewDay();

// DOM Elements
const timerDisplay = document.getElementById('timer-display');
const modeDisplay = document.getElementById('mode-display');
const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const resetBtn = document.getElementById('reset-btn');
const sessionCountDisplay = document.getElementById('session-count');
const totalTimeDisplay = document.getElementById('total-time-count');
const totalBreakDisplay = document.getElementById('total-break-count');
const progressCircle = document.querySelector('.progress-ring-circle');
const hpBarFill = document.getElementById('hp-bar-fill');
const hpText = document.getElementById('hp-text');
const workBtns = document.querySelectorAll('.work-btn');
const breakBtns = document.querySelectorAll('.break-btn');
const speechBubble = document.getElementById('speech-bubble');

const ranks = [
  { minLevel: 1, name: 'たびだち' },
  { minLevel: 3, name: 'かけだし勇者' },
  { minLevel: 5, name: 'いっちょまえ魔法使い' },
  { minLevel: 10, name: 'ベテラン戦士' },
  { minLevel: 20, name: 'でんせつのナイト' },
  { minLevel: 30, name: 'マスター勇者' },
  { minLevel: 50, name: 'うちゅう大王' }
];

const workPhrases = [
  "よーし！全集中でやっつけるぞ！",
  "オレのターン！ドロー！",
  "やればできるって見せてやるぜ！",
  "レベルアップのビッグチャンスだ！",
  "よし！今の自分より強くなるぞ！",
  "ウルトラスーパー集中モード発動！",
  "冒険の準備はできたか？いくぞ！"
];

const breakPhrases = [
  "ふぅ…ナイスファイトだったぜ！",
  "今はHPを回復する時間だ…むにゃむにゃ…",
  "焦るな、勇者にも休みは必要だ！",
  "セーブポイントに到着！休んでおこう。",
  "宿屋でHP全回復中…zzZ",
  "おやつ食べる？それとも水飲む？",
  "次の敵に備えて、しっかり休むぞ！"
];

function getRankName(level) {
  let rankName = ranks[0].name;
  for (let i = 0; i < ranks.length; i++) {
    if (level >= ranks[i].minLevel) {
      rankName = ranks[i].name;
    }
  }
  return rankName;
}

function updateStatusBoard() {
  const level = sessionsCompleted + 1;
  const levelCountEl = document.getElementById('level-count');
  const rankNameEl = document.getElementById('rank-name');
  
  const oldLevel = parseInt(levelCountEl.textContent);
  
  const newRankName = getRankName(level);
  levelCountEl.textContent = level;
  rankNameEl.textContent = newRankName;
  sessionCountDisplay.textContent = sessionsCompleted;
  totalTimeDisplay.textContent = totalWorkMinutes;
  totalBreakDisplay.textContent = totalBreakMinutes;
  document.getElementById('char-img').src = `https://api.dicebear.com/9.x/pixel-art/svg?seed=${encodeURIComponent(newRankName)}`;  
  
  if (oldLevel > 0 && oldLevel < level) {
    // Level Up Animation
    const levelDisplayEl = document.querySelector('.level-display');
    const charImgEl = document.getElementById('char-img');
    
    levelDisplayEl.classList.remove('level-up-anim');
    charImgEl.classList.remove('level-up-anim');
    void levelDisplayEl.offsetWidth; // trigger reflow
    void charImgEl.offsetWidth;
    
    levelDisplayEl.classList.add('level-up-anim');
    charImgEl.classList.add('level-up-anim');
    
    playLevelUpSound();
  }
}

function init() {
  updateStatusBoard();
  speechBubble.textContent = "さあ、冒険に出発だ！準備できたらスタートを押してね！";
  
  // Set default initial state without resetting session
  resetTimer();
  setupEventListeners();
}

function updateSpeechBubble() {
  const phrases = isWorkMode ? workPhrases : breakPhrases;
  const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)];
  speechBubble.textContent = randomPhrase;
}

// Audio Context Setup for Beep Sound
let audioCtx = null;
function playBeep() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  
  // 3回ループ（チチチッ、チチチッ、チチチッ）
  for (let loop = 0; loop < 3; loop++) {
    const loopOffset = loop * 1.5; // 次のピピピッが鳴るまでの時間を少し開ける
    
    // 1回の「ピピピッ」
    for (let i = 0; i < 3; i++) {
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime + loopOffset + i * 0.3);
      
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime + loopOffset + i * 0.3);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + loopOffset + i * 0.3 + 0.15);
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.start(audioCtx.currentTime + loopOffset + i * 0.3);
      oscillator.stop(audioCtx.currentTime + loopOffset + i * 0.3 + 0.2);
    }
  }
}

function playLevelUpSound() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Level Up Fanfare
  const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
  notes.forEach((freq, i) => {
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime + i * 0.15);
    
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime + i * 0.15);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.15 + 0.3);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.start(audioCtx.currentTime + i * 0.15);
    oscillator.stop(audioCtx.currentTime + i * 0.15 + 0.4);
  });
}

// Event Listeners
function setupEventListeners() {
  startBtn.addEventListener('click', startTimer);
  pauseBtn.addEventListener('click', pauseTimer);
  resetBtn.addEventListener('click', resetTimer);

  workBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      // Don't allow changing time while running
      if (isRunning && isWorkMode) return;
      
      workBtns.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      selectedWorkTime = parseInt(e.target.dataset.time);
      
      if (isWorkMode && !isRunning) resetTimer();
    });
  });

  breakBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (isRunning && !isWorkMode) return;
      
      breakBtns.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      selectedBreakTime = parseInt(e.target.dataset.time);
      
      if (!isWorkMode && !isRunning) resetTimer();
    });
  });
}

function updateDisplay() {
  const minutes = Math.floor(timeLeftText / 60);
  const seconds = timeLeftText % 60;
  timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  
  // Update progress ring
  const totalSeconds = (isWorkMode ? selectedWorkTime : selectedBreakTime) * 60;
  const progress = timeLeftText / totalSeconds;
  
  // 691 is the circumference of the circle (2 * pi * r = 2 * 3.14 * 110)
  const offset = 691 - (progress * 691);
  progressCircle.style.strokeDashoffset = offset;
  
  // Calculate max HP based on the selected work time (1 minute = 10 HP)
  const maxHp = selectedWorkTime * 10;
  
  // Update HP Bar
  let currentHp = maxHp;
  if (!isRunning && timeLeftText === totalSeconds) {
    currentHp = isWorkMode ? maxHp : 0;
  } else {
    // In work mode, HP drains (progress goes 1 to 0)
    // In break mode, HP recovers (progress goes 1 to 0, so 1 - progress goes 0 to 1)
    currentHp = isWorkMode ? Math.floor(progress * maxHp) : Math.floor((1 - progress) * maxHp);
  }
  
  // Clamp HP
  currentHp = Math.max(0, Math.min(maxHp, currentHp));
  
  // Bar width is still a percentage
  const hpPercent = (currentHp / maxHp) * 100;
  hpBarFill.style.width = `${hpPercent}%`;
  hpText.textContent = `${currentHp}/${maxHp}`;
  
  if (hpPercent <= 20) {
    hpBarFill.classList.add('low');
  } else {
    hpBarFill.classList.remove('low');
  }
}

function startTimer() {
  // Ensure AudioContext starts correctly upon user gesture
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  if (isRunning) return;
  isRunning = true;
  
  updateSpeechBubble();
  
  startBtn.classList.add('hidden');
  pauseBtn.classList.remove('hidden');
  
  timerInterval = setInterval(() => {
    timeLeftText--;
    updateDisplay();
    
    if (timeLeftText <= 0) {
      clearInterval(timerInterval);
      timerFinished();
    }
  }, 1000);
}

function pauseTimer() {
  if (!isRunning) return;
  isRunning = false;
  clearInterval(timerInterval);
  
  pauseBtn.classList.add('hidden');
  startBtn.classList.remove('hidden');
}

function resetTimer() {
  pauseTimer();
  timeLeftText = (isWorkMode ? selectedWorkTime : selectedBreakTime) * 60;
  updateDisplay();
}

function timerFinished() {
  playBeep();
  checkNewDay(); // Ensure stats wrap over fine if tab was left open overnight
  
  if (isWorkMode) {
    // Finished Work -> Go to Break
    sessionsCompleted++;
    totalWorkMinutes += selectedWorkTime;
    
    localStorage.setItem('timer_sessions', sessionsCompleted);
    localStorage.setItem('timer_total_minutes', totalWorkMinutes);
    updateStatusBoard();
    
    isWorkMode = false;
    document.body.classList.add('break-mode');
    modeDisplay.textContent = 'やすみ！';
    timeLeftText = selectedBreakTime * 60;
    speechBubble.textContent = "やったな！次は休み時間だ！";
  } else {
    // Finished Break -> Go to Work
    totalBreakMinutes += selectedBreakTime;
    localStorage.setItem('timer_total_break', totalBreakMinutes);
    updateStatusBoard();
    
    isWorkMode = true;
    document.body.classList.remove('break-mode');
    modeDisplay.textContent = 'しゅうちゅう！';
    timeLeftText = selectedWorkTime * 60;
    speechBubble.textContent = "HP全回復！次のバトルに行こう！";
  }
  
  updateDisplay();
  
  // Stop after finishing one mode, user needs to click start again for the next mode
  isRunning = false;
  pauseBtn.classList.add('hidden');
  startBtn.classList.remove('hidden');
}

// Start app
init();
