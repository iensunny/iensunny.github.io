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
let shareKind = 'question';
let shareThought = '';

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
  $('#question-index').textContent = `#${index + 1}`;
  $('#number').textContent = 'Вопрос дня';
  renderQuestion(question);
  $('#postcard-question').textContent = question;
  $('#postcard-meta').textContent = `365: к себе · #${index + 1}`;
  $('#slow-down').hidden = saved;
  $('#answer-wrap').hidden = saved;
  $('#saved').hidden = !saved;
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
      actionButton('Поделиться', 'secondary-button', () => openShare('thought', thought.textContent)),
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
    const pdf = await createBrandedPdf(Array.isArray(data.answers) ? data.answers : []);
    download(pdf, '365-k-sebe-otvety.pdf');
  } catch { $('#save-status').textContent = 'Не удалось подготовить экспорт.'; }
}

function deleteAll() {
  showConfirm('Удалить все ответы, историю вопросов и настройки? Это действие нельзя отменить.', async () => {
    const fresh = await api('/delete-all', { confirmation: 'DELETE' });
    const storedKeys = Object.keys(localStorage).filter((key) => key.startsWith(prefix));
    storedKeys.forEach((key) => localStorage.removeItem(key));
    try { if (storedKeys.length) tg?.CloudStorage?.removeItems(storedKeys, () => {}); } catch {}
    history = []; progress = 0; saved = false; answer = ''; answerEl.value = '';
    if (Number.isInteger(fresh.questionId) && fresh.question) {
      index = fresh.questionId;
      currentQuestion = fresh.question;
      revealedQuestion = '';
    }
    renderHistory(); render();
    setStatus('Личные данные удалены. Для тебя выбран новый вопрос.', 'success');
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

function bytes(text) { return new TextEncoder().encode(text); }

function concatBytes(parts) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(size); let offset = 0;
  parts.forEach((part) => { result.set(part, offset); offset += part.length; });
  return result;
}

function jpegBytes(dataUrl) {
  const binary = atob(dataUrl.split(',')[1]);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function imagePdf(images) {
  const pageCount = images.length;
  const objectCount = 2 + pageCount * 3;
  const objects = new Array(objectCount + 1);
  objects[1] = bytes('<< /Type /Catalog /Pages 2 0 R >>');
  const pageIds = images.map((_image, page) => 3 + page * 3);
  objects[2] = bytes(`<< /Type /Pages /Count ${pageCount} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`);
  images.forEach((image, page) => {
    const pageId = 3 + page * 3, imageId = pageId + 1, contentId = pageId + 2;
    const stream = bytes('q 595 0 0 842 0 0 cm /PageImage Do Q');
    objects[pageId] = bytes(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /PageImage ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects[imageId] = concatBytes([bytes(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.data.length} >>\nstream\n`), image.data, bytes('\nendstream')]);
    objects[contentId] = concatBytes([bytes(`<< /Length ${stream.length} >>\nstream\n`), stream, bytes('\nendstream')]);
  });
  const parts = [bytes('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')], offsets = new Array(objectCount + 1).fill(0);
  let length = parts[0].length;
  for (let id = 1; id <= objectCount; id += 1) {
    offsets[id] = length;
    const object = concatBytes([bytes(`${id} 0 obj\n`), objects[id], bytes('\nendobj\n')]);
    parts.push(object); length += object.length;
  }
  const xrefAt = length;
  const xref = `xref\n0 ${objectCount + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  parts.push(bytes(xref));
  return new Blob([concatBytes(parts)], { type: 'application/pdf' });
}

async function createBrandedPdf(answers) {
  const width = 1240, height = 1754, margin = 105, bottom = 150;
  const pages = []; let canvas; let ctx; let y;
  const newPage = () => {
    canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#f8f4eb'); gradient.addColorStop(1, '#e3eddc');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#1e251a'; ctx.font = '500 82px Georgia'; ctx.fillText('365', margin, 125);
    ctx.fillStyle = '#547b35'; ctx.font = '700 28px Arial'; ctx.fillText('К СЕБЕ · ЛИЧНАЯ ИСТОРИЯ', margin, 175);
    ctx.strokeStyle = '#a9b99d'; ctx.beginPath(); ctx.moveTo(margin, 215); ctx.lineTo(width - margin, 215); ctx.stroke();
    y = 280;
  };
  const finishPage = () => {
    ctx.fillStyle = '#687064'; ctx.font = '24px Arial';
    ctx.fillText(`Экспортировано ${new Intl.DateTimeFormat('ru-RU').format(new Date())}`, margin, height - 72);
    pages.push({ data: jpegBytes(canvas.toDataURL('image/jpeg', .9)), width, height });
  };
  const linesFor = (text, maxWidth, font) => {
    ctx.font = font; const lines = []; let line = '';
    String(text || '').split(/\s+/).forEach((word) => {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); line = word; } else line = next;
    });
    if (line) lines.push(line); return lines;
  };
  newPage();
  if (!answers.length) {
    ctx.fillStyle = '#1e251a'; ctx.font = '500 42px Georgia'; ctx.fillText('Сохранённых ответов пока нет.', margin, y);
  }
  answers.forEach((item) => {
    const questionLines = linesFor(item.question, width - margin * 2, '500 35px Georgia');
    const answerLines = linesFor(item.answer, width - margin * 2, '28px Arial');
    const blockHeight = 58 + questionLines.length * 49 + answerLines.length * 42 + 62;
    if (y + blockHeight > height - bottom && y > 300) { finishPage(); newPage(); }
    ctx.fillStyle = '#547b35'; ctx.font = '700 23px Arial'; ctx.fillText(formatDate(item.date).toUpperCase(), margin, y); y += 50;
    ctx.fillStyle = '#1e251a'; ctx.font = '500 35px Georgia'; questionLines.forEach((line) => { ctx.fillText(line, margin, y); y += 49; });
    y += 12; ctx.fillStyle = '#4f574b'; ctx.font = '28px Arial'; answerLines.forEach((line) => { ctx.fillText(line, margin, y); y += 42; });
    y += 34; ctx.strokeStyle = '#c6d0be'; ctx.beginPath(); ctx.moveTo(margin, y); ctx.lineTo(width - margin, y); ctx.stroke(); y += 40;
  });
  finishPage();
  return imagePdf(pages);
}

function selectedShareText() {
  if (shareKind === 'thought') return shareThought || POSTSCRIPTS[index];
  if (shareKind === 'custom') return $('#custom-share-text').value.trim();
  return currentQuestion;
}

function updateSharePreview() {
  const labels = { question: 'Вопрос дня', thought: 'Мысль дня', custom: 'Твоя мысль' };
  const text = selectedShareText();
  $('#postcard-label').textContent = labels[shareKind];
  $('#postcard-label').hidden = shareKind !== 'question';
  $('#postcard-question').textContent = text || 'Здесь появится твой текст';
  $('#postcard-meta').hidden = shareKind !== 'question';
  $('#custom-share-wrap').hidden = shareKind !== 'custom';
  $('#make-card').disabled = !text;
  $$('[data-share-kind]').forEach((button) => button.classList.toggle('active', button.dataset.shareKind === shareKind));
}

function openShare(kind = 'question', thought = '') {
  shareKind = kind; shareThought = thought;
  updateSharePreview(); openModal('#share-modal');
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
  document.body.dataset.timeTheme = theme;
  $('#postcard-preview').className = `postcard-preview theme-${theme}`;
  const color = theme === 'night' ? '#091622' : theme === 'evening' ? '#f7dbc5' : theme === 'morning' ? '#fff4d8' : '#edf4e9';
  document.querySelector('meta[name="theme-color"]').content = color;
  try { tg?.setHeaderColor?.(color); tg?.setBackgroundColor?.(color); tg?.setBottomBarColor?.(color); } catch {}
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
try { tg?.onEvent?.('activated', applyTheme); } catch {}
document.addEventListener('visibilitychange', () => { if (!document.hidden) applyTheme(); });
setInterval(applyTheme, 60_000);
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
$('#share').onclick = () => openShare('question');
$$('[data-share-kind]').forEach((button) => button.onclick = () => { shareKind = button.dataset.shareKind; updateSharePreview(); });
$('#custom-share-text').addEventListener('input', updateSharePreview);
$('#make-card').onclick = () => shareCard(selectedShareText(), shareKind === 'question' ? 'ВОПРОС ДНЯ' : '', '365-k-sebe.png');
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
