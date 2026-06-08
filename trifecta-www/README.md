# trifecta-www

Marketing site for Trifecta, the AI coding-agent platform. Built with Next.js and deployed on Vercel.

Live at [trifecta.belweave.com](https://trifecta.belweave.com) and [trifecta.belweave.ai](https://trifecta.belweave.ai).

## Pages

| Route | Page |
|---|---|
| `/` | Landing — overview of the desktop app, iOS, Android, and the VS Code extension |
| `/developers` | Setup guide for the desktop server |
| `/docs` | API and integration docs |
| `/privacy` | Privacy policy |

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), React 19 |
| Styling | Tailwind CSS 4 |
| Components | Base UI + shadcn-style primitives (CVA, `tailwind-merge`) |
| Icons | lucide-react |
| Fonts | Geist Sans / Geist Mono |
| Hosting | Vercel |

## Develop

```bash
cd trifecta-www
npm install
npm run dev      # http://localhost:3000
```

Other scripts: `npm run build`, `npm run start`, `npm run lint`.

## Contact relay

`/api/contact` receives the Mintlify contact form from `preetham.org` and
forwards it to Poke's API Message endpoint.

Required Vercel environment variables:

| Variable | Notes |
|---|---|
| `POKE_API_KEY` | V2 API key created in [Poke Kitchen](https://poke.com/kitchen). Legacy `pk_` keys from Settings → Advanced do not work with the new endpoint. |
| `CONTACT_ALLOWED_ORIGINS` | Optional comma-separated allowlist. Defaults to `https://preetham.org,https://www.preetham.org`. |

> [!NOTE]
> This repo tracks a fast-moving Next.js — read the relevant guide in `node_modules/next/dist/docs/` before writing code, since APIs and conventions may differ from older releases. See [`AGENTS.md`](./AGENTS.md).

## Deploy

```bash
cd trifecta-www
vercel --prod
```

## License

Copyright © Belweave. All rights reserved.
