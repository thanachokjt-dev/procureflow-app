# ProcureFlow (React + Vite + Tailwind + Supabase RBAC)

ProcureFlow is a beginner-friendly internal procurement app with:
- Supabase email/password authentication
- Role-based access control (`staff`, `manager`, `admin`)
- Row Level Security policies in PostgreSQL

## Features
- Sign in / sign out with session persistence
- Protected routes (`/login` only for unauthenticated users)
- Role-based route and sidebar menu visibility
- Staff can create requests and view only their own requests
- Manager can view pending requests and approve/reject
- Admin can access everything

## Tech Stack
- React (Vite)
- Tailwind CSS
- React Router DOM
- Supabase JavaScript Client

## 1) Create Supabase Project
1. Create a new project at https://supabase.com
2. Open `Settings > API`
3. Copy:
   - `Project URL`
   - `anon public` key

## 2) Configure Environment Variables
1. Create `.env` from `.env.example`:
   ```bash
   cp .env.example .env
   ```
2. On Windows PowerShell, use:
   ```powershell
   Copy-Item .env.example .env
   ```
3. Add values to `.env`:
   ```env
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   ```

## 3) Apply Database Schema + RLS
1. Open Supabase Dashboard
2. Go to `SQL Editor`
3. Open and run:
   - `supabase/schema.sql`
4. This script creates:
   - `profiles`
   - `purchase_requests`
   - `purchase_request_items`
   - RLS policies for `staff`, `manager`, `admin`
   - Trigger to auto-create `profiles` row when a new auth user is created

## 4) Create Users and Assign Roles
1. Go to `Authentication > Users` and create users with email/password
2. Copy each user's UUID from Supabase Auth users table
3. Run SQL to assign roles (example):
   ```sql
   update public.profiles set role = 'manager' where id = '<manager-user-uuid>';
   update public.profiles set role = 'admin' where id = '<admin-user-uuid>';
   ```
4. Any user not updated stays `staff` by default

## 5) Install and Run App
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start dev server:
   ```bash
   npm run dev
   ```
3. Open the URL shown in terminal (usually `http://localhost:5173`)
4. Sign in with one of your Supabase users

## 6) Build and Lint
1. Build:
   ```bash
   npm run build
   ```
2. Lint:
   ```bash
   npm run lint
   ```

## Environment Files
- `.env.example` is a template
- `.env` is git-ignored

## Project Structure
```text
src/
  components/
    AppLayout.jsx
    ProtectedRoute.jsx
    PublicRoute.jsx
    PageHeader.jsx
    StatusBadge.jsx
  context/
    AuthContext.jsx
  lib/
    formatters.js
    purchaseRequests.js
    roles.js
    supabaseClient.js
  pages/
    LoginPage.jsx
    DashboardPage.jsx
    NewRequestPage.jsx
    RequestsPage.jsx
    ManagerApprovalPage.jsx
  App.jsx
  main.jsx
  index.css
supabase/
  schema.sql
```
