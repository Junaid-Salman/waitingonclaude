# WaitingOnClaude

Browser game hub for people waiting on Claude to finish a task. First game: Woordle.

## Run locally

```bash
npm install
npm run dev     # Next.js on :3000 and PartyKit on :1999
npm test        # unit tests
npm run test:e2e   # starts its own servers on 3000 and 1999: stop `npm run dev` first
npm run build && npm run check:bundle   # confirms no word data in the client bundle
```

Create `.env` with `CHALLENGE_KEY` (`openssl rand -base64 32`) and `.env.local` with
`NEXT_PUBLIC_PARTYKIT_HOST=localhost:1999`. The full README arrives in Phase 6.
