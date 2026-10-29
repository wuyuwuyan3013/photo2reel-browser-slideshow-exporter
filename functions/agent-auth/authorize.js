export function onRequest() {
  return new Response(JSON.stringify({ status: 'under_construction', available: false, error: 'temporarily_unavailable', error_description: 'Authorization is not available.' }), { status: 503, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
