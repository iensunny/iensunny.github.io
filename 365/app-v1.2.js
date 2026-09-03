import { QUESTIONS, POSTSCRIPTS } from './question-bank-v1.2.js?v=13';

const API_URL = 'https://questions-365-bot.iensunny-365.workers.dev';
const BOT_LINK = 'https://t.me/qqwestionsBot';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const tg = window.Telegram?.WebApp;
const isTelegram = Boolean(tg?.initData && tg?.initDataUnsafe?.user?.id);
const uid = String(tg?.initDataUnsafe?.user?.id ?? 'demo');
const prefix = `365:v3:${uid}:`;
const dayKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const today = dayKey();

let index = 0;
let currentQuestion = QUESTIONS[0];
let progress = 0;
let saved = false;
let answer = '';
let history = [];
let notifyTime = localStorage.getItem(prefix + 'notify-time') || '09:00';
let activeEdit = null;
let confirmHandler = null;
let lastFocused = null;
let saveLocked = false;
let revealedQuestion = '';

const app = $('#app');
const answerEl = $('#answer');
const saveStatus = $('#save-status');

function setStatus(text = '', kind = '') {
  saveStatus.textContent = text;
  saveStatus.className = `save-status ${kind}`.trim();
}

function renderQuestion(question) {
  const heading = $('#question');
  if (revealedQuestion === question) return;
  revealedQuestion = question;
  heading.textContent = '';
  heading.setAttribute('aria-label', question);
  question.split(/(\s+)/).forEach((part, position) => {
    if (!part) return;
    if (/^\s+$/.test(part)) {
      heading.append(document.createTextNode(part));
      return;
    }
    const word = document.createElement('span');
    word.className = 'question-word';
    word.setAttribute('aria-hidden', 'true');
    word.style.setProperty('--word-delay', `${Math.min(position * 55, 1100)}ms`);
    word.textContent = part;
    heading.append(word);
  });
}

function persist(key, value) {
  localStorage.setItem(key, value);
  try { tg?.CloudStorage?.setItem(key, value, () => {}); } catch {}
}

function removePersisted(keys) {
  keys.forEach((key) => localStorage.removeItem(key));
  try { tg?.CloudStorage?.removeItems(keys, () => {}); } catch {}
}

async function api(path, data = {}) {
  const response = await fetch(API_URL + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...data, initData: tg.initData }),
  });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

function localHistory() {
  try { return JSON.parse(localStorage.getItem(prefix + 'history') || '[]'); } catch { return []; }
}

function saveLocalHistory() {
  persist(prefix + 'history', JSON.stringify(history));
}

function setView(view) {
  $('#home-view').hidden = view !== 'home';
  $('#answers-view').hidden = view !== 'answers';
  for (const [name, button] of [['home', $('#nav-home')], ['answers', $('#nav-answers')]]) {
    button.classList.toggle('active', name === view);
    if (name === view) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  if (view === 'answers') loadHistory();
}

function render() {
  const question = currentQuestion || QUESTIONS[index] || QUESTIONS[0];
  const pct = progress ? ((progress / QUESTIONS.length) * 100).toFixed(progress < 37 ? 1 : 0) : '0';
  $('#progress-label').textContent = `${progress} / ${QUESTIONS.length} вопросов`;
  $('#percent').textContent = `${pct}%`;
  $('#bar').style.width = `${(progress / QUESTIONS.length) * 100}%`;
  $('#number').textContent = `Вопрос ${Math.min(progress + (saved ? 0 : 1), QUESTIONS.length)} из ${QUESTIONS.length}`;
  renderQuestion(question);
  $('#postcard-question').textContent = question;
  $('#postcard-meta').textContent = `365: к себе · вопрос ${index + 1}`;
  $('#slow-down').hidden = saved;
  $('#answer-wrap').hidden = saved;
  $('#saved').hidden = !saved;
  $('#share-reflection').hidden = !saved;
  if (saved) {
    $('#gratitude').textContent = 'Спасибо, что сохранил эту мысль.';
    $('#reflection').textContent = POSTSCRIPTS[index];
    $('#submit-label').textContent = 'Посмотреть в истории';
    $('#submit').disabled = false;
  } else {
    $('#submit-label').textContent = isTelegram ? 'Ответить' : 'Открыть в Telegram';
    $('#submit').disabled = isTelegram ? !answer.trim() || saveLocked : false;
  }
}

function formatDate(value) {
  try { return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value}T12:00:00`)); }
  catch { return value; }
}

function renderHistory() {
  const list = $('#answers-list');
  const empty = $('#answers-empty');
  list.innerHTML = '';
  $('#answers-count').textContent = `${history.length} сохранено`;
  empty.hidden = history.length > 0;
  history.forEach((item) => {
    const article = document.createElement('article');
    article.className = 'answer-entry';
    const time = document.createElement('time');
    time.dateTime = item.date;
    time.textContent = formatDate(item.date);
    const title = document.createElement('h2');
    title.textContent = item.question;
    const text = document.createElement('p');
    text.className = 'answer-text';
    text.textContent = item.answer;
    const thought = document.createElement('p');
    thought.className = 'reflection';
    thought.textContent = POSTSCRIPTS[item.questionId] || 'К этой мысли можно вернуться позже и увидеть её по-новому.';
    const actions = document.createElement('div');
    actions.className = 'entry-actions';
    actions.append(
      actionButton('Редактировать', 'secondary-button', () => openEdit(item)),
      actionButton('Поделиться мыслью', 'secondary-button', () => shareCard(thought.textContent, 'МЫСЛЬ ДНЯ', '365-mysl.png')),
      actionButton('Удалить', 'danger-button', () => confirmDeleteOne(item)),
    );
    article.append(time, title, text, thought, actions);
    list.append(article);
  });
}

function actionButton(label, className, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.onclick = handler;
  return button;
}

async function loadHistory() {
  if (!isTelegram) { history = localHistory(); renderHistory(); return; }
  try {
    const data = await api('/history');
    history = Array.isArray(data.answers) ? data.answers : [];
    saveLocalHistory();
  } catch {
    history = localHistory();
  }
  renderHistory();
}

function newRequestId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function submit() {
  if (!isTelegram) { location.href = BOT_LINK; return; }
  if (saved) { setView('answers'); return; }
  const text = answer.trim();
  if (!text || saveLocked) return;
  saveLocked = true;
  render();
  setStatus('Сохраняем…');
  const requestIdKey = prefix + 'request-' + today;
  const requestId = localStorage.getItem(requestIdKey) || newRequestId();
  persist(requestIdKey, requestId);
  try {
    const data = await api('/answer', { questionId: index, question: currentQuestion, answer: text, requestId });
    saved = true;
    progress = Math.min(progress + 1, QUESTIONS.length);
    history = [data.answer || { date: today, question: currentQuestion, questionId: index, answer: text }, ...history.filter((item) => item.date !== today)];
    persist(prefix + 'answered-' + today, '1');
    persist(prefix + 'progress', String(progress));
    removePersisted([prefix + 'draft-' + today, requestIdKey]);
    saveLocalHistory();
    setStatus('Ответ сохранён', 'success');
    tg?.HapticFeedback?.notificationOccurred?.('success');
  } catch {
    setStatus('Не удалось сохранить. Текст остался здесь — можно попробовать ещё раз.', 'error');
  } finally {
    saveLocked = false;
    render();
  }
}

function saveDraft() {
  answer = answerEl.value;
  persist(prefix + 'draft-' + today, answer);
  setStatus(answer ? 'Черновик сохранён на устройстве' : '');
  render();
}

function restoreDraft() {
  const key = prefix + 'draft-' + today;
  const local = localStorage.getItem(key) || '';
  answer = local;
  answerEl.value = local;
  if (local) setStatus('Черновик восстановлен');
  try {
    tg?.CloudStorage?.getItem(key, (_error, value) => {
      if (!answer && value) { answer = value; answerEl.value = value; setStatus('Черновик восстановлен'); render(); }
    });
  } catch {}
}

function openModal(id) {
  const backdrop = $(id);
  lastFocused = document.activeElement;
  backdrop.hidden = false;
  $('.app-content').inert = true;
  $('.bottom-nav').inert = true;
  const sheet = $('.modal-sheet', backdrop);
  requestAnimationFrame(() => sheet.focus());
}

function closeModal(backdrop) {
  backdrop.hidden = true;
  if (!$$('.modal-backdrop').some((item) => !item.hidden)) {
    $('.app-content').inert = false;
    $('.bottom-nav').inert = false;
  }
  lastFocused?.focus?.();
}

function openEdit(item) {
  activeEdit = item;
  $('#edit-answer').value = item.answer;
  $('#edit-status').textContent = '';
  openModal('#edit-modal');
}

async function saveEdit() {
  const text = $('#edit-answer').value.trim();
  if (!text || !activeEdit) return;
  $('#edit-status').textContent = 'Сохраняем…';
  try {
    const data = await api('/answer/edit', { id: activeEdit.id, answer: text });
    history = history.map((item) => item.id === activeEdit.id ? data.answer : item);
    saveLocalHistory();
    renderHistory();
    closeModal($('#edit-modal'));
  } catch { $('#edit-status').textContent = 'Не удалось сохранить. Текст не потерян.'; }
}

function showConfirm(copy, action) {
  $('#confirm-copy').textContent = copy;
  confirmHandler = action;
  openModal('#confirm-modal');
}

function confirmDeleteOne(item) {
  showConfirm('Удалить этот ответ? Восстановить его после удаления не получится.', async () => {
    await api('/answer/delete', { id: item.id });
    history = history.filter((entry) => entry.id !== item.id);
    if (item.date === today) { saved = false; progress = Math.max(0, progress - 1); render(); }
    saveLocalHistory();
    renderHistory();
  });
}

async function exportData() {
  try {
    const data = await api('/export');
    download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), '365-k-sebe-export.json');
  } catch { $('#save-status').textContent = 'Не удалось подготовить экспорт.'; }
}

function deleteAll() {
  showConfirm('Удалить все ответы, историю вопросов и настройки? Это действие нельзя отменить.', async () => {
    await api('/delete-all', { confirmation: 'DELETE' });
    const storedKeys = Object.keys(localStorage).filter((key) => key.startsWith(prefix));
    storedKeys.forEach((key) => localStorage.removeItem(key));
    try { if (storedKeys.length) tg?.CloudStorage?.removeItems(storedKeys, () => {}); } catch {}
    history = []; progress = 0; saved = false; answer = ''; answerEl.value = '';
    renderHistory(); render();
  });
}

function wrapText(ctx, text, width) {
  const lines = []; let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function shareCard(text, label, filename) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080; canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 1080, 1350);
  gradient.addColorStop(0, '#f4f0e8'); gradient.addColorStop(1, '#dfead7');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1080, 1350);
  ctx.textAlign = 'center'; ctx.fillStyle = '#1e251a'; ctx.font = '400 118px Georgia'; ctx.fillText('365', 540, 180);
  ctx.fillStyle = '#547b35'; ctx.font = '700 28px Arial'; ctx.fillText(label, 540, 300);
  ctx.fillStyle = '#1e251a'; ctx.font = `500 ${text.length > 150 ? 47 : 56}px Georgia`;
  const lines = wrapText(ctx, text, 820); const lineHeight = text.length > 150 ? 66 : 76;
  let y = 700 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line) => { ctx.fillText(line, 540, y); y += lineHeight; });
  ctx.fillStyle = '#53604c'; ctx.font = '600 25px Arial'; ctx.fillText('365: К СЕБЕ', 540, 1220);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  const file = new File([blob], filename, { type: 'image/png' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title: '365: к себе', text: BOT_LINK, files: [file] });
      return;
    }
  } catch (error) { if (error.name === 'AbortError') return; }
  download(blob, filename);
}

function applyTheme() {
  const hour = new Date().getHours();
  const theme = hour >= 5 && hour < 11 ? 'morning' : hour < 17 ? 'day' : hour < 22 ? 'evening' : 'night';
  app.className = `app-shell theme-${theme}`;
  document.querySelector('meta[name="theme-color"]').content = theme === 'night' ? '#091622' : theme === 'evening' ? '#f7dbc5' : '#edf4e9';
  try { tg?.setHeaderColor?.(document.querySelector('meta[name="theme-color"]').content); } catch {}
}

async function boot() {
  try { tg?.ready?.(); tg?.expand?.(); } catch {}
  applyTheme();
  $('#demo-banner').hidden = isTelegram;
  if (!isTelegram) {
    answerEl.disabled = true;
    answerEl.placeholder = 'Ответы сохраняются только в Telegram';
    setStatus('Это демонстрация: введённый здесь ответ не будет сохранён.');
    render();
    return;
  }
  restoreDraft();
  try {
    const data = await api('/daily-question', { source: tg.initDataUnsafe?.start_param || 'direct' });
    if (!data.complete && Number.isInteger(data.questionId)) {
      index = data.questionId;
      currentQuestion = data.question || QUESTIONS[index];
      progress = Math.min(Number(data.progress) || 0, QUESTIONS.length);
      saved = Boolean(data.answeredToday);
      history = Array.isArray(data.history) ? data.history : [];
      if (data.answer) answer = data.answer;
      saveLocalHistory();
    }
  } catch { setStatus('Нет связи с сервером. Черновик можно продолжить; сохранение станет доступно после подключения.', 'error'); }
  render();
}

function updateViewport() {
  const viewport = window.visualViewport;
  const height = Math.round(viewport?.height || tg?.viewportHeight || window.innerHeight);
  document.documentElement.style.setProperty('--app-height', `${height}px`);
  const keyboardOpen = Boolean(viewport && window.innerHeight - viewport.height > 120);
  document.body.classList.toggle('keyboard-open', keyboardOpen);
  if (keyboardOpen && document.activeElement === answerEl) {
    requestAnimationFrame(() => answerEl.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  }
}

let draftTimer;
answerEl.addEventListener('input', () => { clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 250); answer = answerEl.value; render(); });
answerEl.addEventListener('focus', () => setTimeout(() => { updateViewport(); answerEl.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 180));
answerEl.addEventListener('blur', () => setTimeout(updateViewport, 120));
window.visualViewport?.addEventListener('resize', updateViewport);
window.visualViewport?.addEventListener('scroll', updateViewport);
try { tg?.onEvent?.('viewportChanged', updateViewport); } catch {}
updateViewport();
$('#submit').onclick = submit;
$('#nav-home').onclick = () => setView('home');
$('#nav-answers').onclick = () => setView('answers');
$('#back-home').onclick = () => setView('home');
$('#nav-settings').onclick = () => { $('#notify-time').value = notifyTime; openModal('#settings-modal'); };
$('#save-time').onclick = async () => {
  notifyTime = $('#notify-time').value;
  $('#save-time').disabled = true;
  try {
    await api('/settings', { time: notifyTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    persist(prefix + 'notify-time', notifyTime);
    closeModal($('#settings-modal'));
    setStatus(`Вопрос будет приходить в ${notifyTime}`, 'success');
  } catch {
    setStatus('Не удалось сохранить время. Попробуй ещё раз.', 'error');
  } finally { $('#save-time').disabled = false; }
};
$$('.presets button').forEach((button) => button.onclick = () => { $('#notify-time').value = button.textContent; });
$('#share').onclick = () => openModal('#share-modal');
$('#make-card').onclick = () => shareCard(currentQuestion, 'ВОПРОС ДНЯ', '365-vopros.png');
$('#share-reflection').onclick = () => shareCard(POSTSCRIPTS[index], 'МЫСЛЬ ДНЯ', '365-mysl.png');
$('#save-edit').onclick = saveEdit;
$('#export-data').onclick = exportData;
$('#delete-data').onclick = deleteAll;
$('#confirm-cancel').onclick = () => closeModal($('#confirm-modal'));
$('#confirm-action').onclick = async () => {
  const action = confirmHandler; confirmHandler = null;
  $('#confirm-action').disabled = true;
  try { await action?.(); closeModal($('#confirm-modal')); }
  catch { $('#confirm-copy').textContent = 'Не удалось выполнить действие. Ничего не удалено.'; }
  finally { $('#confirm-action').disabled = false; }
};
$$('.close').forEach((button) => button.onclick = () => closeModal(button.closest('.modal-backdrop')));
$$('.modal-backdrop').forEach((backdrop) => {
  backdrop.addEventListener('mousedown', (event) => { if (event.target === backdrop) closeModal(backdrop); });
  backdrop.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeModal(backdrop);
    if (event.key !== 'Tab') return;
    const focusable = $$('button:not([disabled]),input,textarea,a[href]', backdrop).filter((el) => !el.hidden);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
});

boot();
