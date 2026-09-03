import { QUESTIONS, REFLECTIONS, GRATITUDES } from './questions.js?v=3';

const BOT_API_URL = 'https://questions-365-bot.iensunny-365.workers.dev';
const BOT_LINK = 'https://t.me/qqwestionsBot';
const $ = (s, root = document) => root.querySelector(s);
const tg = window.Telegram?.WebApp;
const now = new Date();
const localDayKey = (value = now) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
const uid = String(tg?.initDataUnsafe?.user?.id || 'guest');
const prefix = `365:v2:${uid}:`;
const today = localDayKey();

const hour = now.getHours();
const period =
  hour >= 5 && hour < 11
    ? 'morning'
    : hour < 17
      ? 'day'
      : hour < 22
        ? 'evening'
        : 'night';
$('#app').className = `app-shell theme-${period}`;
try {
  tg?.ready?.();
  tg?.expand?.();
  if (tg?.isVersionAtLeast?.('6.1')) {
    tg.setHeaderColor?.(period === 'night' ? '#0b1722' : '#f4f0e8');
    tg.setBackgroundColor?.(period === 'night' ? '#0b1722' : '#f4f0e8');
  }
} catch {}

let progress = Math.min(Number(localStorage.getItem(prefix + 'answered-count') || 0), 365);
let saved = localStorage.getItem(prefix + 'answered-' + today) === '1';
let index = Math.min(saved ? Math.max(progress - 1, 0) : progress, QUESTIONS.length - 1);
let question = QUESTIONS[index];
let view = 'home';

function toast(text) {
  const el = $('#toast');
  el.textContent = '✓ ' + text;
  el.hidden = false;
  setTimeout(() => (el.hidden = true), 3000);
}

function loadAnswers() {
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

function renderAnswers() {
  const history = loadAnswers();
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
    article.innerHTML = `<time datetime="${item.date}">${when}</time><h2></h2><p></p>`;
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
  if (next === 'answers') renderAnswers();
}

function render() {
  const pct = progress ? ((progress / 365) * 100).toFixed(progress < 37 ? 1 : 0) : '0';
  $('#progress-label').textContent = progress + ' / 365 вопросов';
  $('#percent').textContent = pct + '%';
  $('#bar').style.width = (progress / 365) * 100 + '%';
  $('#number').textContent = 'Вопрос ' + (index + 1) + ' из 365';
  $('#question').textContent = question;
  $('#postcard-question').textContent = question;
  $('#postcard-meta').textContent = '365: к себе · вопрос ' + (index + 1) + ' из 365';
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
    $('#submit').disabled = !$('#answer').value.trim();
  }
}

render();

async function syncDailyQuestion() {
  if (!BOT_API_URL || !tg?.initData) return;
  try {
    const response = await fetch(BOT_API_URL + '/daily-question', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        initData: tg.initData,
        source: tg.initDataUnsafe?.start_param || 'direct',
      }),
    });
    if (!response.ok) throw new Error('unavailable');
    const data = await response.json();
    if (data.complete || !Number.isInteger(data.questionId)) return;
    index = data.questionId;
    question = QUESTIONS[index];
    progress = Math.min(Number(data.progress) || 0, 365);
    saved = Boolean(data.answeredToday);
    render();
  } catch {
    toast('Не удалось обновить вопрос. Проверь подключение.');
  }
}
syncDailyQuestion();

$('#answer').addEventListener('input', (e) => {
  if (!saved) $('#submit').disabled = !e.target.value.trim();
});

$('#submit').addEventListener('click', () => {
  if (saved) {
    setView('answers');
    return;
  }
  const answer = $('#answer').value.trim();
  if (!answer) return;
  progress = Math.min(progress + 1, 365);
  saved = true;
  localStorage.setItem(prefix + 'answered-count', String(progress));
  localStorage.setItem(prefix + 'answered-' + today, '1');
  localStorage.setItem(prefix + 'answer-' + today, JSON.stringify({ question, answer }));
  render();
  try {
    tg?.sendData(
      JSON.stringify({
        type: 'daily_answer',
        question_id: index,
        question,
        answer,
      }),
    );
    tg?.HapticFeedback?.notificationOccurred('success');
  } catch {}
});

const settingsModal = $('#settings-modal');
const shareModal = $('#share-modal');
const time = $('#notify-time');
function openSettings() {
  time.value = localStorage.getItem(prefix + 'notify-time') || '09:00';
  settingsModal.hidden = false;
  selectPreset();
}
function selectPreset() {
  document.querySelectorAll('.presets button').forEach((b) => {
    b.classList.toggle('selected', b.textContent === time.value);
  });
}
$('#menu').onclick = $('#nav-settings').onclick = openSettings;
$('#nav-home').onclick = () => setView('home');
$('#nav-answers').onclick = () => setView('answers');
$('#back-home').onclick = () => setView('home');
time.oninput = selectPreset;
document.querySelectorAll('.presets button').forEach((b) => {
  b.onclick = () => {
    time.value = b.textContent;
    selectPreset();
  };
});
$('#save-time').onclick = () => {
  localStorage.setItem(prefix + 'notify-time', time.value);
  settingsModal.hidden = true;
  toast('Вопрос будет приходить в ' + time.value);
  try {
    tg?.sendData(
      JSON.stringify({
        type: 'notification_settings',
        time: time.value,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    );
  } catch {}
};
$('#share').onclick = () => (shareModal.hidden = false);
document.querySelectorAll('.close').forEach((b) => {
  b.onclick = () => (b.closest('.modal-backdrop').hidden = true);
});
document.querySelectorAll('.modal-backdrop').forEach((b) => {
  b.onclick = (e) => {
    if (e.target === b) b.hidden = true;
  };
});

function wrap(ctx, text, max) {
  const words = text.split(' '),
    lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? line + ' ' + word : word;
    if (ctx.measureText(next).width > max && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

$('#make-card').onclick = async () => {
  const c = document.createElement('canvas');
  c.width = 1080;
  c.height = 1920;
  const x = c.getContext('2d');
  const palettes = {
    morning: ['#fff8df', '#edf2d8', '#547b35'],
    day: ['#f3f4e9', '#dfead7', '#3f742f'],
    evening: ['#fff0df', '#efc3a5', '#a64d28'],
    night: ['#111f2c', '#213649', '#a8c78a'],
  };
  const colors = palettes[period];
  const g = x.createLinearGradient(0, 0, 1080, 1920);
  g.addColorStop(0, colors[0]);
  g.addColorStop(1, colors[1]);
  x.fillStyle = g;
  x.fillRect(0, 0, 1080, 1920);
  x.fillStyle = period === 'night' ? 'rgba(9,22,34,.42)' : 'rgba(255,255,255,.46)';
  x.beginPath();
  x.roundRect(74, 350, 932, 1240, 54);
  x.fill();
  x.textAlign = 'center';
  x.fillStyle = period === 'night' ? '#f5f1e8' : '#1e251a';
  x.font = '400 154px Georgia';
  x.fillText('365', 540, 220);
  x.font = '500 36px Arial';
  x.fillText('к себе', 540, 278);
  x.fillStyle = colors[2];
  x.font = '700 30px Arial';
  x.fillText('ВОПРОС ДНЯ', 540, 490);
  x.fillStyle = period === 'night' ? '#f5f1e8' : '#182015';
  x.font = `500 ${question.length > 105 ? 58 : question.length > 70 ? 66 : 76}px Georgia`;
  const lineHeight = question.length > 105 ? 78 : 92;
  const lines = wrap(x, question, 830);
  let y = 925 - ((lines.length - 1) * lineHeight) / 2;
  for (const line of lines) {
    x.fillText(line, 540, y);
    y += lineHeight;
  }
  x.fillStyle = period === 'night' ? '#cbd5d8' : '#53604c';
  x.font = '400 29px Arial';
  x.fillText('Один вопрос в день, чтобы лучше понимать себя', 540, 1518);
  x.fillText('и сохранять внутреннюю устойчивость', 540, 1563);
  x.fillStyle = period === 'night' ? '#dbe5e7' : '#35402f';
  x.font = '600 27px Arial';
  x.fillText('365: К СЕБЕ  •  ВОПРОС ' + (index + 1) + ' ИЗ 365', 540, 1780);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const file = new File([blob], '365-vopros-dnya.png', { type: 'image/png' });
  const deepLink = `${BOT_LINK}?start=share_${uid}_${today.replaceAll('-', '')}`;
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        title: '365: к себе',
        text: `Вопрос дня от «365: к себе»\n${deepLink}`,
        files: [file],
      });
      shareModal.hidden = true;
      return;
    }
  } catch (e) {
    if (e.name === 'AbortError') return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(url);
  shareModal.hidden = true;
  toast('Открытка сохранена — её можно отправить в Telegram');
};
