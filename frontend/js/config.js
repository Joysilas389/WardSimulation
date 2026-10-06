// Where the game server runs.
// Leave empty when the pages and the server are on the same site (running locally, or all on Render).
// When the pages are on Vercel, put your Render address here, with no slash at the end.
window.WARDLIFE_API = 'https://wardsimulation.onrender.com';
if (['localhost', '127.0.0.1'].includes(location.hostname) || location.hostname.endsWith('.onrender.com')) {
  window.WARDLIFE_API = '';
}
