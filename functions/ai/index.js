export function onRequestGet({ request }) {
  const origin = new URL(request.url).origin;
  const body = `# Photo2Reel public service\n\nPhoto2Reel is a public browser tool for creating slideshow videos from local photos.\n\n## Public workflow\n\n- Select or drag local photos into the tool.\n- Set per-image timing and choose landscape or vertical framing.\n- Add optional local audio and render a downloadable video in the browser.\n\n## Resources\n\n- [Photo-to-video skill](${origin}/.well-known/agent-skills/photo-to-video/SKILL.md)\n- [Expanded overview](${origin}/llms-full.txt)\n- [OpenAPI description](${origin}/openapi.json)\n\n## Limitations\n\nThe public service does not expose visitor files, arbitrary URL fetching, account operations, or server-side rendering. Source files remain in the visitor's browser session.\n`;
  return new Response(body, { headers: { 'content-type': 'text/markdown; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'no-cache' } });
}
