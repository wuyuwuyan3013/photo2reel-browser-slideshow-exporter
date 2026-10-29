(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const newId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const state = { id: newId(), mode: 'single', scenes: [], activeScene: null };
  let dbPromise, toastTimer;
  const elements = { name: $('#projectName'), style: $('#visualStyle'), ratio: $('#aspectRatio'), duration: $('#defaultDuration'), caption: $('#postCaption'), time: $('#scheduledAt') };
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let channelCopies = {};
  const channelNames = { tiktok: 'TikTok', instagram: 'Instagram Reels', youtube: 'YouTube Shorts', facebook: 'Facebook Reels' };
  $('#timezoneNote').textContent = `Your local time zone: ${timezone}`;

  function notify(message) {
    const toast = $('#toast'); toast.textContent = message; toast.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 4000);
  }
  function dirty() { $('#saveStatus').textContent = 'Unsaved changes'; }
  function setMode(mode) {
    state.mode = mode;
    $('#singleMode').classList.toggle('selected', mode === 'single');
    $('#storyMode').classList.toggle('selected', mode === 'storyboard');
    $('#singleMode').setAttribute('aria-pressed', String(mode === 'single'));
    $('#storyMode').setAttribute('aria-pressed', String(mode === 'storyboard'));
    dirty();
  }
  $('#singleMode').addEventListener('click', () => {
    if (state.scenes.length > 1) { notify('Single photo mode uses one image. Remove extra scenes first.'); return; }
    setMode('single');
  });
  $('#storyMode').addEventListener('click', () => setMode('storyboard'));

  async function addFiles(files) {
    const accepted = [...files].filter(file => ['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type));
    if (!accepted.length) { notify('Choose a JPG, PNG, WebP or AVIF image.'); return; }
    let added = 0;
    for (const file of accepted) {
      const url = URL.createObjectURL(file);
      try {
        const image = new Image(); image.src = url; await image.decode();
        const scene = { id: newId(), name: file.name, blob: file, url, prompt: '', duration: Number(elements.duration.value) };
        state.scenes.push(scene); state.activeScene = scene.id; added++;
      } catch { URL.revokeObjectURL(url); }
    }
    if (state.scenes.length > 1) setMode('storyboard');
    renderScenes(); dirty();
    notify(added ? `${added} image${added === 1 ? '' : 's'} added. Write a motion direction for each scene.` : 'The selected images could not be decoded.');
  }
  $('#photoInput').addEventListener('change', event => { addFiles(event.target.files); event.target.value = ''; });
  const drop = $('#dropZone');
  drop.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $('#photoInput').click(); } });
  ['dragenter', 'dragover'].forEach(type => drop.addEventListener(type, event => { event.preventDefault(); drop.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(type => drop.addEventListener(type, event => { event.preventDefault(); drop.classList.remove('drag'); }));
  drop.addEventListener('drop', event => addFiles(event.dataTransfer.files));

  function button(text, label, handler, disabled = false) {
    const node = document.createElement('button'); node.type = 'button'; node.textContent = text; node.setAttribute('aria-label', label); node.title = label; node.disabled = disabled; node.addEventListener('click', handler); return node;
  }
  function renderScenes() {
    const list = $('#sceneList'); list.replaceChildren();
    $('#emptyHint').hidden = state.scenes.length > 0;
    state.scenes.forEach((scene, index) => {
      const card = document.createElement('div'); card.className = `scene-card${scene.id === state.activeScene ? ' selected' : ''}`;
      const top = document.createElement('div'); top.className = 'scene-top';
      const thumb = document.createElement('img'); thumb.src = scene.url; thumb.alt = ''; thumb.className = 'scene-thumb';
      const info = document.createElement('div'); info.className = 'scene-info';
      const heading = document.createElement('strong'); heading.textContent = `SCENE ${String(index + 1).padStart(2, '0')}`;
      const name = document.createElement('span'); name.textContent = scene.name; name.title = scene.name;
      info.append(heading, name);
      const actions = document.createElement('div'); actions.className = 'scene-actions';
      actions.append(button('↑', `Move scene ${index + 1} up`, () => moveScene(index, -1), index === 0), button('↓', `Move scene ${index + 1} down`, () => moveScene(index, 1), index === state.scenes.length - 1), button('×', `Remove scene ${index + 1}`, () => removeScene(scene.id)));
      top.append(thumb, info, actions);
      const label = document.createElement('label'); label.htmlFor = `prompt-${scene.id}`; label.textContent = 'Motion direction';
      const prompt = document.createElement('textarea'); prompt.id = label.htmlFor; prompt.rows = 2; prompt.maxLength = 1000; prompt.value = scene.prompt; prompt.placeholder = 'What should move? Describe the action, camera movement and mood.';
      prompt.addEventListener('focus', () => { state.activeScene = scene.id; updatePreview(); });
      prompt.addEventListener('input', () => { scene.prompt = prompt.value; state.activeScene = scene.id; updatePreview(); dirty(); });
      const bottom = document.createElement('div'); bottom.className = 'scene-bottom';
      const durationLabel = document.createElement('label'); durationLabel.textContent = 'Planned seconds';
      const duration = document.createElement('input'); duration.type = 'number'; duration.min = '1'; duration.max = '30'; duration.step = '1'; duration.value = scene.duration; duration.setAttribute('aria-label', `Planned duration of scene ${index + 1}`);
      duration.addEventListener('change', () => { scene.duration = Math.min(30, Math.max(1, Number(duration.value) || 5)); duration.value = scene.duration; updatePreview(); dirty(); });
      durationLabel.append(duration); const hint = document.createElement('small'); hint.textContent = 'One prompt per scene'; bottom.append(durationLabel, hint);
      card.append(top, label, prompt, bottom); list.append(card);
    });
    updatePreview();
  }
  function moveScene(index, offset) { [state.scenes[index], state.scenes[index + offset]] = [state.scenes[index + offset], state.scenes[index]]; dirty(); renderScenes(); }
  function removeScene(id) {
    const scene = state.scenes.find(item => item.id === id); URL.revokeObjectURL(scene.url);
    state.scenes = state.scenes.filter(item => item.id !== id);
    if (state.activeScene === id) state.activeScene = state.scenes[0]?.id || null;
    dirty(); renderScenes();
  }
  function updatePreview() {
    const index = state.scenes.findIndex(item => item.id === state.activeScene);
    const scene = state.scenes[index] || state.scenes[0];
    const image = $('#previewImage'); image.hidden = !scene;
    $('#previewEmpty').hidden = Boolean(scene); $('#previewOverlay').hidden = !scene;
    if (scene) {
      image.src = scene.url; image.alt = `Scene ${index + 1}: ${scene.name}`;
      $('#previewSceneLabel').textContent = `SCENE ${String(Math.max(index, 0) + 1).padStart(2, '0')} · STILL IMAGE PREVIEW`;
      $('#previewPrompt').textContent = scene.prompt || 'Add your motion direction to shape this scene.';
    } else { image.removeAttribute('src'); }
    $('#previewStage').style.aspectRatio = elements.ratio.value.replace(':', '/');
    $('#previewStage').style.maxWidth = elements.ratio.value === '9:16' ? '230px' : '100%';
    $('#previewStage').style.maxHeight = 'none';
    $('#previewStage').style.marginInline = 'auto';
    $('#previewFormat').textContent = elements.ratio.value;
    $('#sceneCount').textContent = state.scenes.length;
    $('#totalDuration').textContent = state.scenes.reduce((sum, item) => sum + item.duration, 0);
    $('#styleSummary').textContent = elements.style.selectedOptions[0].textContent;
    $('#captionCount').textContent = elements.caption.value.length.toLocaleString('en-US');
    const ready = state.scenes.length && state.scenes.every(item => item.prompt.trim());
    $('#briefStatus').textContent = ready ? 'Ready for setup' : 'In progress';
    const strip = $('#storyStrip'); strip.replaceChildren();
    state.scenes.forEach((item, i) => {
      const tile = button('', `Preview scene ${i + 1}`, () => { state.activeScene = item.id; renderScenes(); });
      tile.classList.toggle('selected', item.id === scene?.id);
      const photo = document.createElement('img'); photo.src = item.url; photo.alt = '';
      const number = document.createElement('span'); number.textContent = String(i + 1).padStart(2, '0'); tile.append(photo, number); strip.append(tile);
    });
    $$('.scene-card').forEach((card, i) => card.classList.toggle('selected', state.scenes[i]?.id === scene?.id));
  }
  Object.values(elements).forEach(input => input.addEventListener('input', () => { dirty(); updatePreview(); }));
  $$('.channels input').forEach(input => input.addEventListener('change', () => { dirty(); renderChannelDrafts(); }));
  elements.caption.addEventListener('input', renderChannelDrafts);
  $$('input[name="publishTime"]').forEach(input => input.addEventListener('change', () => { $('#scheduleField').hidden = input.value !== 'scheduled'; dirty(); }));

  function projectData() {
    const data = coreProjectData();
    const notes = $('#subjectNotes').value.trim();
    const scope = $('#generationScope').value;
    const enteredBudget = $('#budgetCap').value;
    const parsedBudget = enteredBudget ? Number(enteredBudget) : null;
    const budgetInputValid = parsedBudget === null || (Number.isFinite(parsedBudget) && parsedBudget > 0 && parsedBudget <= 10000);
    const selectedId = state.activeScene || state.scenes[0]?.id;
    return { ...data, version: 2, sharedSubjectNotes: notes,
      generationPlan: { scope, sceneIds: scope === 'all-scenes' ? data.scenes.map(scene => scene.id) : selectedId ? [selectedId] : [], budgetCapUsd: budgetInputValid ? parsedBudget : null, budgetInputValid, quote: null, status: 'not-configured' },
      channelDrafts: Object.fromEntries(data.destinations.map(channel => [channel, { caption: channelCopies[channel] ?? data.postCaption, status: 'draft-not-submitted', platformPostId: null, publishedUrl: null }])),
      scenes: data.scenes.map(scene => ({ ...scene, effectivePrompt: [scene.prompt, notes ? `Shared subject details: ${notes}` : ''].filter(Boolean).join('\n\n') }))
    };
  }
  function coreProjectData() {
    return { id: state.id, version: 1, name: elements.name.value.trim() || 'Untitled short', mode: state.mode, style: elements.style.value, aspectRatio: elements.ratio.value, defaultDuration: Number(elements.duration.value), postCaption: elements.caption.value, destinations: $$('.channels input:checked').map(input => input.value), publishMode: $('input[name="publishTime"]:checked').value, scheduledAt: elements.time.value || null, timezone, updatedAt: new Date().toISOString(), scenes: state.scenes.map(({ url, ...scene }) => scene) };
  }
  function database() {
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open('photo2reel-studio', 1);
      request.onupgradeneeded = () => { const db = request.result; if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' }); };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }
  async function storeAction(mode, operation) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('projects', mode); const request = operation(transaction.objectStore('projects'));
      transaction.oncomplete = () => resolve(request.result); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error || new Error('Storage operation interrupted.'));
    });
  }
  async function saveDraft() {
    $('#saveBtn').disabled = true;
    try { const project = projectData(); await storeAction('readwrite', store => store.put(project)); $('#saveStatus').textContent = `Saved at ${new Date(project.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`; notify('Draft saved on this device, including your images.'); await refreshProjects(); }
    catch { notify('Browser storage is unavailable or full. Export your brief to keep a copy.'); }
    finally { $('#saveBtn').disabled = false; }
  }
  $('#saveBtn').addEventListener('click', saveDraft);
  async function refreshProjects() {
    const projects = await storeAction('readonly', store => store.getAll()); projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    $('#projectCount').textContent = projects.length; const list = $('#projectList'); list.replaceChildren();
    if (!projects.length) { const empty = document.createElement('div'); empty.className = 'no-projects'; empty.textContent = 'Your saved drafts will appear here.'; list.append(empty); }
    projects.forEach(project => {
      const row = document.createElement('div'); row.className = 'saved-project'; const info = document.createElement('div');
      const name = document.createElement('b'); name.textContent = project.name; const meta = document.createElement('p'); meta.textContent = `${project.scenes.length} scene${project.scenes.length === 1 ? '' : 's'} · ${new Date(project.updatedAt).toLocaleString()}`; info.append(name, meta);
      const open = button('Open', `Open ${project.name}`, () => loadProject(project)); open.className = 'button secondary compact';
      const remove = button('×', `Delete saved draft ${project.name}`, async () => { await storeAction('readwrite', store => store.delete(project.id)); await refreshProjects(); notify('Saved draft removed. Your current editor is unchanged.'); }); remove.className = 'delete-draft';
      row.append(info, open, remove); list.append(row);
    });
  }
  function loadProject(project) {
    $('#subjectNotes').value = project.sharedSubjectNotes || '';
    $('#generationScope').value = project.generationPlan?.scope || 'one-scene';
    $('#budgetCap').value = project.generationPlan?.budgetCapUsd ?? '';
    channelCopies = Object.fromEntries(Object.entries(project.channelDrafts || {}).map(([channel, draft]) => [channel, draft.caption || '']));
    state.scenes.forEach(scene => URL.revokeObjectURL(scene.url));
    state.id = project.id; state.scenes = project.scenes.map(scene => ({ ...scene, url: URL.createObjectURL(scene.blob) })); state.activeScene = state.scenes[0]?.id || null;
    elements.name.value = project.name; elements.style.value = project.style; elements.ratio.value = project.aspectRatio; elements.duration.value = String(project.defaultDuration); elements.caption.value = project.postCaption; elements.time.value = project.scheduledAt || '';
    $$('.channels input').forEach(input => { input.checked = project.destinations.includes(input.value); });
    $$('input[name="publishTime"]').forEach(input => { input.checked = input.value === project.publishMode; }); $('#scheduleField').hidden = project.publishMode !== 'scheduled';
    setMode(project.mode); renderScenes(); renderChannelDrafts(); $('#saveStatus').textContent = 'Loaded saved draft'; $('#projectsDialog').close(); notify('Draft opened. Images restored from local storage.');
  }
  $('#projectsBtn').addEventListener('click', async () => { try { await refreshProjects(); $('#projectsDialog').showModal(); } catch { notify('This browser cannot read local project storage.'); } });
  $('#closeProjects').addEventListener('click', () => $('#projectsDialog').close());
  function blobDataUrl(blob) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); }); }
  $('#exportBtn').addEventListener('click', async () => {
    try {
      const data = projectData(); data.scenes = await Promise.all(data.scenes.map(async ({ blob, ...scene }) => ({ ...scene, imageDataUrl: await blobDataUrl(blob) }))); data.prototype = { generation: 'not-configured', publishing: 'not-connected' };
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = `${data.name.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'photo2reel-brief'}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify('Brief exported as JSON with your selected images.');
    } catch { notify('Could not export the brief. Try fewer or smaller images.'); }
  });
  function showReadiness(connectionsOnly = false) {
    $('#dialogTitle').textContent = connectionsOnly ? 'Connections to complete' : 'Project readiness'; const results = $('#readinessResults'); results.replaceChildren();
    const data = projectData(); const missingPrompts = data.scenes.filter(scene => !scene.prompt.trim()).length;
    const rows = connectionsOnly ? [] : [
      [data.scenes.length > 0, 'Source images', data.scenes.length ? `${data.scenes.length} image${data.scenes.length === 1 ? '' : 's'} in your brief.` : 'Add at least one source image.'],
      [data.scenes.length > 0 && !missingPrompts, 'Motion directions', missingPrompts ? `Write a motion direction for ${missingPrompts} scene${missingPrompts === 1 ? '' : 's'}.` : data.scenes.length ? 'Every scene has its own motion direction.' : 'Add an image, then describe what should happen.'],
      [data.destinations.length > 0, 'Publishing destinations', data.destinations.length ? `${data.destinations.length} destination${data.destinations.length === 1 ? '' : 's'} selected; account authorization is still required.` : 'Choose the destinations you want to prepare.'],
      [data.publishMode !== 'scheduled' || Boolean(data.scheduledAt && new Date(data.scheduledAt) > new Date()), 'Publishing time', data.publishMode === 'scheduled' ? data.scheduledAt && new Date(data.scheduledAt) > new Date() ? `${new Date(data.scheduledAt).toLocaleString()} · ${timezone}. This brief is not a scheduled job.` : 'Choose a future date and time in your local time zone.' : 'Prepare to publish after generation and account setup.']
    ];
    if (!connectionsOnly) rows.push([Boolean(data.generationPlan.sceneIds.length) && data.generationPlan.budgetInputValid, 'Generation scope and budget', `${data.generationPlan.scope === 'one-scene' ? 'One selected scene first.' : 'All scenes after review.'} ${!data.generationPlan.budgetInputValid ? 'Enter a positive budget up to USD 10,000, or leave it blank.' : data.generationPlan.budgetCapUsd === null ? 'Set a budget preference if you want a cap.' : `Your cap: USD ${data.generationPlan.budgetCapUsd.toFixed(2)}.`} A real quote and server-enforced spending limit are still required.`]);
    const generationConfigured = window.photo2reelGeneration?.available === true;
    rows.push([generationConfigured, generationConfigured ? 'Generation service configured' : 'AI generation service not configured', generationConfigured ? 'Open the generation panel for owner authorization, an estimate and explicit confirmation.' : 'Configure the generation service, private access and database before generating.'], [false, 'Platform accounts not connected', 'Official platform integrations and account authorization are required. Selecting a destination does not connect an account or publish a post.']);
    rows.forEach(([ready, title, message]) => {
      const row = document.createElement('div'); row.className = `readiness-row${ready ? '' : ' blocked'}`; const icon = document.createElement('span'); icon.textContent = ready ? '✓' : '○'; const text = document.createElement('div'); const heading = document.createElement('b'); heading.textContent = title; const detail = document.createElement('p'); detail.textContent = message; text.append(heading, detail); row.append(icon, text); results.append(row);
    });
    $('#statusDialog').showModal();
  }
  $('#readinessBtn').addEventListener('click', () => showReadiness()); $('#connectionsBtn').addEventListener('click', () => showReadiness(true));
  ['#closeStatus', '#closeStatusBottom'].forEach(selector => $(selector).addEventListener('click', () => $('#statusDialog').close()));
  function renderChannelDrafts() {
    const container = $('#channelDrafts'); container.replaceChildren();
    $$('.channels input:checked').forEach(input => {
      const channel = input.value;
      const card = document.createElement('div'); card.className = 'channel-draft';
      const heading = document.createElement('div'); heading.className = 'channel-draft-heading';
      const name = document.createElement('strong'); name.textContent = channelNames[channel];
      const status = document.createElement('span'); status.textContent = 'Draft only · not queued'; heading.append(name, status);
      const label = document.createElement('label'); label.textContent = channel === 'youtube' ? 'Description for this channel' : 'Caption for this channel';
      const text = document.createElement('textarea'); text.rows = 2; text.maxLength = 2200; text.value = channelCopies[channel] ?? elements.caption.value; text.setAttribute('aria-label', `${channelNames[channel]} caption`);
      text.addEventListener('input', () => { channelCopies[channel] = text.value; dirty(); }); label.append(text);
      const reset = button('Use shared caption', `Use shared caption for ${channelNames[channel]}`, () => { delete channelCopies[channel]; renderChannelDrafts(); dirty(); }); reset.className = 'text-button';
      const receipt = document.createElement('small'); receipt.textContent = 'Live post link: not available. No request has been submitted.';
      card.append(heading, label, reset, receipt); container.append(card);
    });
  }
  const recipes = {
    product: [
      'Introduce the product with a slow, steady push-in. Keep the original product clearly visible in the center of the frame.',
      'Move gently closer to one visible product detail. Keep the camera motion small and avoid inventing hidden parts.',
      'Finish on a clean, stable product view. Leave visual space around the subject for a closing message added in editing.'
    ],
    creator: [
      'Establish the subject and setting with a gentle camera move. Begin from the uploaded image without changing the subject.',
      'Show one small action that can naturally begin from this image. Keep the same subject, outfit and setting.',
      'End with a calm, stable frame that feels connected to the opening shot. Keep the visual style consistent.'
    ],
    travel: [
      'Open with a slow reveal of the visible location. Keep the geography and lighting grounded in the source image.',
      'Use a gentle pan across a detail already visible in this image. Avoid an abrupt scene change.',
      'Close with a quiet wide view and a slow pull-back. Preserve the same atmosphere and time of day.'
    ]
  };
  $('#applyRecipeBtn').addEventListener('click', () => {
    if (!state.scenes.length) { notify('Add an image first, then fill a scene recipe.'); return; }
    const recipe = recipes[$('#sceneRecipe').value];
    if (state.scenes.length === 1) {
      const original = state.scenes[0];
      for (let i = 1; i < recipe.length; i++) state.scenes.push({ ...original, id: newId(), url: URL.createObjectURL(original.blob), prompt: '' });
      setMode('storyboard');
    }
    state.scenes.forEach((scene, index) => { if (!scene.prompt.trim()) scene.prompt = recipe[index % recipe.length]; });
    if ($('#sceneRecipe').value === 'product') elements.style.value = 'clean-product';
    renderScenes(); dirty(); notify('Recipe added to empty prompts. Review each direction before generation.');
  });
  ['#subjectNotes', '#generationScope', '#budgetCap'].forEach(selector => $(selector).addEventListener('input', dirty));
  refreshProjects().catch(() => { $('#saveStatus').textContent = 'Local storage unavailable'; });
  updatePreview();
  window.photo2reelStudio = { getPlan: projectData };
})();
