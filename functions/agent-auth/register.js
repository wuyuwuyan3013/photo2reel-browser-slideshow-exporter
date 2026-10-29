export function onRequest() {
  return new Response(JSON.stringify({ status: 'under_construction', available: false, error: 'temporarily_unavailable', error_description: 'Registration is not available. Use the public Photo2Reel service.' }), { status: 503, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
