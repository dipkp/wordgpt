/**
 * Serves the built add-in over HTTPS on localhost, and proxies /v1/* to a local
 * OpenAI-compatible router (FreeLLMAPI by default).
 *
 * Why the proxy: Word's WebView2 blocks cross-origin calls to a local router —
 * FreeLLMAPI answers with `Cross-Origin-Resource-Policy: same-origin` and sends
 * no CORS headers, so the pane's fetch is rejected before the body is read.
 * Proxying makes the call same-origin (https://localhost:3443/v1/...), and the
 * hop to 127.0.0.1 happens server-side where no browser policy applies.
 *
 * Usage:
 *   node serve-https.mjs                         # serves dist + proxies /v1
 *   LLM_PROXY_TARGET=http://127.0.0.1:31415 node serve-https.mjs
 */

import { createServer } from 'node:https'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const distDir = resolve(here, 'dist')
const pfxPath = resolve(here, 'certs', 'localhost.pfx')
const port = Number(process.env.PORT ?? 3443)
const passphrase = process.env.PFX_PASSPHRASE ?? 'wordgptplus'
const proxyTarget = process.env.LLM_PROXY_TARGET ?? 'http://127.0.0.1:31415'

if (!existsSync(pfxPath)) {
  console.error(`Missing certificate: ${pfxPath}\nSee INSTALL.md, section A1.`)
  process.exit(1)
}
if (!existsSync(join(distDir, 'index.html'))) {
  console.error('Missing dist/index.html — run "pnpm build" first.')
  process.exit(1)
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
}

const HOP_BY_HOP = new Set([
  'host',
  'connection',
  'keep-alive',
  'proxy-authorization',
  'transfer-encoding',
  'upgrade',
  'origin',
  'referer',
])

/** Streams /v1/* to the local router, preserving method, auth header and body. */
function proxyToRouter(req, res) {
  const started = Date.now()
  const target = new URL(req.url, proxyTarget)
  const lib = target.protocol === 'https:' ? httpsRequest : httpRequest

  const headers = {}
  for (const [key, value] of Object.entries(req.headers)) {
    if (HOP_BY_HOP.has(key.toLowerCase())) continue
    if (value !== undefined) headers[key] = value
  }
  headers.host = target.host

  const upstream = lib(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method: req.method,
      headers,
    },
    answer => {
      const out = { ...answer.headers }
      delete out['content-security-policy']
      delete out['cross-origin-resource-policy']
      delete out['cross-origin-opener-policy']
      delete out['content-encoding']

      res.writeHead(answer.statusCode ?? 502, {
        ...out,
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'authorization, content-type',
        'cache-control': 'no-store',
      })
      answer.pipe(res)

      answer.on('end', () => {
        console.log(
          `  proxy ${req.method} ${target.pathname} -> ${answer.statusCode} (${Date.now() - started} ms)`,
        )
      })
    },
  )

  upstream.on('error', error => {
    console.error(`  proxy error: ${error.message}`)
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          error: {
            message: `Router not reachable at ${proxyTarget}: ${error.message}. Is FreeLLMAPI running?`,
          },
        }),
      )
    } else {
      res.end()
    }
  })

  req.pipe(upstream)
}

const server = createServer(
  { pfx: readFileSync(pfxPath), passphrase },
  (req, res) => {
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0])

    if (urlPath.startsWith('/v1/') || urlPath === '/v1') {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': 'authorization, content-type',
          'access-control-allow-methods': 'GET, POST, OPTIONS',
        })
        res.end()
        return
      }
      proxyToRouter(req, res)
      return
    }

    const relative = normalize(urlPath).replace(/^([/\\]|\.\.[/\\])+/, '')
    let filePath = resolve(distDir, relative)

    if (!filePath.startsWith(distDir)) {
      res.writeHead(403).end('Forbidden')
      return
    }

    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      filePath = join(distDir, 'index.html') // SPA fallback
    }

    res.writeHead(200, {
      'content-type': mime[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    })
    createReadStream(filePath).pipe(res)
  },
)

server.listen(port, () => {
  console.log(`  Add-in        https://localhost:${port}/`)
  console.log(`  LLM proxy     https://localhost:${port}/v1  ->  ${proxyTarget}/v1`)
  console.log('  In the pane:  Base URL = https://localhost:3443/v1')
  console.log('  Sideload:     release\\local-https\\manifest.xml')
})
