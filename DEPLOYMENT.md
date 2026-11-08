# Deployment

NEXA needs no database, no secrets and no required environment variables.

## Vercel

With the CLI:

```bash
npm i -g vercel
vercel login
vercel          # preview deployment
vercel --prod   # production deployment
```

Or from Git: import the repository at https://vercel.com/new. Vercel detects Next.js and needs no build settings.

Set your public address so canonical URLs and the sitemap are correct:

```bash
vercel env add NEXT_PUBLIC_SITE_URL production
```

## Environment variables

| Variable | Scope | Default | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Public | `https://nexa.example.com` | Canonical URL, Open Graph, sitemap |
| `NEXA_RELAY_ENABLED` | Server | `true` | Set to `false` to remove the relay |
| `NEXA_RELAY_ALLOWED_ORIGINS` | Server | empty | Extra origins allowed to call the relay |

**A user's API key must never become an environment variable.** Keys belong to each user and live in their browser. Never create anything like `NEXT_PUBLIC_API_KEY`: every `NEXT_PUBLIC_` value is shipped to all visitors.

## Before going public

- **Decide about the relay.** A public relay can be used to forward https traffic through your deployment, and it has no rate limit. Add rate limiting (Vercel Firewall or Cloudflare rules), or set `NEXA_RELAY_ENABLED=false`. See [SECURITY.md](SECURITY.md).
- **Add a social image if you want a custom one.** `src/app/opengraph-image.tsx` generates the default.

## GitHub Pages

GitHub Pages serves static files only, so NEXA builds a static version for it: `npm run build:pages`, with `BASE_PATH=/<repository>` when the site lives under a repository name. The workflow in `.github/workflows/pages.yml` does this on every push to `main`, after typecheck, lint and tests.

Setup, once:

1. Push the code to a GitHub repository.
2. In the repository, open Settings, then Pages, and set Source to GitHub Actions.
3. Push to `main`, or run the workflow from the Actions tab. The site appears at `https://<owner>.github.io/<repository>/`.

What a static host can't do, and NEXA says so rather than pretending:

- **No relay.** It needs a server. Providers that refuse browser requests can't be reached from a GitHub Pages deployment. Most, including OpenAI, Anthropic, Gemini and OpenRouter, accept them.
- **A weaker content security policy.** Without a server there is no per-request nonce, so the policy comes from a meta tag and allows inline scripts. It still limits where scripts, frames and connections come from. Use Vercel for the stricter policy.
- **No security headers** such as X-Frame-Options, which GitHub Pages doesn't let you set.

To check the static build locally, serve `out/` under the same base path, with any static server that maps `/<repository>/` to `out/`.

## Cloudflare and Netlify

Both run Next.js through their adapters, and the app itself has no Vercel-specific code. Two things need checking on your target, because they haven't been tested there:

- The relay uses `node:dns/promises`. On Cloudflare, enable the `nodejs_compat` flag, or turn the relay off.
- `src/proxy.ts` must run on every page, because the pages depend on its CSP nonce.

## Verifying a deployment

1. Open the site and add a provider.
2. In the browser's network panel, confirm chat requests go to the provider's host, not to your domain.
3. Check that the page's response carries a `content-security-policy` header with a nonce.
