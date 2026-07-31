'use strict';

/* ===================== Storage ===================== */
const DAYS_KEY = 'kanjiApp.days';
const STATS_KEY = 'kanjiApp.stats';
const LENIENCY_KEY = 'kanjiApp.leniency';

const LENIENCY_THRESHOLDS = { mild: 28, normal: 45, spicy: 60 };

function loadLeniency() {
  const v = localStorage.getItem(LENIENCY_KEY);
  return LENIENCY_THRESHOLDS.hasOwnProperty(v) ? v : 'normal';
}
function saveLeniency(v) {
  localStorage.setItem(LENIENCY_KEY, v);
}
function getPassThreshold() {
  return LENIENCY_THRESHOLDS[leniency];
}

function loadDays() {
  try {
    return JSON.parse(localStorage.getItem(DAYS_KEY)) || [];
  } catch (e) {
    return [];
  }
}
function saveDays(days) {
  localStorage.setItem(DAYS_KEY, JSON.stringify(days));
}
function loadStats() {
  try {
    return JSON.parse(localStorage.getItem(STATS_KEY)) || {};
  } catch (e) {
    return {};
  }
}
function saveStats(stats) {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

let days = loadDays();
let stats = loadStats();
let leniency = loadLeniency();

/* ===================== Screen switching ===================== */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}

/* ===================== Home screen ===================== */
function renderSpiceButtons() {
  document.querySelectorAll('.spice-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.level === leniency);
  });
}

function renderHome() {
  renderSpiceButtons();
  const listEl = document.getElementById('day-list');
  if (days.length === 0) {
    listEl.innerHTML = '<div class="empty-msg">まだ漢字が登録されていません。「＋ 新しい日を追加する」から始めよう！</div>';
  } else {
    listEl.innerHTML = days.map(day => {
      const date = new Date(day.createdAt);
      const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
      return `
        <div class="day-card" data-day-id="${day.id}">
          <div class="day-card-top">
            <div class="day-card-label">${escapeHtml(day.label)}</div>
            <div class="day-card-meta">${day.items.length}文字・${dateStr}</div>
          </div>
          <div class="day-card-actions">
            <button class="small-btn day-test-btn">テストする</button>
            <button class="small-btn day-edit-btn">編集</button>
            <button class="small-btn day-delete-btn">削除</button>
          </div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.day-test-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const dayId = e.target.closest('.day-card').dataset.dayId;
        openQuizSetup(dayId);
      });
    });
    listEl.querySelectorAll('.day-edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const dayId = e.target.closest('.day-card').dataset.dayId;
        openAddDay(dayId);
      });
    });
    listEl.querySelectorAll('.day-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const dayId = e.target.closest('.day-card').dataset.dayId;
        const day = days.find(d => d.id === dayId);
        if (confirm(`「${day.label}」を削除しますか？`)) {
          days = days.filter(d => d.id !== dayId);
          saveDays(days);
          renderHome();
        }
      });
    });
  }

  const weakList = computeWeakList();
  const weakCard = document.getElementById('weak-card');
  if (weakList.length > 0) {
    weakCard.classList.remove('hidden');
    document.getElementById('weak-count').textContent = weakList.length;
  } else {
    weakCard.classList.add('hidden');
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function allItems() {
  const items = [];
  days.forEach(day => {
    day.items.forEach(it => items.push({ ...it, dayLabel: day.label }));
  });
  return items;
}

/* ===================== Add / Edit day screen ===================== */
let pendingItems = [];
let editingDayId = null;

function openAddDay(dayId) {
  editingDayId = dayId || null;
  const day = dayId ? days.find(d => d.id === dayId) : null;

  document.getElementById('add-day-title').textContent = day ? '日を編集' : '新しい日を追加';
  document.getElementById('day-label-input').value = day ? day.label : `${days.length + 1}日目`;

  pendingItems = day ? day.items.map(it => ({ ...it })) : [];
  renderPendingList();

  document.getElementById('single-kanji-input').value = '';
  document.getElementById('single-reading-input').value = '';
  document.getElementById('single-meaning-input').value = '';
  document.getElementById('day-bulk-input').value = '';

  setInputMode('single');
  showScreen('screen-add-day');
  document.getElementById('single-kanji-input').focus();
}

function setInputMode(mode) {
  const singleArea = document.getElementById('single-input-area');
  const bulkArea = document.getElementById('bulk-input-area');
  const singleBtn = document.getElementById('mode-single-btn');
  const bulkBtn = document.getElementById('mode-bulk-btn');
  if (mode === 'single') {
    singleArea.classList.remove('hidden');
    bulkArea.classList.add('hidden');
    singleBtn.classList.add('active');
    bulkBtn.classList.remove('active');
  } else {
    singleArea.classList.add('hidden');
    bulkArea.classList.remove('hidden');
    singleBtn.classList.remove('active');
    bulkBtn.classList.add('active');
  }
}

const HIRAGANA_ONLY_RE = /^[ぁ-んー]+$/;

/* ===================== 読み方の自動推定 ===================== */
// KANJI_READINGS は kanji-readings-data.js で定義される（常用漢字2136字の代表的な音読み・訓読み）。
function isKanjiChar(ch) {
  const c = ch.codePointAt(0);
  return (c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf);
}

// 熟語なら音読みをつなげ、送りがな付き単漢字なら訓読み+送りがなで読みを推定する。
// 辞書にない字がある場合はnullを返す（推定不可）。100%正確ではないため、あくまで下書きとして扱う。
function guessReading(word) {
  if (typeof KANJI_READINGS === 'undefined') return null;
  const chars = Array.from(word);
  let splitIdx = chars.length;
  for (let i = 0; i < chars.length; i++) {
    if (!isKanjiChar(chars[i])) { splitIdx = i; break; }
  }
  const kanjiPart = chars.slice(0, splitIdx);
  const trailingKana = chars.slice(splitIdx).join('');
  if (kanjiPart.length === 0) return null;

  if (trailingKana) {
    let prefix = '';
    for (let i = 0; i < kanjiPart.length - 1; i++) {
      const e = KANJI_READINGS[kanjiPart[i]];
      if (!e) return null;
      prefix += e[0] || e[1] || '';
    }
    const last = KANJI_READINGS[kanjiPart[kanjiPart.length - 1]];
    if (!last) return null;
    return prefix + (last[1] || last[0] || '') + trailingKana;
  }

  if (kanjiPart.length === 1) {
    const e = KANJI_READINGS[kanjiPart[0]];
    if (!e) return null;
    return e[1] || e[0] || '';
  }

  let out = '';
  for (const c of kanjiPart) {
    const e = KANJI_READINGS[c];
    if (!e) return null;
    out += e[0] || e[1] || '';
  }
  return out;
}

// 「漢字,よみ,漢字,よみ,...」のように改行なしで交互に並んだ形式かどうかを判定する
function looksLikeAlternatingPairs(cols) {
  if (cols.length < 4 || cols.length % 2 !== 0) return false;
  for (let i = 1; i < cols.length; i += 2) {
    if (cols[i] && !HIRAGANA_ONLY_RE.test(cols[i])) return false;
  }
  return true;
}

// 読みが空欄の場合は自動推定した読みで埋め、guessedフラグを立てて後で見分けられるようにする
function buildItem(kanji, reading, meaning) {
  let guessed = false;
  if (!reading) {
    const g = guessReading(kanji);
    if (g) {
      reading = g;
      guessed = true;
    }
  }
  return { id: uid(), kanji, reading: reading || '', meaning: meaning || '', guessed };
}

function parseLine(line) {
  const raw = line.trim();
  if (!raw) return [];
  const cols = (raw.includes('\t') ? raw.split('\t') : raw.split(/[,、，]/))
    .map(c => c.trim());

  if (looksLikeAlternatingPairs(cols)) {
    const items = [];
    for (let i = 0; i < cols.length; i += 2) {
      const kanji = cols[i];
      if (!kanji) continue;
      items.push(buildItem(kanji, cols[i + 1] || '', ''));
    }
    return items;
  }

  const kanji = cols[0] || '';
  if (!kanji) return [];
  const reading = cols[1] || '';
  const meaning = cols.slice(2).join(',').trim();
  return [buildItem(kanji, reading, meaning)];
}

function parseBulk(text) {
  return text.split('\n').flatMap(parseLine);
}

function renderPendingList() {
  const wrap = document.getElementById('pending-list');
  document.getElementById('pending-count').textContent = pendingItems.length;
  if (pendingItems.length === 0) {
    wrap.innerHTML = '<div class="empty-msg">まだありません</div>';
    return;
  }
  wrap.innerHTML = pendingItems.map((it, i) => {
    const sub = [it.reading, it.meaning].filter(Boolean).join(' / ');
    const suspicious = it.kanji.length > 4 || it.reading.length > 12 || it.meaning.length > 20;
    const mark = suspicious ? '⚠ ' : (it.guessed ? '🔍 ' : '');
    return `
      <div class="pending-item${suspicious ? ' pi-suspicious' : ''}${it.guessed && !suspicious ? ' pi-guessed' : ''}" data-index="${i}">
        <div class="pi-main">
          <span class="pi-kanji">${escapeHtml(it.kanji)}</span>
          <span class="pi-sub">${mark}${escapeHtml(sub)}</span>
        </div>
        <button class="pi-remove" data-index="${i}">✕</button>
      </div>
    `;
  }).join('');
  wrap.querySelectorAll('.pi-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.index, 10);
      pendingItems.splice(idx, 1);
      renderPendingList();
    });
  });
}

function saveDay() {
  const label = document.getElementById('day-label-input').value.trim() || `${days.length + 1}日目`;
  if (pendingItems.length === 0) {
    alert('漢字が1つも登録されていません。');
    return;
  }
  if (editingDayId) {
    const day = days.find(d => d.id === editingDayId);
    day.label = label;
    day.items = pendingItems;
  } else {
    days.push({ id: uid(), label, createdAt: Date.now(), items: pendingItems });
  }
  saveDays(days);
  renderHome();
  showScreen('screen-home');
}

/* ===================== Quiz setup screen ===================== */
function openQuizSetup(presetDayId) {
  const wrap = document.getElementById('setup-day-checks');
  if (days.length === 0) {
    wrap.innerHTML = '<div class="empty-msg">まだ漢字が登録されていません。</div>';
  } else {
    wrap.innerHTML = days.map(day => {
      const checked = presetDayId ? (day.id === presetDayId) : true;
      return `
        <label>
          <input type="checkbox" class="setup-day-check" value="${day.id}" ${checked ? 'checked' : ''}>
          ${escapeHtml(day.label)}（${day.items.length}文字）
        </label>
      `;
    }).join('');
  }
  showScreen('screen-quiz-setup');
}

function startQuizFromSetup() {
  const checked = Array.from(document.querySelectorAll('.setup-day-check:checked')).map(c => c.value);
  if (checked.length === 0) {
    alert('出題する日を1つ以上選んでください。');
    return;
  }
  const items = [];
  days.filter(d => checked.includes(d.id)).forEach(day => {
    day.items.forEach(it => items.push({ ...it, dayLabel: day.label }));
  });
  if (items.length === 0) {
    alert('選んだ日に漢字がありません。');
    return;
  }
  const order = document.querySelector('input[name="quiz-order"]:checked').value;
  const mode = document.querySelector('input[name="quiz-mode"]:checked').value;
  const countVal = document.getElementById('count-select').value;
  const queue = buildQueue(items, order, countVal);
  startQuiz(queue, mode);
}

function buildQueue(items, order, countVal) {
  let list = items.slice();
  if (order === 'random') {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  }
  if (countVal !== 'all') {
    const n = parseInt(countVal, 10);
    if (!isNaN(n)) list = list.slice(0, n);
  }
  return list;
}

/* ===================== Stats / weak kanji ===================== */
function recordAttempt(kanji, correct, score) {
  if (!stats[kanji]) stats[kanji] = { attempts: 0, correct: 0, lastScore: 0, lastAt: 0 };
  stats[kanji].attempts++;
  if (correct) stats[kanji].correct++;
  stats[kanji].lastScore = score;
  stats[kanji].lastAt = Date.now();
  saveStats(stats);
}

function computeWeakList() {
  return Object.entries(stats)
    .filter(([k, s]) => s.attempts >= 2 && (s.correct / s.attempts) < 0.6)
    .map(([k]) => k);
}

function startWeakQuiz() {
  const weakKanji = computeWeakList();
  const lookup = allItems();
  const items = [];
  weakKanji.forEach(k => {
    const found = lookup.find(it => it.kanji === k);
    if (found) items.push(found);
  });
  if (items.length === 0) {
    alert('にがてな漢字がありません。');
    return;
  }
  startQuiz(buildQueue(items, 'random', 'all'), 'test');
}

/* ===================== Quiz engine ===================== */
let quizQueue = [];
let quizMode = 'test';
let quizIndex = 0;
let quizResults = [];

let inkCanvas = null;
let inkCtx = null;
let visCanvas = null;
let visCtx = null;
let boxRects = [];
let drawing = false;
let judged = false;

function startQuiz(queue, mode) {
  if (!queue || queue.length === 0) {
    alert('出題できる漢字がありません。');
    return;
  }
  quizQueue = queue;
  quizMode = mode;
  quizIndex = 0;
  quizResults = new Array(queue.length).fill(null);
  showScreen('screen-quiz');
  renderQuestion();
}

function currentItem() {
  return quizQueue[quizIndex];
}

function renderQuestion() {
  judged = false;
  document.getElementById('quiz-progress').textContent = `問題 ${quizIndex + 1}/${quizQueue.length}`;
  document.getElementById('judge-result').classList.add('hidden');
  document.getElementById('judge-btn').classList.remove('hidden');
  document.getElementById('clear-canvas-btn').classList.remove('hidden');

  const item = currentItem();
  const promptEl = document.getElementById('quiz-prompt');
  const submetaEl = document.getElementById('quiz-submeta');

  if (quizMode === 'trace') {
    promptEl.textContent = 'お手本をなぞって書こう';
    submetaEl.textContent = [item.reading, item.meaning].filter(Boolean).join(' ・ ');
  } else {
    if (item.reading) {
      promptEl.textContent = item.reading;
      submetaEl.textContent = item.meaning || 'この読みの漢字を書こう';
    } else if (item.meaning) {
      promptEl.textContent = item.meaning;
      submetaEl.textContent = 'この意味の漢字を書こう';
    } else {
      promptEl.textContent = 'この漢字を書こう';
      submetaEl.textContent = '（このカードには読み・意味の登録がありません）';
    }
  }

  setupCanvas(item.kanji, quizMode === 'trace');
}

function setupCanvas(targetText, showGuideGlyph) {
  const chars = Array.from(targetText);
  const n = Math.max(chars.length, 1);
  const maxPerRow = 2;
  const perRow = Math.min(n, maxPerRow);
  const rows = Math.ceil(n / maxPerRow);
  const gap = 10;

  const wrapWidth = Math.min(document.getElementById('quiz-canvas-wrap').clientWidth || 480, 480);
  let boxSize = Math.floor((wrapWidth - gap * (perRow - 1)) / perRow);
  boxSize = Math.max(100, Math.min(280, boxSize));

  const width = perRow * boxSize + (perRow - 1) * gap;
  const height = rows * boxSize + (rows - 1) * gap;

  visCanvas = document.getElementById('quiz-canvas');
  visCanvas.width = width;
  visCanvas.height = height;
  visCanvas.style.width = width + 'px';
  visCanvas.style.height = height + 'px';
  visCtx = visCanvas.getContext('2d');

  inkCanvas = document.createElement('canvas');
  inkCanvas.width = width;
  inkCanvas.height = height;
  inkCtx = inkCanvas.getContext('2d');

  boxRects = chars.map((c, i) => {
    const row = Math.floor(i / maxPerRow);
    const col = i % maxPerRow;
    return {
      x: col * (boxSize + gap),
      y: row * (boxSize + gap),
      w: boxSize,
      h: boxSize,
      char: c
    };
  });

  drawGuide(showGuideGlyph);
  attachCanvasHandlers();
}

// 明朝体は線が細く、実際のペンの太さより細いためなぞってもズレて減点されやすい。
// 同じ文字を少しずつ位置をずらして重ね書きすることで、見た目にも採点用にも太くする。
function fillTextBold(ctx, text, cx, cy, boldness) {
  for (let dx = -boldness; dx <= boldness; dx++) {
    for (let dy = -boldness; dy <= boldness; dy++) {
      ctx.fillText(text, cx + dx, cy + dy);
    }
  }
}

function drawGuide(showGuideGlyph) {
  visCtx.clearRect(0, 0, visCanvas.width, visCanvas.height);
  visCtx.fillStyle = '#ffffff';
  visCtx.fillRect(0, 0, visCanvas.width, visCanvas.height);

  boxRects.forEach(r => {
    visCtx.strokeStyle = '#d0d0d0';
    visCtx.lineWidth = 2;
    visCtx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);

    visCtx.strokeStyle = '#e8e8e8';
    visCtx.setLineDash([4, 4]);
    visCtx.beginPath();
    visCtx.moveTo(r.x + r.w / 2, r.y);
    visCtx.lineTo(r.x + r.w / 2, r.y + r.h);
    visCtx.moveTo(r.x, r.y + r.h / 2);
    visCtx.lineTo(r.x + r.w, r.y + r.h / 2);
    visCtx.stroke();
    visCtx.setLineDash([]);

    if (showGuideGlyph) {
      visCtx.fillStyle = 'rgba(0,0,0,0.22)';
      visCtx.font = `${Math.floor(r.h * 0.72)}px "Hiragino Mincho ProN", "Yu Mincho", "MS Mincho", serif`;
      visCtx.textAlign = 'center';
      visCtx.textBaseline = 'middle';
      const boldness = Math.max(2, Math.round(r.h * 0.025));
      fillTextBold(visCtx, r.char, r.x + r.w / 2, r.y + r.h / 2 + r.h * 0.05, boldness);
    }
  });
}

function attachCanvasHandlers() {
  visCanvas.onpointerdown = (e) => {
    drawing = true;
    visCanvas.setPointerCapture(e.pointerId);
    const pos = getPos(e);
    beginStroke(pos);
  };
  visCanvas.onpointermove = (e) => {
    if (!drawing) return;
    const pos = getPos(e);
    drawStroke(pos);
  };
  const end = () => { drawing = false; };
  visCanvas.onpointerup = end;
  visCanvas.onpointercancel = end;
  visCanvas.onpointerleave = end;
}

function getPos(e) {
  const rect = visCanvas.getBoundingClientRect();
  const scaleX = visCanvas.width / rect.width;
  const scaleY = visCanvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  };
}

let lastPos = null;
function beginStroke(pos) {
  lastPos = pos;
  const lw = Math.max(10, (boxRects[0] ? boxRects[0].w : 120) * 0.11);
  [visCtx, inkCtx].forEach(ctx => {
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  });
}
function drawStroke(pos) {
  [visCtx, inkCtx].forEach(ctx => {
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  });
  lastPos = pos;
}

function clearCanvas() {
  drawGuide(quizMode === 'trace');
  inkCtx.clearRect(0, 0, inkCanvas.width, inkCanvas.height);
}

/* ---- Scoring ---- */
function scoreBox(rect) {
  const w = rect.w, h = rect.h;

  const refCanvas = document.createElement('canvas');
  refCanvas.width = w;
  refCanvas.height = h;
  const refCtx = refCanvas.getContext('2d');
  refCtx.fillStyle = '#fff';
  refCtx.fillRect(0, 0, w, h);
  refCtx.fillStyle = '#000';
  refCtx.font = `${Math.floor(h * 0.72)}px "Hiragino Mincho ProN", "Yu Mincho", "MS Mincho", serif`;
  refCtx.textAlign = 'center';
  refCtx.textBaseline = 'middle';
  // 採点用の正解の形は、実際のペンの太さに近づけて少し太らせる（細い明朝体のままだと
  // 正確になぞっても線がはみ出したと判定され減点されてしまうため）。
  const refBoldness = Math.max(4, Math.round(h * 0.05));
  fillTextBold(refCtx, rect.char, w / 2, h / 2 + h * 0.05, refBoldness);
  const refData = refCtx.getImageData(0, 0, w, h).data;

  const inkData = inkCtx.getImageData(rect.x, rect.y, w, h).data;

  const grid = Math.max(14, Math.min(26, Math.floor(w / 8)));
  const cellW = w / grid;
  const cellH = h / grid;
  const threshold = 0.2;

  let inter = 0, refCount = 0, inkCount = 0;

  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      const x0 = Math.floor(gx * cellW);
      const y0 = Math.floor(gy * cellH);
      const x1 = Math.floor((gx + 1) * cellW);
      const y1 = Math.floor((gy + 1) * cellH);

      let refSum = 0, inkSum = 0, count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const idx = (y * w + x) * 4;
          const refDark = (255 - refData[idx]) / 255;
          const inkAlpha = inkData[idx + 3] / 255;
          refSum += refDark;
          inkSum += inkAlpha;
          count++;
        }
      }
      if (count === 0) continue;
      const refActive = (refSum / count) > threshold;
      const inkActive = (inkSum / count) > threshold;
      if (refActive) refCount++;
      if (inkActive) inkCount++;
      if (refActive && inkActive) inter++;
    }
  }

  const precision = inkCount > 0 ? inter / inkCount : 0;
  const recall = refCount > 0 ? inter / refCount : 0;
  const f1 = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  // 塗りつぶすように広い面積を書くと重なり具合だけで高得点になってしまうため、
  // マス目に対するインクの占有率が高すぎる場合はスコアを減点する（殴り書き対策）。
  const totalCells = grid * grid;
  const inkCoverage = totalCells > 0 ? inkCount / totalCells : 0;
  const coveragePenalty = inkCoverage <= 0.5 ? 1 : Math.max(0, 1 - (inkCoverage - 0.5) / 0.35);

  // 手書きは多少ずれても形が合っていれば甘めに評価する（判定をマイルドにする補正カーブ）。
  // 指数0.7で中間帯を持ち上げる: 例) 0.36→0.49, 0.5→0.62, 0.7→0.78。
  const raw = f1 * coveragePenalty;
  const eased = Math.pow(raw, 0.7);
  return Math.round(eased * 100);
}

function judgeQuestion() {
  if (judged) return;
  judged = true;

  const scores = boxRects.map(scoreBox);
  const overall = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const correct = overall >= getPassThreshold();

  const item = currentItem();
  quizResults[quizIndex] = { score: overall, correct };
  recordAttempt(item.kanji, correct, overall);

  const badge = document.getElementById('judge-badge');
  badge.textContent = correct ? '⭕ せいかい！' : '❌ おしい！';
  badge.className = 'judge-badge ' + (correct ? 'correct' : 'incorrect');

  document.getElementById('judge-score').textContent = `一致度：${overall}点`;

  const answerParts = [`正解：${item.kanji}`];
  if (item.reading) answerParts.push(`（${item.reading}）`);
  if (item.meaning) answerParts.push(item.meaning);
  document.getElementById('judge-answer').textContent = answerParts.join(' ');

  document.getElementById('judge-result').classList.remove('hidden');
  document.getElementById('judge-btn').classList.add('hidden');
  document.getElementById('clear-canvas-btn').classList.add('hidden');

  const nextBtn = document.getElementById('next-question-btn');
  nextBtn.textContent = (quizIndex + 1 < quizQueue.length) ? '次へ' : '結果を見る';
}

function retryQuestion() {
  clearCanvas();
  judged = false;
  document.getElementById('judge-result').classList.add('hidden');
  document.getElementById('judge-btn').classList.remove('hidden');
  document.getElementById('clear-canvas-btn').classList.remove('hidden');
}

function nextQuestion() {
  quizIndex++;
  if (quizIndex >= quizQueue.length) {
    finishQuiz();
  } else {
    renderQuestion();
  }
}

function endQuizEarly() {
  const answeredCount = judged ? quizIndex + 1 : quizIndex;
  if (answeredCount === 0) {
    if (confirm('まだ1問も答えていません。テストをやめてホームに戻りますか？')) {
      renderHome();
      showScreen('screen-home');
    }
    return;
  }
  if (!confirm(`ここまで（${answeredCount}問）で終了して結果を見ますか？`)) return;
  quizQueue = quizQueue.slice(0, answeredCount);
  quizResults = quizResults.slice(0, answeredCount);
  finishQuiz();
}

function finishQuiz() {
  const total = quizQueue.length;
  const correctCount = quizResults.filter(r => r && r.correct).length;
  const pct = total > 0 ? Math.round((correctCount / total) * 100) : 0;

  document.getElementById('result-score').textContent = `${correctCount} / ${total} 問正解（${pct}%）`;

  const wrongEl = document.getElementById('result-wrong-list');
  const wrongItems = [];
  quizQueue.forEach((item, i) => {
    const r = quizResults[i];
    if (r && !r.correct) wrongItems.push({ item, r });
  });

  if (wrongItems.length === 0) {
    wrongEl.innerHTML = '<div class="empty-msg">まちがえた漢字はありません！すごい！</div>';
    document.getElementById('retry-wrong-btn').classList.add('hidden');
  } else {
    document.getElementById('retry-wrong-btn').classList.remove('hidden');
    wrongEl.innerHTML = wrongItems.map(({ item, r }) => `
      <div class="wrong-item">
        <span><span class="wi-kanji">${escapeHtml(item.kanji)}</span> ${escapeHtml(item.reading || '')}</span>
        <span class="wi-score">${r.score}点</span>
      </div>
    `).join('');
  }

  window._lastWrongItems = wrongItems.map(w => w.item);

  renderHome();
  showScreen('screen-result');
}

function retryWrongOnly() {
  const items = window._lastWrongItems || [];
  if (items.length === 0) return;
  startQuiz(buildQueue(items, 'sequential', 'all'), 'test');
}

/* ===================== Event wiring ===================== */
function setupEventListeners() {
  document.getElementById('home-title-btn').addEventListener('click', () => {
    renderHome();
    showScreen('screen-home');
  });

  document.getElementById('quick-random-btn').addEventListener('click', () => {
    const items = allItems();
    if (items.length === 0) {
      alert('まだ漢字が登録されていません。');
      return;
    }
    startQuiz(buildQueue(items, 'random', '20'), 'test');
  });
  document.getElementById('goto-setup-btn').addEventListener('click', openQuizSetup);
  document.getElementById('weak-quiz-btn').addEventListener('click', startWeakQuiz);
  document.getElementById('add-day-btn').addEventListener('click', () => openAddDay(null));

  document.querySelectorAll('.spice-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      leniency = btn.dataset.level;
      saveLeniency(leniency);
      renderSpiceButtons();
    });
  });

  document.getElementById('mode-single-btn').addEventListener('click', () => setInputMode('single'));
  document.getElementById('mode-bulk-btn').addEventListener('click', () => setInputMode('bulk'));

  document.getElementById('single-kanji-input').addEventListener('blur', () => {
    const kanjiEl = document.getElementById('single-kanji-input');
    const readingEl = document.getElementById('single-reading-input');
    const kanji = kanjiEl.value.trim();
    if (kanji && !readingEl.value.trim()) {
      const g = guessReading(kanji);
      if (g) readingEl.value = g;
    }
  });

  document.getElementById('single-add-btn').addEventListener('click', () => {
    const kanji = document.getElementById('single-kanji-input').value.trim();
    if (!kanji) {
      alert('漢字を入力してください。');
      return;
    }
    const reading = document.getElementById('single-reading-input').value.trim();
    const meaning = document.getElementById('single-meaning-input').value.trim();
    pendingItems.push({ id: uid(), kanji, reading, meaning, guessed: false });
    renderPendingList();
    document.getElementById('single-kanji-input').value = '';
    document.getElementById('single-reading-input').value = '';
    document.getElementById('single-meaning-input').value = '';
    document.getElementById('single-kanji-input').focus();
  });

  document.getElementById('bulk-add-btn').addEventListener('click', () => {
    const text = document.getElementById('day-bulk-input').value;
    const parsed = parseBulk(text);
    if (parsed.length === 0) {
      alert('読み取れる漢字がありませんでした。');
      return;
    }
    pendingItems = pendingItems.concat(parsed);
    renderPendingList();
    document.getElementById('day-bulk-input').value = '';
  });

  document.getElementById('save-day-btn').addEventListener('click', saveDay);
  document.getElementById('cancel-day-btn').addEventListener('click', () => showScreen('screen-home'));

  document.getElementById('select-all-days-btn').addEventListener('click', () => {
    document.querySelectorAll('.setup-day-check').forEach(c => c.checked = true);
  });
  document.getElementById('select-none-days-btn').addEventListener('click', () => {
    document.querySelectorAll('.setup-day-check').forEach(c => c.checked = false);
  });
  document.getElementById('start-quiz-btn').addEventListener('click', startQuizFromSetup);
  document.getElementById('cancel-setup-btn').addEventListener('click', () => showScreen('screen-home'));

  document.getElementById('clear-canvas-btn').addEventListener('click', clearCanvas);
  document.getElementById('judge-btn').addEventListener('click', judgeQuestion);
  document.getElementById('retry-question-btn').addEventListener('click', retryQuestion);
  document.getElementById('next-question-btn').addEventListener('click', nextQuestion);
  document.getElementById('end-quiz-btn').addEventListener('click', endQuizEarly);

  document.getElementById('retry-wrong-btn').addEventListener('click', retryWrongOnly);
  document.getElementById('result-home-btn').addEventListener('click', () => {
    renderHome();
    showScreen('screen-home');
  });

  window.addEventListener('resize', () => {
    if (document.getElementById('screen-quiz').classList.contains('active') && currentItem()) {
      setupCanvas(currentItem().kanji, quizMode === 'trace' && !judged);
    }
  });
}

/* ===================== Init ===================== */
function init() {
  renderHome();
  setupEventListeners();
}

init();
