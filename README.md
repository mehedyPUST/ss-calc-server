# Load Calculator API (Express)

## Local

```bash
npm install
cp .env.example .env
# set MONGODB_URI, JWT_SECRET, FRONTEND_URL
npm run dev
```

First admin: `POST /api/auth/register` with `{ "username", "password", "email?" }`  
(no secret needed when zero admins exist)

## Vercel

1. Deploy this folder as a separate Vercel project
2. Environment variables:
   - `MONGODB_URI`
   - `JWT_SECRET`
   - `ADMIN_REGISTRATION_SECRET` (optional)
   - `FRONTEND_URL` = `https://your-frontend.vercel.app` (comma-separated if multiple)
   - `NODE_ENV=production`
3. Set frontend `NEXT_PUBLIC_API_URL` to this API URL (e.g. `https://your-api.vercel.app`)

Login returns a JWT in the JSON body; the frontend stores it and sends `Authorization: Bearer …` so auth works across domains.
