/**
 * Service Worker：静态站离线缓存。
 * - index.html 走 network-first（保证发版后能拿到新壳）
 * - /assets/ 带内容哈希，cache-first 长缓存
 * - 其余同源 GET 走 stale-while-revalidate
 * 改版本号 CACHE 即可全量刷新缓存。
 */
const CACHE = 'mcu-tools-v1'
const CORE = ['./', './index.html', './manifest.webmanifest', './icon.svg']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return

  // 带哈希的构建产物：cache-first
  if (req.url.includes('/assets/')) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((resp) => {
            const copy = resp.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
            return resp
          }),
      ),
    )
    return
  }

  // 导航/HTML：network-first，离线回落缓存
  if (req.mode === 'navigate' || req.destination === 'document') {
    e.respondWith(
      fetch(req)
        .then((resp) => {
          const copy = resp.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
          return resp
        })
        .catch(() => caches.match('./index.html')),
    )
    return
  }

  // 其他（图标等）：stale-while-revalidate
  e.respondWith(
    caches.match(req).then((hit) => {
      const fetcher = fetch(req)
        .then((resp) => {
          const copy = resp.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
          return resp
        })
        .catch(() => hit)
      return hit || fetcher
    }),
  )
})
