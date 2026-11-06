// Workers runtime types (DurableObject, DurableObjectState, `cloudflare:workers`) for partyserver
// and the adapters. They coexist with the DOM lib because skipLibCheck is on; src/ never imports
// party/ (ESLint), so this only widens which globals type-check, not what ships to the browser.
/// <reference types="@cloudflare/workers-types" />
