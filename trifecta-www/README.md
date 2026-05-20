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

> [!NOTE]
> This repo tracks a fast-moving Next.js — read the relevant guide in `node_modules/next/dist/docs/` before writing code, since APIs and conventions may differ from older releases. See [`AGENTS.md`](./AGENTS.md).

## Deploy

```bash
cd trifecta-www
vercel --prod
```

## License

Copyright © Belweave. All rights reserved.
