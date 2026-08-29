# Optional standalone Express backend

The main app uses **Next.js API routes** (`/api/*`) for Vercel deployment.

This Express server is optional for local development if you prefer a separate process:

```bash
cd backend
npm install
cp .env.example .env   # MONGODB_URI
npm run dev            # port 5000
```

Then in the Next app `.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:5000
```

On Vercel, leave `NEXT_PUBLIC_API_URL` unset so the app uses same-origin `/api`.
