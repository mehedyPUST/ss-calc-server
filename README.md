# Load Calculator API

## Why "API not reachable" in the browser?

The API can be up (`/api/health` OK) while the **browser** still blocks calls due to **CORS**.

On Vercel set:

| Variable | Example |
|----------|---------|
| `MONGODB_URI` | Atlas connection string |
| `JWT_SECRET` | long random string |
| `FRONTEND_URL` | `https://your-frontend.vercel.app` |
| `NODE_ENV` | `production` |

Frontend env:

| Variable | Example |
|----------|---------|
| `NEXT_PUBLIC_API_URL` | `https://ss-calc-server.vercel.app` |

This build also allows any `https://*.vercel.app` origin so preview URLs work.

## Local

```bash
npm install
cp .env.example .env
npm run dev
```

## First admin

```bash
curl -X POST https://ss-calc-server.vercel.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-password"}'
```
