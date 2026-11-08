const CACHE='speakcosmos-v43';
const APP_SHELL=['./','./index.html','./assets/icon.svg','./manifest.webmanifest','./assets/cosmos3d.js','./assets/cosmos3d.css','./assets/cosmos-graph.json'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(APP_SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;
  e.respondWith(fetch(e.request).then(r=>{
    if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}
    return r;
  }).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))));
});