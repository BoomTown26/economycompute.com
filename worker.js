/**
 * Cloudflare Worker — EconomyCompute static site server
 *
 * Serves static assets from KV with:
 * - Clean URL routing (/audit → /audit.html, /blog/ → /blog/index.html)
 * - Security headers (CSP, X-Frame-Options, etc.)
 * - Custom 404 page
 * - Cache-Control for assets
 */

import { getAssetFromKV } from '@cloudflare/kv-asset-handler';

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://economycompute-api.neil-chadda.workers.dev https://script.google.com;",
};

function addHeaders(response) {
  const newResponse = new Response(response.body, response);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    newResponse.headers.set(key, value);
  }
  return newResponse;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    let { pathname } = url;

    // Redirect trailing slashes (except root and /blog/)
    if (pathname !== '/' && pathname !== '/blog/' && pathname.endsWith('/')) {
      return Response.redirect(`${url.origin}${pathname.slice(0, -1)}`, 301);
    }

    try {
      // Try exact path first
      let response = await getAssetFromKV(
        { request, waitUntil: ctx.waitUntil.bind(ctx) },
        {}
      );
      return addHeaders(response);
    } catch (e) {
      // Clean URLs: try appending .html
      try {
        const htmlRequest = new Request(`${url.origin}${pathname}.html`, request);
        let response = await getAssetFromKV(
          { request: htmlRequest, waitUntil: ctx.waitUntil.bind(ctx) },
          {}
        );
        return addHeaders(response);
      } catch (e2) {
        // Try as directory with index.html
        try {
          const dirRequest = new Request(`${url.origin}${pathname}/index.html`, request);
          let response = await getAssetFromKV(
            { request: dirRequest, waitUntil: ctx.waitUntil.bind(ctx) },
            {}
          );
          return addHeaders(response);
        } catch (e3) {
          // Serve 404 page
          try {
            const notFoundRequest = new Request(`${url.origin}/404.html`, request);
            let response = await getAssetFromKV(
              { request: notFoundRequest, waitUntil: ctx.waitUntil.bind(ctx) },
              {}
            );
            return addHeaders(new Response(response.body, { ...response, status: 404 }));
          } catch (e4) {
            return new Response('Not Found', { status: 404 });
          }
        }
      }
    }
  },
};
