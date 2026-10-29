(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const dialog = $('#generationDialog'), message = $('#generationMessage'), estimate = $('#generationEstimate');
  let capabilities = null, quote = null, quoteImage = null, pending = false, pollTimer;
  window.photo2reelGeneration = { available: false };
  const stateText = text => { message.textContent = text; };
  const token = () => $('#studioAccessToken').value;
  async function api(path, body) {
    const response = await fetch(`/api/studio/${path}`, { method: body ? 'POST' : 'GET', headers: { 'Authorization': `Bearer ${token()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `Studio API returned HTTP ${response.status}.`);
    return data;
  }
  function resetQuote() { quote = null; quoteImage = null; estimate.replaceChildren(); $('#generationConsent').checked = false; $('#confirmGenerationBtn').disabled = true; }
  async function checkAvailability() {
    try {
      const response = await fetch('/api/studio/status');
      if (!response.ok) throw new Error();
      capabilities = await response.json();
      const available = capabilities.generation?.available === true;
      window.photo2reelGeneration.available = available;
      $('#generationPipelineStatus').textContent = available ? 'Configured' : 'Not configured';
      $('#generationAvailability').textContent = available ? 'Generation configured. Owner authorization and cost confirmation are required.' : `Setup required: ${(capabilities.generation?.missing || ['Generation service']).join(', ')}.`;
      $('#openGenerationBtn').textContent = available ? 'Generate selected scene →' : 'View AI generation setup →';
    } catch { $('#generationAvailability').textContent = 'Generation API is not deployed or could not be reached. Your local drafts still work.'; $('#generationPipelineStatus').textContent = 'Unavailable'; }
  }
  $('#openGenerationBtn').addEventListener('click', () => { resetQuote(); stateText('Select a scene in the studio, set its duration to 5 or 10 seconds, and set a project budget.'); dialog.showModal(); });
  $('#closeGenerationBtn').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { clearTimeout(pollTimer); resetQuote(); });
  $('#studioAccessToken').addEventListener('input', resetQuote);
  $('#generationConsent').addEventListener('change', () => { $('#confirmGenerationBtn').disabled = !quote || !$('#generationConsent').checked || pending; });
  const dataUrl = blob => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
  $('#requestEstimateBtn').addEventListener('click', async () => {
    resetQuote();
    if (!capabilities?.generation?.available) { stateText($('#generationAvailability').textContent); return; }
    const plan = window.photo2reelStudio.getPlan();
    if (plan.generationPlan.scope !== 'one-scene') { stateText('Choose “One selected scene first” for this pilot. Automatic batch generation is not enabled.'); return; }
    const scene = plan.scenes.find(item => item.id === plan.generationPlan.sceneIds[0]);
    if (!scene) { stateText('Add and select an image scene first.'); return; }
    $('#requestEstimateBtn').disabled = true; stateText('Preparing an estimate. No generation request has been sent.');
    try {
      const image = await dataUrl(scene.blob);
      const result = await api('quote', { projectId: plan.id, prompt: scene.effectivePrompt, image, duration: scene.duration, aspectRatio: plan.aspectRatio, budgetCapUsd: plan.generationPlan.budgetCapUsd });
      quote = result; quoteImage = image;
      const summary = document.createElement('p'); summary.textContent = `${result.model} · ${result.duration}s · ${result.ratio} · estimated USD ${(result.estimatedCostCents / 100).toFixed(2)}. Project committed estimates: USD ${(result.committedEstimateCents / 100).toFixed(2)} / ${(result.projectBudgetCents / 100).toFixed(2)}. Tariff checked ${result.pricing.verifiedAt}; estimate expires ${new Date(result.expiresAt).toLocaleTimeString()}.`;
      const picture = document.createElement('img'); picture.src = image; picture.alt = 'Image approved for this generation'; picture.style.cssText = 'max-width:140px;max-height:160px;object-fit:contain';
      const prompt = document.createElement('p'); prompt.textContent = scene.effectivePrompt;
      const notice = document.createElement('p'); notice.textContent = result.notice;
      estimate.append(summary, picture, prompt, notice); stateText('Review the displayed image, prompt and estimate, then confirm if you want to generate.');
    } catch (error) { stateText(error.message); }
    finally { $('#requestEstimateBtn').disabled = false; }
  });
  function renderJob(job) {
    let card = document.getElementById(`generation-job-${job.id}`);
    if (!card) { card = document.createElement('div'); card.id = `generation-job-${job.id}`; card.className = 'channel-draft'; $('#generationJobs').prepend(card); }
    card.replaceChildren();
    const heading = document.createElement('strong'); heading.textContent = `${job.id} · ${job.status}`;
    const detail = document.createElement('p'); detail.className = 'dialog-footnote'; detail.textContent = job.error || job.pollError || 'Provider task state. This is not a social publishing receipt.';
    card.append(heading, detail);
    if (job.providerTaskId && !['SUCCEEDED', 'FAILED', 'CANCELED'].includes(job.status)) {
      const refresh = document.createElement('button'); refresh.type = 'button'; refresh.className = 'text-button'; refresh.textContent = 'Refresh task status'; refresh.addEventListener('click', () => poll(job.id)); card.append(refresh);
    }
    for (const url of job.outputs || []) {
      const video = document.createElement('video'); video.controls = true; video.preload = 'none'; video.src = url; video.style.width = '100%';
      const link = document.createElement('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Open generated video ↗'; card.append(video, link);
    }
  }
  async function poll(id) {
    try {
      const job = await api(`jobs/${encodeURIComponent(id)}`); renderJob(job);
      if (dialog.open && !['SUCCEEDED', 'FAILED', 'CANCELED', 'REJECTED', 'UNKNOWN'].includes(job.status)) pollTimer = setTimeout(() => poll(id), job.pollError ? 15000 : 6000);
    } catch (error) { stateText(`${error.message} No generation was resubmitted.`); }
  }
  $('#confirmGenerationBtn').addEventListener('click', async () => {
    if (!quote || pending || !$('#generationConsent').checked) return;
    pending = true; $('#confirmGenerationBtn').disabled = true; $('#requestEstimateBtn').disabled = true;
    try {
      const job = await api('jobs', { quoteId: quote.id, image: quoteImage, confirmGenerationAndUpload: true }); renderJob(job);
      stateText(`Task ${job.status}. Reusing this estimate returns the same task and does not start another generation.`);
      if (!['UNKNOWN', 'REJECTED', 'FAILED', 'CANCELED', 'SUCCEEDED'].includes(job.status)) pollTimer = setTimeout(() => poll(job.id), 6000);
    } catch (error) { stateText(`${error.message} If the request was interrupted, load the project tasks before trying another estimate.`); }
    finally { pending = false; $('#requestEstimateBtn').disabled = false; }
  });
  $('#refreshJobsBtn').addEventListener('click', async () => {
    try { const result = await api(`projects/${encodeURIComponent(window.photo2reelStudio.getPlan().id)}/jobs`); $('#generationJobs').replaceChildren(); result.jobs.forEach(renderJob); stateText(result.jobs.length ? 'Loaded stored generation tasks. These are not published posts.' : 'No generation tasks exist for this project.'); }
    catch (error) { stateText(error.message); }
  });
  checkAvailability();
})();
