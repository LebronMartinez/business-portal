# Local Business Operations and Client Management Portal

React (Vite) front end, Supabase (Postgres + Auth) back end, hosted on Vercel.

## Features
- Client portal: sign up, log in, book a service, see booking status (Booked / Completed / Cancelled, Paid / Unpaid), cancel a booking.
- Owner dashboard: weekly calendar, edit job details (date, time, status, notes, Paid/Unpaid), client history lookup.
- Double bookings are blocked in the database itself (a Postgres exclusion constraint), not only in the browser.
- Row Level Security: clients only see their own bookings; only the owner role can see everyone's.
- No payment processing: Paid/Unpaid is a simple status tag (out of scope by design).

## Run it locally
1. Create a free project at supabase.com.
2. In Supabase open SQL Editor, paste `supabase/schema.sql` and run it.
3. Copy `.env.example` to `.env` and fill in your Project URL and anon public key (Project Settings > API).
4. `npm install` then `npm run dev`.
5. Sign up in the app, then make yourself the owner by running the `update profiles set role = 'admin' ...` line at the bottom of `schema.sql` with your email.
6. For quick testing, turn off "Confirm email" in Supabase > Authentication > Providers > Email.

## Deploy on Vercel
1. Push this folder to a GitHub repository.
2. In Vercel choose Add New > Project, import the repo (Vite is detected automatically).
3. Add the two environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then deploy.
4. In Supabase > Authentication > URL Configuration, add your Vercel URL as the Site URL.

Use only mock data for testing (see the privacy section of the proposal).
