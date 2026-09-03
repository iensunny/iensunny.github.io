import { QUESTIONS, REFLECTIONS, GRATITUDES } from './questions.js?v=5';

const BOT_API_URL = 'https://questions-365-bot.iensunny-365.workers.dev';
const BOT_LINK = 'https://t.me/qqwestionsBot';
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const localDayKey = (value = new Date()) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;

const getPeriod = (hour) =>
  hour >= 5 && hour < 11
    ? 'morning'
    : hour >= 11 && hour < 17
      ? 'day'
      : hour >= 17 && hour < 22
        ? 'evening'
        : 'night';

const previewPeriod = () => {
  if (!['localhost', '127.0.0.1'].includes(location.hostname)) return null;
  const value = new URLSearchParams(location.search).get('theme');
  return value === 'morning' || value === 'day' || value === 'evening' || value === 'night'
    ? value
    : null;
};

function track(event, properties = {}) {
  const item = { event, properties, at: new Date().toISOString() };
  try {
    const items = JSON.parse(localStorage.getItem('365:analytics') || '[]');
    localStorage.setItem('365:analytics', JSON.stringify([...items.slice(-99), item]));
  } catch {}
  window.dispatchEvent(new CustomEvent('365:analytics', { detail: item }));
  const initData = window.Telegram?.WebApp?.initData;
  if (BOT_API_URL && initData && event !== 'mini_app_open') {
    fetch(`${BOT_API_URL}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event, source: properties.source, initData }),
      keepalive: true,
    }).catch(() => {});
  }
}

function persistValue(key, value) {
  localStorage.setItem(key, value);
  const tg = window.Telegram?.WebApp;
  if (tg?.isVersionAtLeast?.('6.9')) {
    try {
      tg.CloudStorage?.setItem(key, value, () => {});
    } catch {}
  }
}

function loadAnswers(prefix) {
  const entries = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key?.startsWith(prefix + 'answer-')) continue;
    try {
      const value = JSON.parse(localStorage.getItem(key) || '{}');
      if (value.question && value.answer) {
        entries.push({ date: key.slice((prefix + 'answer-').length), ...value });
      }
    } catch {}
  }
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' '),
    lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? line + ' ' + word : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const tg = window.Telegram?.WebApp;
const now = new Date();
const uid = String(tg?.initDataUnsafe?.user?.id ?? 'guest');
const prefix = `365:v2:${uid}:`;
const today = localDayKey(now);

let period = previewPeriod() ?? getPeriod(now.getHours());
let answer = '';
let saved = localStorage.getItem(prefix + 'answered-' + today) === '1';
let progress = Math.min(Number(localStorage.getItem(prefix + 'answered-count') || 0), 365);
if (!Number.isFinite(progress)) progress = 0;
let index = Math.min(saved ? Math.max(progress - 1, 0) : progress, QUESTIONS.length - 1);
let notifyTime = localStorage.getItem(prefix + 'notify-time') || '09:00';
let view = 'home';
let history = loadAnswers(prefix);
let question = QUESTIONS[index];

const app = $('#app');
const answerEl = $('#answer');
const noticeEl = $('#toast');

function showNotice(text, ms = 2800) {
  noticeEl.textContent = text.startsWith('✓') ? text : '✓ ' + text;
  noticeEl.hidden = false;
  clearTimeout(showNotice._t);
  showNotice._t = setTimeout(() => (noticeEl.hidden = true), ms);
}

function applyPeriod(next) {
  period = next;
  app.className = `app-shell theme-${period}`;
  const preview = $('#postcard-preview');
  if (preview) preview.className = `postcard-preview theme-${period}`;
  if (tg?.isVersionAtLeast?.('6.1')) {
    try {
      tg.setHeaderColor?.(period === 'night' ? '#0b1722' : '#f4f0e8');
      tg.setBackgroundColor?.(period === 'night' ? '#0b1722' : '#f4f0e8');
    } catch {}
  }
}

function renderAnswers() {
  history = loadAnswers(prefix);
  $('#answers-count').textContent = history.length + ' сохранено';
  const list = $('#answers-list');
  const empty = $('#answers-empty');
  list.innerHTML = '';
  if (!history.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  for (const item of history) {
    const article = document.createElement('article');
    article.className = 'answer-entry';
    const when = new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(item.date + 'T12:00:00'));
    article.innerHTML = `<time datetime="${item.date}"></time><h2></h2><p></p>`;
    article.querySelector('time').textContent = when;
    article.querySelector('h2').textContent = item.question;
    article.querySelector('p').textContent = item.answer;
    list.appendChild(article);
  }
}

function setView(next) {
  view = next;
  $('#home-view').hidden = next !== 'home';
  $('#answers-view').hidden = next !== 'answers';
  $('#nav-home').classList.toggle('active', next === 'home');
  $('#nav-answers').classList.toggle('active', next === 'answers');
  if (next === 'answers') {
    renderAnswers();
    track('answers_opened');
  } else {
    track('navigation', { view: 'home' });
  }
}

function render() {
  question = QUESTIONS[index];
  const pct = progress === 0 ? '0' : ((progress / 365) * 100).toFixed(progress < 37 ? 1 : 0);
  $('#progress-label').textContent = progress + ' / 365 вопросов';
  $('#percent').textContent = pct + '%';
  $('#bar').style.width = (progress / 365) * 100 + '%';
  $('#number').textContent = 'Вопрос ' + Math.min(index + 1, 365) + ' из 365';
  $('#question').textContent = question;
  $('#postcard-question').textContent = question;
  $('#postcard-meta').textContent = '365: к себе · вопрос ' + Math.min(index + 1, 365) + ' из 365';
  $('#slow-down').hidden = saved;
  $('#answer-wrap').hidden = saved;
  $('#saved').hidden = !saved;
  if (saved) {
    $('#gratitude').textContent = GRATITUDES[index];
    $('#reflection').textContent = REFLECTIONS[index];
    $('#submit-label').textContent = 'Посмотреть в истории';
    $('#submit').disabled = false;
  } else {
    $('#submit-label').textContent = 'Ответить';
    $('#submit').disabled = !answer.trim();
  }
}

function submit() {
  const text = answer.trim();
  if (!text || saved) return;
  const next = Math.min(progress + 1, 365);
  persistValue(prefix + 'answered-count', String(next));
  persistValue(prefix + 'answered-' + today, '1');
  persistValue(prefix + 'answer-' + today, JSON.stringify({ question, answer: text }));
  progress = next;
  saved = true;
  history = loadAnswers(prefix);
  render();
  track(progress === 1 ? 'first_answer' : 'repeat_answer', { question_id: index });
  try {
    tg?.sendData(
      JSON.stringify({
        type: 'daily_answer',
        question_id: index,
        question,
        answer: text,
      }),
    );
    tg?.HapticFeedback?.notificationOccurred('success');
  } catch {}
}

function openSettings() {
  $('#notify-time').value = notifyTime;
  $('#settings-modal').hidden = false;
  selectPreset();
}

function selectPreset() {
  $$('.presets button').forEach((b) => {
    b.classList.toggle('selected', b.textContent === $('#notify-time').value);
  });
}

function saveSettings() {
  notifyTime = $('#notify-time').value;
  persistValue(prefix + 'notify-time', notifyTime);
  $('#settings-modal').hidden = true;
  showNotice('Вопрос будет приходить в ' + notifyTime);
  try {
    tg?.sendData(
      JSON.stringify({
        type: 'notification_settings',
        time: notifyTime,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    );
  } catch {}
  track('notification_time_changed', { time: notifyTime });
}

async function sharePostcard() {
  track('share_clicked', { question_id: index });
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const palettes = {
    morning: ['#fff8df', '#edf2d8', '#547b35'],
    day: ['#f3f4e9', '#dfead7', '#3f742f'],
    evening: ['#fff0df', '#efc3a5', '#a64d28'],
    night: ['#111f2c', '#213649', '#a8c78a'],
  };
  const colors = palettes[period];
  const gradient = ctx.createLinearGradient(0, 0, 1080, 1920);
  gradient.addColorStop(0, colors[0]);
  gradient.addColorStop(1, colors[1]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1080, 1920);
  ctx.fillStyle = period === 'night' ? 'rgba(9,22,34,.42)' : 'rgba(255,255,255,.46)';
  ctx.beginPath();
  ctx.roundRect(74, 350, 932, 1240, 54);
  ctx.fill();
  ctx.strokeStyle =
    period === 'night'
      ? 'rgba(220,235,240,.18)'
      : period === 'evening'
        ? 'rgba(166,77,40,.18)'
        : 'rgba(72,92,56,.13)';
  ctx.lineWidth = 2;
  ctx.stroke();
  const ink =
    period === 'night' ? '#f5f1e8' : period === 'evening' ? '#2a1810' : '#1e251a';
  const muted =
    period === 'night' ? '#cbd5d8' : period === 'evening' ? '#7a4a32' : '#53604c';
  const footer =
    period === 'night' ? '#dbe5e7' : period === 'evening' ? '#3a2014' : '#35402f';
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.font = '400 154px Georgia';
  ctx.fillText('365', 540, 220);
  ctx.font = '500 36px Arial';
  ctx.fillText('к себе', 540, 278);
  ctx.fillStyle = colors[2];
  ctx.font = '700 30px Arial';
  ctx.fillText('ВОПРОС ДНЯ', 540, 490);
  ctx.fillStyle = ink;
  ctx.font = `500 ${question.length > 105 ? 58 : question.length > 70 ? 66 : 76}px Georgia`;
  const lines = wrapText(ctx, question, 830);
  const lineHeight = question.length > 105 ? 78 : 92;
  let y = 925 - ((lines.length - 1) * lineHeight) / 2;
  for (const line of lines) {
    ctx.fillText(line, 540, y);
    y += lineHeight;
  }
  ctx.strokeStyle = colors[2];
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(320, 1450);
  ctx.lineTo(760, 1450);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = muted;
  ctx.font = '400 29px Arial';
  ctx.fillText('Один вопрос в день, чтобы лучше понимать себя', 540, 1518);
  ctx.fillText('и сохранять внутреннюю устойчивость', 540, 1563);
  ctx.fillStyle = footer;
  ctx.font = '600 27px Arial';
  ctx.fillText('365: К СЕБЕ  •  ВОПРОС ' + Math.min(index + 1, 365) + ' ИЗ 365', 540, 1780);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return;
  const file = new File([blob], '365-vopros-dnya.png', { type: 'image/png' });
  const deepLink = `${BOT_LINK}?start=share_${uid}_${today.replaceAll('-', '')}`;
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        title: '365: к себе',
        text: `Вопрос дня от «365: к себе»\n${deepLink}`,
        files: [file],
      });
      track('share_completed', { method: 'native' });
      $('#share-modal').hidden = true;
      return;
    }
  } catch (error) {
    if (error.name === 'AbortError') return;
  }
  download(blob, file.name);
  showNotice('Открытка сохранена — её можно отправить в Telegram', 3200);
  $('#share-modal').hidden = true;
}

// --- boot ---
try {
  tg?.ready?.();
  tg?.expand?.();
  if (tg?.isVersionAtLeast?.('8.0')) tg?.requestFullscreen?.();
} catch {}
applyPeriod(period);
render();

if (BOT_API_URL && tg?.initData) {
  fetch(`${BOT_API_URL}/daily-question`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      initData: tg.initData,
      source: tg.initDataUnsafe?.start_param || 'direct',
    }),
  })
    .then((response) => {
      if (!response.ok) throw new Error('daily question unavailable');
      return response.json();
    })
    .then((data) => {
      if (data.complete || !Number.isInteger(data.questionId)) return;
      index = data.questionId;
      progress = Math.min(Number(data.progress) || 0, 365);
      saved = Boolean(data.answeredToday);
      if (Array.isArray(data.history) && data.history.length) {
        // Prefer server history when available, but keep local shape
        history = data.history;
      }
      render();
    })
    .catch(() => {
      // Локальный вопрос уже есть — без toast, чтобы не пугать при 401/офлайне
    });
}

if (tg?.isVersionAtLeast?.('6.9')) {
  try {
    tg.CloudStorage?.getItems(
      [prefix + 'answered-count', prefix + 'notify-time', prefix + 'answered-' + today],
      (_error, values) => {
        if (!values) return;
        const cloudCount = Number(values[prefix + 'answered-count'] ?? '0');
        const cloudAnswered = values[prefix + 'answered-' + today] === '1';
        if (Number.isFinite(cloudCount)) {
          const safe = Math.min(cloudCount, 365);
          progress = safe;
          index = Math.min(cloudAnswered ? Math.max(safe - 1, 0) : safe, QUESTIONS.length - 1);
        }
        if (values[prefix + 'notify-time']) notifyTime = values[prefix + 'notify-time'];
        saved = cloudAnswered;
        render();
      },
    );
  } catch {}
}

track('mini_app_open', { source: tg?.initDataUnsafe?.start_param || 'direct' });

const viewport = window.visualViewport;
let baseAppHeight = Math.round(tg?.viewportStableHeight || window.innerHeight);

function syncViewport() {
  const visual = Math.round(viewport?.height || window.innerHeight);
  const stable = Math.round(tg?.viewportStableHeight || visual);
  const focused = document.activeElement === answerEl;
  if (!focused) {
    baseAppHeight = Math.max(baseAppHeight, stable, visual);
  }
  // Без клавиатуры — стабильная высота; с клавиатурой — только уменьшаем, не раздуваем страницу
  const next = focused ? Math.min(baseAppHeight, visual) : baseAppHeight;
  document.documentElement.style.setProperty('--app-height', `${next}px`);
}

function scrollAnswerIntoView() {
  if (document.activeElement !== answerEl) return;
  const wrap = $('#answer-wrap');
  const submitBtn = $('#submit');
  wrap?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  app.scrollBy({ top: 140, behavior: 'smooth' });
  setTimeout(() => {
    submitBtn?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    app.scrollBy({ top: 80, behavior: 'smooth' });
  }, 220);
}

syncViewport();
viewport?.addEventListener('resize', () => {
  syncViewport();
  if (document.activeElement === answerEl) setTimeout(scrollAnswerIntoView, 80);
});
viewport?.addEventListener('scroll', syncViewport);
window.addEventListener('resize', syncViewport);
setInterval(() => applyPeriod(previewPeriod() ?? getPeriod(new Date().getHours())), 60000);

answerEl.addEventListener('input', (e) => {
  answer = e.target.value;
  if (!saved) $('#submit').disabled = !answer.trim();
});
answerEl.addEventListener('focus', () => {
  syncViewport();
  setTimeout(scrollAnswerIntoView, 120);
  setTimeout(scrollAnswerIntoView, 380);
  setTimeout(scrollAnswerIntoView, 700);
});
answerEl.addEventListener('blur', () => setTimeout(syncViewport, 120));

$('#submit').addEventListener('click', () => {
  if (saved) {
    setView('answers');
    track('answers_opened', { source: 'saved_confirmation' });
    return;
  }
  submit();
});

$('#nav-settings').onclick = openSettings;
$('#nav-home').onclick = () => setView('home');
$('#nav-answers').onclick = () => setView('answers');
$('#back-home').onclick = () => setView('home');
$('#notify-time').oninput = selectPreset;
$$('.presets button').forEach((b) => {
  b.onclick = () => {
    $('#notify-time').value = b.textContent;
    selectPreset();
  };
});
$('#save-time').onclick = saveSettings;
$('#share').onclick = () => {
  applyPeriod(period);
  $('#postcard-question').textContent = question;
  $('#postcard-meta').textContent =
    '365: к себе · вопрос ' + Math.min(index + 1, 365) + ' из 365';
  $('#share-modal').hidden = false;
};
$('#make-card').onclick = () => sharePostcard();
$$('.close').forEach((b) => {
  b.onclick = () => (b.closest('.modal-backdrop').hidden = true);
});
$$('.modal-backdrop').forEach((b) => {
  b.onmousedown = (e) => {
    if (e.target === b) b.hidden = true;
  };
});
