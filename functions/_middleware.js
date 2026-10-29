export async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);
  const accept = request.headers.get('accept') || '';
  if (url.pathname === '/' && accept.includes('text/markdown')) {
    const origin = url.origin;
    const markdown = `# Photo2Reel\n\nPhoto2Reel has a short-video studio planning preview and a separate local slideshow maker.\n\n## Available tools\n\n- [Studio preview](${origin}/studio/): image selection, scene prompts and a local publishing plan. AI generation and direct publishing are not configured.\n- [Local slideshow maker](${origin}/slideshow/): render local photos, timing and audio into a downloadable video.\n- [Expanded overview](${origin}/llms-full.txt)\n- [Privacy](${origin}/privacy)\n\nA saved draft is not a generated or published video. The local maker depends on browser media APIs and device resources.\n`;
    return new Response(markdown, { headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'no-cache', 'vary': 'Accept', 'link': `</.well-known/api-catalog>; rel="api-catalog", </ai/>; rel="service-doc", </openapi.json>; rel="service-desc"` } });
  }
  const response = await context.next();
  const headers = new Headers(response.headers);
  headers.set('vary', headers.get('vary') ? `${headers.get('vary')}, Accept` : 'Accept');
  headers.append('link', '</.well-known/api-catalog>; rel="api-catalog"');
  headers.append('link', '</ai/>; rel="service-doc"');
  headers.append('link', '</openapi.json>; rel="service-desc"');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
