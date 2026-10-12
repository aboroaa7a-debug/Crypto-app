// Service Worker كوسيط لحل CORS
const CACHE_NAME = 'crypto-app-v1';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // اعتراض طلبات CoinGecko فقط
  if (url.hostname === 'api.coingecko.com') {
    event.respondWith(
      fetch(event.request, { mode: 'cors' })
        .then(response => {
          // إعادة بناء الاستجابة مع رؤوس CORS
          const newHeaders = new Headers(response.headers);
          newHeaders.set('Access-Control-Allow-Origin', '*');
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders
          });
        })
        .catch(err => {
          return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
  }
});