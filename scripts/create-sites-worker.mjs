import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const serverDir = join(process.cwd(),'dist','server');

const worker = `const cacheHeaders = {
  "cache-control": "public, max-age=31536000, immutable"
};

function withHeaders(response, pathname) {
  const headers = new Headers(response.headers);
  if (pathname.startsWith("/_expo/") || pathname.startsWith("/assets/")) {
    for (const [key, value] of Object.entries(cacheHeaders)) headers.set(key, value);
  }
  return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) {
      return withHeaders(assetResponse, url.pathname);
    }

    if (url.pathname.startsWith("/_expo/") || url.pathname.startsWith("/assets/")) {
      return assetResponse;
    }

    const indexUrl = new URL("/index.html", request.url);
    const indexResponse = await env.ASSETS.fetch(new Request(indexUrl, request));
    const headers = new Headers(indexResponse.headers);
    headers.set("content-type", "text/html; charset=utf-8");
    return new Response(indexResponse.body, {status: indexResponse.status, headers});
  }
};
`;

await mkdir(serverDir,{recursive:true});
await writeFile(join(serverDir,'index.js'),worker);
