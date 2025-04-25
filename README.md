# redirector

Cloudflare-powered URL shortener.

## Deploy

```bash
pnpm install
pnpx wrangler publish
pnpx wrangler d1 execute redirector --file .\src\create.sql --remote
```

## Add

```bash
curl -X POST https://{your-domain}/add?url=https://example.com
```

## Get

```bash
curl -X GET https://{your-domain}/get?id={id}
```

Returns useful information about the URL. (Expiration time, original URL)

## Go

```bash
curl -X GET https://{your-domain}/{id}
```

Redirects to the original URL.
