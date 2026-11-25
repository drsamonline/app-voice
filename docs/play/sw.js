/* sw — the Doc Diff offline shell.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * (c) 2026 Dr Sohil Momin
 *
 * Cache-only on purpose: the app makes no runtime network request, so the worker
 * does not make one either. Bump CACHE when the shell changes.
 */
var CACHE = "voice-v1";
var SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./voice-core.js",
  "./web-kit.js",
  "./export-kit.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "../index.html"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
    if (hit) return hit;
    if (e.request.mode === "navigate") {
      return new Response("<!doctype html><title>Offline</title><p>This page is not in the offline shell. Reopen Doc Diff from its home page.", { headers: { "Content-Type": "text/html;charset=utf-8" } });
    }
    return Response.error();
  }));
});
