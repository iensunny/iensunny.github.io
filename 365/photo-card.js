// The preview and exported file use the same canvas renderer.
export function createPhotoCard({ onChange, getText }) {
  let mode = 'photo', photo = null, loading = false, generation = 0;
  const backgroundPalettes = {
    morning: { name:'Утро', bg:'#fff4d8', card:'#fffaf0' },
    day: { name:'День', bg:'#edf4e9', card:'#fffdf7' },
    evening: { name:'Вечер', bg:'#f7dbc5', card:'#fff4e9' },
    night: { name:'Ночь', bg:'#091622', card:'#162736' }
  };
  const hour = new Date().getHours();
  let backgroundTheme = hour >= 5 && hour < 11 ? 'morning' : hour >= 11 && hour < 17 ? 'day' : hour >= 17 && hour < 22 ? 'evening' : 'night';
  const positions = { brand: { x: 540, y: 260 }, question: { x: 540, y: 960 }, photo: { x: 0, y: 0 } };
  const bounds = {}, boxes = {}, pointers = new Map();
  let selected = "photo", pinch = null;
  let zoom = 1, textScale = 1, dragging = null;
  let scrollGesture = null;
  let press = null;
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const preview = document.querySelector('#postcard-preview');
  const closeEditor = document.querySelector('#share-modal .modal-close');
  closeEditor.textContent = '←';
  closeEditor.setAttribute('aria-label', 'Вернуться в приложение');
  closeEditor.title = 'Вернуться в приложение';
  const controls = document.createElement('div');
  controls.innerHTML = `
    <div class="share-choices" role="group" aria-label="Оформление открытки" style="grid-template-columns:1fr 1fr">
      <button type="button" data-card-mode="brand" hidden>Убрать фото</button>
      <button type="button" data-card-mode="photo">Фото</button>
    </div>
    <div data-photo-options hidden>
      <input type="file" accept="image/*" aria-label="Выбрать фотографию" hidden>
      <div class="share-choices" style="grid-template-columns:1fr 1fr">
        <label>Текст<select aria-label="Цвет текста"><option value="light">Светлый</option><option value="dark">Тёмный</option></select></label>
        <label>Логотип<select aria-label="Цвет логотипа"><option value="light">Светлый</option><option value="dark">Тёмный</option></select></label>
        <label>Подложка<select aria-label="Градиентная подложка"><option value="dark">Тёмная</option><option value="light">Светлая</option></select></label>
      </div>
      <button type="button" data-reset class="secondary-button">Сбросить</button>
      <p data-photo-status role="status" aria-live="polite"></p>
    </div>`;
  preview.after(controls);
  controls.className = 'card-tools';
  const modes = controls.querySelector('[aria-label="Оформление открытки"]');
  modes.classList.add('card-modes');
  controls.append(modes);
  const title = document.querySelector('#share-title');
  title.textContent = 'Открытка дня'; preview.before(title);
  const contentChoices = document.querySelector('[aria-label="Содержание открытки"]');
  contentChoices.classList.add('card-content'); controls.before(contentChoices);
  controls.querySelector('[data-reset]').setAttribute('aria-label','Сбросить расположение и масштаб');
  const canvas = document.createElement('canvas');
  canvas.width = 1080; canvas.height = 1920;
  canvas.setAttribute('role', 'img');
  canvas.tabIndex = 0;
  canvas.style.touchAction = 'none';
  canvas.style.cssText = 'display:block;width:100%;height:auto;margin:0 auto;border-radius:20px;touch-action:none;cursor:move';
  canvas.hidden = true;
  const stage = document.createElement('div');
  stage.style.cssText = 'position:relative;width:100%;margin:auto';
  preview.after(stage); stage.append(canvas);
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;border-radius:20px';
  stage.append(overlay);
  const editor = document.createElement('textarea');
  editor.maxLength = 500; editor.placeholder = 'Напиши свой текст…';
  editor.setAttribute('aria-label', 'Текст на открытке');
  let editSnapshot = null;
  let textLayout = null;
  editor.style.cssText = 'position:absolute;resize:none;background:transparent;border:0;outline:none;border-radius:0;text-align:center;padding:0;margin:0;box-sizing:border-box;z-index:2;overflow:hidden;font-family:Georgia,serif;font-weight:500;white-space:pre-wrap;overflow-wrap:anywhere';
  editor.hidden = true; stage.append(editor);
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = '×';
  cancel.setAttribute('aria-label', 'Удалить текст');
  cancel.style.cssText = 'position:absolute;z-index:6;width:30px;height:30px;border:2px solid white;border-radius:50%;background:#d94b45;color:white;box-shadow:0 3px 12px #0005;font:500 22px/24px Arial;cursor:pointer;padding:0';
  cancel.hidden = true; stage.append(cancel);
  function editText() {
    if (mode !== 'photo' || !document.querySelector('[data-share-kind="custom"]').classList.contains('active')) return;
    editSnapshot = {value:document.querySelector('#custom-share-text').value, position:{...positions.question}};
    selected = 'question';
    editor.value = editSnapshot.value;
    editor.hidden = cancel.hidden = false;
    update(); editor.focus({preventScroll:true});
  }
  editor.oninput = () => {
    document.querySelector('#custom-share-text').value = editor.value; onChange();
  };
  function finishEdit(restore) {
    if (restore && editSnapshot) {
      document.querySelector('#custom-share-text').value = editSnapshot.value;
      Object.assign(positions.question,editSnapshot.position);
    }
    editor.hidden = cancel.hidden = true; editSnapshot = null;
    onChange(); canvas.focus({preventScroll:true});
  }
  cancel.onclick = event => {
    event.preventDefault();
    document.querySelector('#custom-share-text').value = '';
    editor.value = '';
    onChange(); update();
    editor.focus({preventScroll:true});
  };
  editor.onkeydown = event => { if (event.key === 'Escape') { event.stopPropagation(); finishEdit(true); } };
  stage.addEventListener('pointerdown', event => {
    if (editor.hidden || event.target === editor || event.target === cancel) return;
    finishEdit(false);
    event.preventDefault();
    event.stopPropagation();
  }, true);
  canvas.ondblclick = editText;
  document.querySelectorAll('[data-share-kind]').forEach(button => button.addEventListener('click', () => {
    editor.hidden = cancel.hidden = true;
    if (button.dataset.shareKind === 'custom') setTimeout(editText, 0);
  }));
  const style = document.createElement('style');
  style.textContent = '[data-photo-options] select{display:block;width:100%;margin-top:6px;padding:10px 4px;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--ink);font:inherit}[data-photo-options] input{max-width:100%}.share-sheet{max-height:calc(100dvh - 40px);overflow-y:auto}.share-sheet.object-selected{overflow:hidden;overscroll-behavior:none;touch-action:none}.share-sheet canvas[hidden]{display:none}';
  document.head.append(style);
  const options = controls.querySelector('[data-photo-options]');
  const status = controls.querySelector('[data-photo-status]');
  const [textColor, logoColor, backdrop] = controls.querySelectorAll('select');
  textColor.value = logoColor.value = backgroundTheme === 'night' ? 'light' : 'dark';
  controls.hidden = true;
  const toolbar = document.createElement('div'); toolbar.className = 'story-toolbar';
  toolbar.setAttribute('role','toolbar'); toolbar.setAttribute('aria-label','Инструменты открытки');
  const icons = {
    photo:'<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.5"/><path d="m4 17 5-5 4 4 3-3 5 5"/>',
    color:'<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor"/>',
    shade:'<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 4v16m4-16v16m4-16v16" opacity=".5"/>',
    reset:'<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',
    remove:'<path d="m8 8 8 8m0-8-8 8"/><rect x="3" y="3" width="18" height="18" rx="4"/>'
  };
  function tool(name,label,action) {
    const button = document.createElement('button'); button.type = 'button';
    button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
    button.setAttribute('aria-label',label); button.title = label; button.onclick = action;
    toolbar.append(button); return button;
  }
  tool('photo','Выбрать фото',()=>controls.querySelector('input[type=file]').click());
  const colorButton = tool('color','Изменить цвет выбранного элемента',()=>{
    const select = selected === 'brand' ? logoColor : textColor;
    select.value = select.value === 'light' ? 'dark' : 'light'; update();
  });
  const shadeButton = tool('shade','Светлая или тёмная подложка',()=>{
    if (!photo) { palettePanel.hidden = !palettePanel.hidden; return; }
    backdrop.value = backdrop.value === 'dark' ? 'light' : 'dark'; update();
  });
  const removeButton = tool('remove','Убрать фото',()=>modes.querySelector('[data-card-mode=brand]').click());
  tool('reset','Сбросить расположение',()=>reset());
  stage.append(toolbar);
  const palettePanel = document.createElement('div'); palettePanel.hidden = true;
  palettePanel.setAttribute('role','group'); palettePanel.setAttribute('aria-label','Цвет фирменного фона');
  palettePanel.style.cssText = 'position:absolute;bottom:80px;left:12px;right:12px;z-index:5;display:flex;justify-content:space-around;gap:6px;padding:10px;background:#ffffffed;border-radius:16px;box-shadow:0 4px 24px #0002';
  for (const [key,palette] of Object.entries(backgroundPalettes)) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.theme = key;
    button.textContent = palette.name; button.setAttribute('aria-pressed',String(backgroundTheme === key));
    button.style.cssText = `min-height:44px;padding:8px 12px;border:2px solid transparent;border-radius:12px;background:${palette.bg};color:${key === 'night' ? '#f5f3eb' : '#282318'};font:500 12px Arial;cursor:pointer`;
    button.onclick = () => {
      backgroundTheme = key; textColor.value = logoColor.value = key === 'night' ? 'light' : 'dark';
      palettePanel.hidden = true; update();
    };
    palettePanel.append(button);
  }
  stage.append(palettePanel);
  const toolbarStyle = document.createElement('style');
  toolbarStyle.textContent = '#share-modal .story-toolbar{position:absolute;bottom:12px;left:12px;right:12px;display:flex;gap:8px;align-items:center;justify-content:space-between;z-index:4;padding:6px;border-radius:18px;background:#18201855;backdrop-filter:blur(12px)}#share-modal .story-toolbar button{display:grid;place-items:center;min-width:44px;height:44px;padding:9px;border:0;border-radius:12px;background:transparent;color:white;cursor:pointer}#share-modal .story-toolbar button:disabled{opacity:.25;cursor:default}#share-modal .story-toolbar button:hover:not(:disabled){background:#ffffff20}#share-modal .story-toolbar svg{width:24px;height:24px}';
  document.head.append(toolbarStyle);
  function render(target, text, exporting = false) {
    const ctx = target.getContext('2d');
    target.width = 1080; target.height = 1920;
    const base = ctx.createLinearGradient(0,0,1080,1920);
    base.addColorStop(0,backgroundPalettes[backgroundTheme].card); base.addColorStop(1,backgroundPalettes[backgroundTheme].bg);
    ctx.fillStyle = base; ctx.fillRect(0, 0, 1080, 1920);
    if (photo) {
      const scale = Math.max(1080 / photo.width, 1920 / photo.height) * zoom;
      const maxX = (photo.width * scale - 1080) / 2, maxY = (photo.height * scale - 1920) / 2;
      positions.photo.x = clamp(positions.photo.x, -maxX, maxX);
      positions.photo.y = clamp(positions.photo.y, -maxY, maxY);
      ctx.drawImage(photo, (1080 - photo.width * scale) / 2 + positions.photo.x, (1920 - photo.height * scale) / 2 + positions.photo.y, photo.width * scale, photo.height * scale);
    }
    const rgb = backdrop.value === 'dark' ? '0,0,0' : '255,255,255';
    const gradient = ctx.createLinearGradient(0, 0, 0, 1920);
    gradient.addColorStop(0, `rgba(${rgb},.35)`);
    gradient.addColorStop(.25, `rgba(${rgb},.20)`);
    gradient.addColorStop(.5, `rgba(${rgb},.35)`);
    gradient.addColorStop(.75, `rgba(${rgb},.20)`);
    gradient.addColorStop(1, `rgba(${rgb},.35)`);
    if (photo) { ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1080, 1920); }
    function color(value) {
      const light = value === 'light';
      ctx.fillStyle = light ? '#fffdf7' : '#182015';
      ctx.shadowColor = light ? 'rgba(0,0,0,.85)' : 'rgba(255,255,255,.85)';
      ctx.shadowBlur = 8; ctx.lineWidth = 2; ctx.strokeStyle = ctx.shadowColor; ctx.textAlign = 'center';
    }
    color(logoColor.value);
    function write(text, x, y) { ctx.strokeText(text, x, y); ctx.fillText(text, x, y); }
    function fit(key, halfWidth, top, bottom) {
      bounds[key] = { minX: 80 + halfWidth, maxX: 1000 - halfWidth, minY: 180 + top, maxY: 1740 - bottom };
      const b = bounds[key], pos = positions[key];
      pos.x = clamp(pos.x, b.minX, b.maxX); pos.y = clamp(pos.y, b.minY, b.maxY);
      boxes[key] = { x: pos.x - halfWidth, y: pos.y - top, width: halfWidth * 2, height: top + bottom };
      return pos;
    }
    ctx.font = '400 118px Georgia';
    const brand = fit('brand', ctx.measureText('365').width / 2 + 12, 125, 65);
    write('365', brand.x, brand.y);
    ctx.font = '400 44px Arial'; write('к себе', brand.x, brand.y + 60);

    color(textColor.value);
    let size = Math.round(68 * textScale), lines;
    do {
      ctx.font = `500 ${size}px Georgia`;
      lines = []; let line = '';
      for (const word of text.replace(/\n/g, ' \u0000 ').split(/[^\S\n]+/)) {
        if (word === '\u0000') { lines.push(line); line = ''; continue; }
        const next = line ? `${line} ${word}` : word;
        if (ctx.measureText(next).width <= 860) { line = next; continue; }
        if (line) { lines.push(line); line = ''; }
        for (const char of word) {
          if (ctx.measureText(line + char).width > 860) { lines.push(line); line = ''; }
          line += char;
        }
      }
      if (line.trim()) lines.push(line.trim());
      if (lines.length * size * 1.4 <= 1000) break;
      size -= 2;
    } while (size > 20);
    const halfHeight = (lines.length - 1) * size * 1.4 / 2;
    const question = fit('question', Math.max(0, ...lines.map(line => ctx.measureText(line).width)) / 2 + 12, halfHeight + size, halfHeight + size * .4);
    textLayout = {size,lines:Math.max(1,lines.length),x:question.x,y:question.y,halfHeight};
    if (editor.hidden || exporting) lines.forEach((line, i) => write(line, question.x, question.y + (i - (lines.length - 1) / 2) * size * 1.4));
  }
  function update() {
    const active = mode === 'photo';
    if (!active) editor.hidden = cancel.hidden = true;
    preview.hidden = active; stage.hidden = !active; canvas.hidden = !active; options.hidden = !active;
    canvas.setAttribute('aria-label', `365: к себе. ${getText()}`);
    if (active) render(canvas, getText());
    canvas.closest('.share-sheet')?.classList.toggle('object-selected', active && selected !== 'photo' && editor.hidden);
    backdrop.parentElement.hidden = !photo;
    modes.querySelector('[data-card-mode=brand]').hidden = !photo;
    if (!editor.hidden && textLayout) {
      const {size,x,y,halfHeight,lines} = textLayout;
      const ratio = canvas.getBoundingClientRect().width/1080;
      editor.style.left = `${(x-430)/10.8}%`;
      editor.style.top = `${(y-halfHeight-size*1.05)/19.2}%`;
      editor.style.width = `${860/10.8}%`;
      editor.style.height = `${Math.max(size*1.4*lines,size*2)/19.2}%`;
      editor.style.fontSize = `${size*ratio}px`; editor.style.lineHeight = '1.4';
      editor.style.color = textColor.value === 'light' ? '#fffdf7' : '#182015';
      editor.style.textShadow = textColor.value === 'light' ? '0 0 2px #000,0 0 3px #000' : '0 0 2px #fff,0 0 3px #fff';
      editor.style.caretColor = editor.style.color;
      cancel.style.left = `${Math.min(94, (x + 430) / 10.8)}%`;
      cancel.style.top = `${Math.max(2, (y - halfHeight - size * 1.05) / 19.2)}%`;
      cancel.style.transform = 'translate(-100%, -45%)';
    }
    colorButton.disabled = selected !== 'brand' && selected !== 'question';
    colorButton.setAttribute('aria-label',selected === 'brand' ? 'Цвет логотипа: светлый или тёмный' : 'Цвет текста: светлый или тёмный');
    colorButton.title = colorButton.getAttribute('aria-label');
    colorButton.setAttribute('aria-pressed',String((selected === 'brand' ? logoColor : textColor).value === 'light'));
    shadeButton.disabled = Boolean(photo && selected !== 'photo');
    shadeButton.title = photo ? 'Светлая или тёмная подложка' : 'Цвет фона: утро, день, вечер, ночь';
    shadeButton.setAttribute('aria-label',shadeButton.title);
    if (photo) palettePanel.hidden = true;
    palettePanel.querySelectorAll('button').forEach(button => {
      const active = button.dataset.theme === backgroundTheme;
      button.setAttribute('aria-pressed',String(active)); button.style.borderColor = active ? '#7d9b68' : 'transparent';
    });
    removeButton.disabled = !photo;
    overlay.replaceChildren();
    const box = boxes[selected];
    if (box && active && editor.hidden) {
      const customText = selected === 'question' && document.querySelector('[data-share-kind="custom"]').classList.contains('active');
      if (!customText) {
        const frame = document.createElement('div');
        frame.style.cssText = `position:absolute;left:${box.x/10.8}%;top:${box.y/19.2}%;width:${box.width/10.8}%;height:${box.height/19.2}%;border:1.5px solid white;box-shadow:0 0 0 1px #0008;border-radius:5px;box-sizing:border-box`;
        overlay.append(frame);
      }
      if (dragging && Math.abs(positions[selected].x - 540) < 1) {
        const guide = document.createElement('div'); guide.style.cssText = 'position:absolute;left:50%;top:0;bottom:0;border-left:1px dashed #7cf5c5'; overlay.append(guide);
      }
    }
  }
  function reset() {
    Object.assign(positions.brand, { x: 540, y: 260 });
    Object.assign(positions.question, { x: 540, y: 960 });
    Object.assign(positions.photo, { x: 0, y: 0 });
    zoom = 1; textScale = 1; selected = 'photo'; pointers.clear(); dragging = pinch = press = null; scrollGesture = null; update();
  }
  controls.querySelector('[data-reset]').onclick = reset;
  function point(event) {
    const r = canvas.getBoundingClientRect();
    return { x: (event.clientX-r.left)*1080/r.width, y: (event.clientY-r.top)*1920/r.height };
  }
  function hit(p) {
    return ['question', 'brand'].filter(k => boxes[k]).find(k => {
      const b = boxes[k]; return p.x >= b.x-70 && p.x <= b.x+b.width+70 && p.y >= b.y-90 && p.y <= b.y+b.height+90;
    }) || 'photo';
  }
  function scaleTo(value, anchor = {x:540,y:960}) {
    const next = clamp(value,1,3), ratio = next/zoom;
    positions.photo.x = anchor.x-540-(anchor.x-540-positions.photo.x)*ratio;
    positions.photo.y = anchor.y-960-(anchor.y-960-positions.photo.y)*ratio;
    zoom = next;
  }
  canvas.onpointerdown = event => {
    if (loading || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const p = point(event); pointers.set(event.pointerId,p);
    canvas.setPointerCapture(event.pointerId); canvas.focus({preventScroll:true});
    if (pointers.size === 2) {
      const [a,b] = [...pointers.values()];
      pinch = {key: selected, distance:Math.hypot(a.x-b.x,a.y-b.y), center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}};
      dragging = null; scrollGesture = null; press = null;
    } else if (pointers.size === 1) {
      const pressed = hit(p);
      if (selected !== 'photo') {
        event.preventDefault();
        if (pressed !== 'photo') selected = pressed;
        dragging = {id:event.pointerId, p, x:positions[selected].x, y:positions[selected].y};
        press = {id:event.pointerId, p, background:pressed === 'photo', moved:false};
        scrollGesture = null;
      } else {
        selected = pressed;
      }
      if (event.pointerType === 'touch' && selected === 'photo') {
        scrollGesture = {id:event.pointerId,y:event.clientY}; dragging = null;
      } else if (!dragging) {
        dragging = {id:event.pointerId, p, x:positions[selected].x, y:positions[selected].y};
        press = {id:event.pointerId, p, background:false, moved:false};
      }
    }
    update();
  };
  canvas.onpointermove = event => {
    if (!pointers.has(event.pointerId)) return;
    if (selected !== 'photo') event.preventDefault();
    const p = point(event); pointers.set(event.pointerId,p);
    if (pointers.size === 1 && scrollGesture?.id === event.pointerId) {
      const sheet = canvas.closest('.share-sheet');
      sheet.scrollTop += scrollGesture.y-event.clientY;
      scrollGesture.y = event.clientY; return;
    }
    if (pointers.size === 2 && pinch) {
      const [a,b] = [...pointers.values()], distance = Math.hypot(a.x-b.x,a.y-b.y), center = {x:(a.x+b.x)/2,y:(a.y+b.y)/2};
      const key = pinch.key;
      const ratio = distance/Math.max(1,pinch.distance);
      if (key === 'photo') scaleTo(zoom*ratio,pinch.center);
      if (key === 'question') {
        const next = clamp(textScale*ratio,.6,1.6), actualRatio = next/textScale;
        positions.question.x = pinch.center.x + (positions.question.x-pinch.center.x)*actualRatio;
        positions.question.y = pinch.center.y + (positions.question.y-pinch.center.y)*actualRatio;
        textScale = next;
      }
      positions[key].x += center.x-pinch.center.x; positions[key].y += center.y-pinch.center.y;
      pinch = {key,distance,center};
    } else if (dragging && dragging.id === event.pointerId) {
      if (press?.id === event.pointerId && Math.hypot(p.x-press.p.x,p.y-press.p.y) >= 12) press.moved = true;
      const pos = positions[selected]; pos.x = dragging.x+p.x-dragging.p.x; pos.y = dragging.y+p.y-dragging.p.y;
      if (selected !== 'photo') {
        const b = bounds[selected];
        for (const x of [540,b.minX,b.maxX]) if (Math.abs(pos.x-x)<18) {pos.x=x;break;}
      }
    }
    update();
  };
  function end(event) {
    const tap = dragging && dragging.id === event.pointerId && selected === 'question' && event.type === 'pointerup' && Math.hypot(point(event).x-dragging.p.x,point(event).y-dragging.p.y) < 12;
    const deselect = press?.id === event.pointerId && press.background && !press.moved && event.type === 'pointerup';
    if (deselect && dragging) {
      positions[selected].x = dragging.x;
      positions[selected].y = dragging.y;
    }
    if (!pointers.delete(event.pointerId)) return;
    pinch = null; dragging = null; scrollGesture = null; press = null;
    if (pointers.size === 1 && event.type !== 'pointercancel') {
      const [id,p] = [...pointers.entries()][0];
      if (selected === 'photo') { pointers.clear(); }
      else dragging = {id,p,x:positions[selected].x,y:positions[selected].y};
    }
    if (deselect) selected = 'photo';
    update();
    if (tap && !deselect) editText();
  }
  canvas.onpointerup = canvas.onpointercancel = canvas.onlostpointercapture = end;
  canvas.addEventListener('touchmove', event => {
    if (selected !== 'photo') event.preventDefault();
  }, {passive:false});
  canvas.addEventListener('wheel', event => {
    if (loading || (!event.ctrlKey && !event.metaKey)) return;
    event.preventDefault(); selected = hit(point(event));
    const ratio = Math.exp(-event.deltaY*.002);
    if (selected === 'photo') scaleTo(zoom*ratio,point(event));
    if (selected === 'question') { textScale = clamp(textScale*ratio,.6,1.6); }
    update();
  }, {passive:false});
  canvas.onkeydown = event => {
    if (loading) return;
    if (event.key === 'Tab' && !event.shiftKey && selected !== 'brand') {
      event.preventDefault(); selected = selected === 'photo' ? 'question' : 'brand'; update(); return;
    }
    const delta = {ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]}[event.key];
    if (!delta) return;
    event.preventDefault(); positions[selected].x += delta[0]; positions[selected].y += delta[1]; update();
  };
  modes.querySelector('[data-card-mode=photo]').onclick = () => controls.querySelector('input[type=file]').click();
  modes.querySelector('[data-card-mode=brand]').onclick = () => {
    generation++; loading = false; photo = null; status.textContent = ''; onChange();
  };
  controls.querySelectorAll('select').forEach(select => select.onchange = update);
  controls.querySelector('input[type=file]').onchange = async event => {
    const file = event.target.files[0];
    if (!file) return;
    const request = ++generation;
    loading = true; status.textContent = 'Открываем фотографию…'; onChange();
    let url;
    try {
      url = URL.createObjectURL(file);
      const next = new Image(); next.src = url; await next.decode();
      if (request !== generation) return;
      // Retain a bounded image to avoid keeping a full-resolution camera photo in memory.
      const resized = document.createElement('canvas');
      const scale = Math.min(1, 2560 / Math.max(next.naturalWidth, next.naturalHeight));
      resized.width = Math.round(next.naturalWidth * scale); resized.height = Math.round(next.naturalHeight * scale);
      resized.getContext('2d').drawImage(next, 0, 0, resized.width, resized.height);
      photo = resized; positions.photo.x = positions.photo.y = 0; zoom = 1; status.textContent = '';
    } catch (error) {
      if (request === generation) status.textContent = error.message === 'large' ? 'Выбери фото размером до 25 МБ.' : 'Не удалось открыть фото. Попробуй JPEG, PNG или WebP.';
    } finally {
      if (url) URL.revokeObjectURL(url);
      if (request === generation) { loading = false; event.target.value = ''; onChange(); }
    }
  };
  return { update, get active() { return mode === 'photo'; }, get ready() { return !loading; }, render(target) {
    render(target, getText(), true);
  } };
}
