---
title: Migrate server-side kv/signing/rate-limit to @randroids-dojo/vibekit/server
status: open
priority: 2
issue-type: task
created-at: "2026-05-08T23:27:25.728785-05:00"
---

VibeRacer has src/lib/kv.ts, signToken.ts (HMAC-SHA256 race signing), and rateLimit.ts. ../VibeKit/src/server exposes getKv (cached singleton, returns null when env missing), readKv<T>(kv, key, schema), writeKv (with optional ttlSec), removeKv, signToken (HMAC-SHA256 base64url <payload>.<sig>), verifyToken<T> (timingSafeEqual + optional schema), and incrementWithExpiry (fixed-window rate limit). Replace the inline implementations route by route. Keep the existing API surface (function names, env var names) so callers do not change. The kit's signToken is bit-equivalent to the existing implementation provided the secret and JSON encoding match; verify with one round-trip test before swapping over each route.
