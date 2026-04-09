import { getAssetFromKV } from '@cloudflare/kv-asset-handler';
import manifestJSON from '__STATIC_CONTENT_MANIFEST';

const assetManifest = JSON.parse(manifestJSON);

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

function addHeaders(response) {
  const newResponse = new Response(response.body, response);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    newResponse.headers.set(key, value);
  }
  return newResponse;
}

async function getAsset(request, ctx) {
  return await getAssetFromKV(
    { request, waitUntil: ctx.waitUntil.bind(ctx) },
    { ASSET_NAMESPACE: ctx.__STATIC_CONTENT, ASSET_MANIFEST: assetManifest }
  );
}

export default {
  async fetch(request, env, ctx) {
    // Bind the static content namespace for the asset handler
    ctx.__STATIC_CONTENT = env.__STATIC_CONTENT;

    const url = new URL(request.url);
    let { pathname } = url;

    // Redirect trailing slashes (except root and /blog/)
    if (pathname !== '/' && pathname !== '/blog/' && pathname.endsWith('/')) {
      return Response.redirect(`${url.origin}${pathname.slice(0, -1)}`, 301);
    }

    try {
      // Try exact path first
      return addHeaders(await getAsset(request, ctx));
    } catch (e) {
      // Clean URLs: try appending .html
      try {
        const htmlRequest = new Request(`${url.origin}${pathname}.html`, request);
        return addHeaders(await getAsset(htmlRequest, ctx));
      } catch (e2) {
        // Try as directory with index.html
        try {
          const trailingSlash = pathname.endsWith('/') ? '' : '/';
          const dirRequest = new Request(`${url.origin}${pathname}${trailingSlash}index.html`, request);
          return addHeaders(await getAsset(dirRequest, ctx));
        } catch (e3) {
          // Serve 404 page
          try {
            const notFoundRequest = new Request(`${url.origin}/404.html`, request);
            let response = await getAsset(notFoundRequest, ctx);
            return addHeaders(new Response(response.body, { ...response, status: 404 }));
          } catch (e4) {
            return new Response('Not Found', { status: 404 });
          }
        }
      }
    }
  },
};
