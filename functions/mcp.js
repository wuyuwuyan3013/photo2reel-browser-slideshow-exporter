function reply(id, result, error) {
  return new Response(JSON.stringify(error ? { jsonrpc: '2.0', id, error } : { jsonrpc: '2.0', id, result }), { headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } });
}
export async function onRequestPost({ request }) {
  const body = await request.json();
  const id = body.id ?? null;
  if (body.method === 'initialize') return reply(id, { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'photo2reel-public-workflow', version: '1.0.0' } });
  if (body.method === 'tools/list') return reply(id, { tools: [{ name: 'describe_photo2reel_workflow', description: 'Describe the public Photo2Reel browser workflow and privacy limitations.', inputSchema: { type: 'object', properties: {} } }] });
  if (body.method === 'tools/call' && body.params?.name === 'describe_photo2reel_workflow') return reply(id, { content: [{ type: 'text', text: 'Photo2Reel lets a visitor select local photos, set per-image timing, choose optional local audio and a landscape or vertical frame, then render a downloadable video in the browser. Source files are not uploaded by the public tool. Agents cannot access the visitor’s local files.' }] });
  return reply(id, null, { code: -32601, message: 'Method not found' });
}
export function onRequestOptions() { return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' } }); }
