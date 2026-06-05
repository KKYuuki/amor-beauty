# HTTPS Development Setup

This project supports HTTPS development mode, which is **required for WebAuthn/Passkey** functionality.

## Quick Start

### HTTP Development (default)
```bash
bun run dev
```

.env.local:
```
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_BETTER_AUTH_URL=http://localhost:3000
```

### HTTPS Development (for passkeys)
```bash
bun run dev --https
```

.env.local:
```
BETTER_AUTH_URL=https://localhost:3000
NEXT_PUBLIC_BETTER_AUTH_URL=https://localhost:3000
```

## How It Works

The auth client (`lib/auth-client.ts`) automatically detects the current protocol:

1. **Environment variable first**: Uses `NEXT_PUBLIC_BETTER_AUTH_URL` if set
2. **Client-side detection**: Falls back to `window.location.protocol` to match the current page
3. **Server fallback**: Uses `http://localhost:3000` during SSR

## Important Notes

- **Passkeys require HTTPS** - WebAuthn API is only available on secure origins
- Both `BETTER_AUTH_URL` and `NEXT_PUBLIC_BETTER_AUTH_URL` must use the same protocol
- The server and client URLs must match to avoid CORS errors
- Turbopack handles HTTPS certificates automatically when using `--https`

## Troubleshooting

### CORS Errors
If you see CORS errors in the console:
1. Check that both ENV variables use the same protocol (both HTTP or both HTTPS)
2. Ensure you're running the dev server with matching protocol (`--https` flag if using HTTPS)
3. Clear browser cache and cookies

### Passkey Registration Fails
If passkey registration fails with "NotAllowedError":
1. You must be running on HTTPS (either localhost or with valid SSL)
2. Check browser console for protocol mismatch warnings
3. Verify `window.isSecureContext` is `true` in dev tools console
