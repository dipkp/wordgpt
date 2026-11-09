# Install — Word GPT Plus with legal features

Two ways to run. **Path A is what is set up on this machine right now**; Path B is the developer
loop (hot reload).

---

## Path A — HTTPS bundle (recommended, this is what is already running)

Word refuses add-ins served over plain `http://`, so this path serves the built bundle over
`https://localhost:3443` with a locally trusted certificate.

### A1. Certificate (already created on this machine — skip if `certs/localhost.pfx` exists)

```powershell
cd upstream\word-gpt-plus
New-Item -ItemType Directory -Force certs | Out-Null

$cert = New-SelfSignedCertificate -DnsName "localhost" -CertStoreLocation "Cert:\CurrentUser\My" `
  -NotAfter (Get-Date).AddYears(3) -KeyExportPolicy Exportable -FriendlyName "Word GPT Plus local dev"

$pwd = ConvertTo-SecureString "wordgptplus" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath certs\localhost.pfx -Password $pwd | Out-Null
Export-Certificate -Cert $cert -FilePath certs\localhost.cer | Out-Null

# Trust it for this user only (no admin needed, no UI prompt)
$c = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2((Resolve-Path certs\localhost.cer).Path)
$store = New-Object System.Security.Cryptography.X509Certificates.X509Store("Root","CurrentUser")
$store.Open("ReadWrite"); $store.Add($c); $store.Close()
```

> `New-SelfSignedCertificate` needs PowerShell 5.1+ on Windows — no OpenSSL, no extra packages.

### A2. Build and serve

```powershell
pnpm install --config.engine-strict=false --ignore-scripts
pnpm build
node serve-https.mjs
```

Expected output:

```
  Add-in served at  https://localhost:3443/
  Sideload:  release\local-https\manifest.xml
```

Keep that window open. Verify in a browser: <https://localhost:3443/> should load without a
certificate warning.

### A3. Sideload into Word

```powershell
npx office-addin-dev-settings sideload release\local-https\manifest.xml
```

Restart Word. A **Word GPT Plus** group appears on the Home tab.

Manual alternative if `npx` is unavailable:

1. Right-click `upstream\word-gpt-plus\release\local-https` → Properties → Sharing → Share.
2. Word → File → Options → Trust Center → Trust Center Settings → **Trusted Add-in Catalogs**.
3. Paste the network path → **Add Catalog** → tick **Show in Menu** → OK → restart Word.
4. Insert → My Add-ins → **Shared Folder** → add **Word GPT Plus**.

---

## Path B — dev server (hot reload, for editing code)

```powershell
cd upstream\word-gpt-plus
pnpm install --config.engine-strict=false --ignore-scripts
pnpm dev
```

Serves on `http://localhost:3000` (binds IPv6 `::1` — use `localhost`, not `127.0.0.1`).
Sideload `release\self-hosted\manifest.xml`.

> Word may reject the `http://` URL in this manifest. If it does, use Path A — it is the same
> build output, just over TLS.

---

## Configure a provider

Open the pane → **Settings** (gear):

| Provider | Get a key | Notes |
|---|---|---|
| Google Gemini | aistudio.google.com/apikey | free tier |
| FreeLLMAPI (local router) | — | Base URL `https://localhost:3443/v1` (through the proxy), key from the FreeLLMAPI → Keys tab |
| Groq | console.groq.com/keys | free tier, fast |
| OpenAI | platform.openai.com | paid |
| Ollama | — | fully local; `ollama serve`, base URL `http://localhost:11434` |

Paste the key → **Save**. Keys live in the add-in's local storage, never on a server.

### FreeLLMAPI specifically

FreeLLMAPI answers with `Cross-Origin-Resource-Policy: same-origin` and sends no CORS headers, so
the pane's fetch to `http://127.0.0.1:31415` is blocked by WebView2 before the body is read.
`serve-https.mjs` proxies `/v1/*` to it, which makes the call same-origin and the browser happy.

In the pane's Settings use:

| Field | Value |
|---|---|
| API Provider | OpenAI (compatible) |
| Base URL | `https://localhost:3443/v1` |
| API Key | the unified key from FreeLLMAPI → Keys |
| Model | any model id FreeLLMAPI lists — e.g. `deepseek-v4-flash` (clean output), or `auto`. Ids from the app's preset list (`gpt-5.2`, …) are **not** in the router catalog and return 404. |

Router on a different port?

```powershell
$env:LLM_PROXY_TARGET = "http://127.0.0.1:4000"
node serve-https.mjs
```

Verify the proxy without the pane:

```powershell
curl.exe -s -o NUL -w "%{http_code}`n" https://localhost:3443/v1/models
# 401 = proxy reaches the router and the router wants a key. Good.
# 502 = router not running.
```

---

## First run checklist

1. Select a clause in a Word document.
2. Legal row → **Review contract** → expect a streamed answer with a risk table.
3. Settings → **Tools** → confirm the five new tools are listed (Insert Comment, Set Track
   Changes, Set Header & Footer, Set Paragraph Format, Redact PII).
4. Try **Redact PII** on a paragraph containing an email — it should turn into `[EMAIL-1]`
   without any model call. `Ctrl+Z` undoes it.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `ERR_PNPM_UNSUPPORTED_ENGINE` or preinstall fails | Repo pins Node 24.21.0; use the two flags above |
| Pane blank, spinner forever | `node serve-https.mjs` not running, or you opened `127.0.0.1` instead of `localhost` |
| Browser shows certificate warning | Cert not trusted — re-run the A1 trust block, then restart Word |
| Word says the add-in could not be loaded | Manifest host mismatch: use `release\local-https\manifest.xml` with the HTTPS server on 3443 |
| Add-in group not on the ribbon | The manifest must contain `<Requirements>` (with `bt:Set Name="WordApi"`) inside `VersionOverrides`, and must not carry placeholder `AppDomain1/2/3`. Both are fixed in this repo — re-run the sideload after updating. |
| Pane loads but is clipped | Word's task pane has a minimum width; widen the window or drag the pane edge. Not a code issue. |
| "No API key provided" | Settings → paste key → Save |
| Tool does nothing silently | Host lacks WordApi 1.4/1.5 (comments, track changes); the tool returns the host error in chat |

---

## Stop / restart

- Stop the server: `Ctrl+C` in its window.
- Restart later: `node serve-https.mjs` from `upstream\word-gpt-plus` (no rebuild needed unless
  source changed).
- Port in use: `$env:PORT=3500; node serve-https.mjs`, then update the manifest URL to match.
