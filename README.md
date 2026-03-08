# ProcureFlow (React + Vite + Tailwind + Supabase RBAC)

ProcureFlow is a beginner-friendly internal procurement app with:
- Supabase email/password authentication
- Role-based access control (`requester`, `manager`, `procurement`, `md_assistant`, `accounting`, `admin`)
- Row Level Security policies in PostgreSQL
- Supplier Master + Item Master + Item-Supplier Mapping
- Centralized workflow constants (roles, PR/PO statuses, actions, document types)
- Reusable PR vs PO variance comparison helpers for future conversion flow
- Transition + role/action guard helpers for consistent workflow validation
- Phase 4A PR foundation (`pr_headers`, `pr_lines`, PR numbering, PR services)

## Features
- Sign in / sign out with session persistence
- Protected routes (`/login` only for unauthenticated users)
- Role-based route and sidebar menu visibility
- Any authenticated user can create/save/submit their own PRs and view their own PR records
- Manager can view submitted PRs and approve/reject
- Admin can access everything
- Optional internal Workflow Debug page for Procurement/Admin
- Reusable workflow history timeline (`pr` / `po`) for internal tracking
- Internal variance debug surface for Procurement/Admin
- Internal guard checker for action permissions and status transitions
- Internal PR foundation debug panel (PR number preview + draft creation test)
- Manager/Admin can manage Supplier Master and Item Master
- Item Master supports image upload to Supabase Storage (with manual `image_url` fallback)
- Manager/Admin can manage Item-Supplier Mapping (one preferred supplier per item)
- Manager/Admin can import Supplier and Item CSV files with preview and upsert
- New Request supports multiple line items
- New Request uses Supplier Master + Item Master selections
- Active PR flow uses `pr_headers` + `pr_lines` (legacy request flow is not routed in UI)
- Manager Approval queue uses submitted PRs from `pr_headers` with RLS-safe visibility
- Procurement Queue shows approved PRs for sourcing and PO draft handoff
- PO Draft can be started/continued from approved PRs with supplier-prefill defaults
- PO Draft includes PR-vs-PO variance checks with threshold-based status routing
- Variance Confirmation queue lets Manager/Admin confirm, reject, or send back variance PO drafts

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
2. On Windows PowerShell:
   ```powershell
   Copy-Item .env.example .env
   ```
3. Add values to `.env`:
   ```env
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   VITE_SUPABASE_ITEM_IMAGE_BUCKET=item-images
   ```

## 3) Apply Database Schema + RLS
1. Open Supabase Dashboard
2. Go to `SQL Editor`
3. Run SQL files in this order:
   - `supabase/schema.sql`
   - `supabase/procurement_schema.sql`
   - `supabase/master_data_phase1.sql`
   - `supabase/master_data_phase2.sql`
   - `supabase/workflow_history_phase3b.sql`
   - `supabase/pr_phase4a.sql`
   - `supabase/pr_phase4b_submit_policy.sql`
   - `supabase/pr_phase4_patch_rls.sql`
   - `supabase/pr_phase4c_pr_number_fix.sql`
   - `supabase/pr_phase4e_department_normalization.sql` (optional data cleanup)
   - `supabase/pr_phase5a_manager_queue_rls.sql`
   - `supabase/pr_phase5b_all_authenticated_pr_creation.sql`
   - `supabase/pr_phase5c_manager_review_actions.sql`
   - `supabase/workflow_history_phase5b_requester_visibility.sql`
   - `supabase/master_data_phase6b_procurement_read.sql`
   - `supabase/po_phase6b_schema.sql`
   - `supabase/po_phase6c_variance.sql`
   - `supabase/po_phase6d_variance_confirmation.sql`
   - `supabase/po_phase6e_currency_fix.sql`
   - `supabase/po_phase6f_po_headers_variance_fix.sql`
   - `supabase/po_phase6g_multi_po_by_supplier.sql`
4. These scripts create:
   - `profiles`
   - `purchase_requests`
   - `purchase_request_items`
   - `suppliers`
   - `items`
   - `item_supplier_map`
   - `workflow_history`
   - `pr_number_counters`
   - `pr_headers`
   - `pr_lines`
   - RLS policies for `staff`/`manager`/`admin` (legacy schema)
5. If your project is already running previous phases, you can run only:
   - `supabase/pr_phase4a.sql`
   - `supabase/pr_phase4b_submit_policy.sql`
   - `supabase/pr_phase4_patch_rls.sql`
   - `supabase/pr_phase4c_pr_number_fix.sql`
   - `supabase/pr_phase4e_department_normalization.sql` (optional data cleanup)
   - `supabase/pr_phase5a_manager_queue_rls.sql`
   - `supabase/pr_phase5b_all_authenticated_pr_creation.sql`
   - `supabase/pr_phase5c_manager_review_actions.sql`
   - `supabase/workflow_history_phase5b_requester_visibility.sql`
   - `supabase/master_data_phase6b_procurement_read.sql`
   - `supabase/po_phase6b_schema.sql`
   - `supabase/po_phase6c_variance.sql`
   - `supabase/po_phase6d_variance_confirmation.sql`
   - `supabase/po_phase6e_currency_fix.sql`
   - `supabase/po_phase6f_po_headers_variance_fix.sql`
   - `supabase/po_phase6g_multi_po_by_supplier.sql`

## 4) Create Users and Assign Roles
1. Go to `Authentication > Users` and create users with email/password
2. Copy each user's UUID from Supabase Auth users table
3. Assign roles:
   ```sql
   update public.profiles set role = 'manager' where id = '<manager-user-uuid>';
   update public.profiles set role = 'admin' where id = '<admin-user-uuid>';
   ```
4. Any user not updated stays `staff` by default
5. App compatibility note:
   - Legacy `staff` is treated as `requester` in the frontend workflow helpers

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

## 6.1) Storage Bucket for Item Images
1. Open Supabase Dashboard > `Storage`
2. Create a bucket named `item-images` (or use your own bucket name)
3. Mark it as public so uploaded image URLs can be displayed in the app
4. If you use a different bucket name, set:
   ```env
   VITE_SUPABASE_ITEM_IMAGE_BUCKET=your-bucket-name
   ```

## 7) Master Data + CSV Import (Manager/Admin)
- Supplier Master import:
  - Key: `supplier_code`
  - Required columns: `supplier_code`, `supplier_name`
  - Modes: `Create only`, `Update only`, `Upsert`
- Item Master import:
  - Key: `sku`
  - Required columns: `sku`, `item_name`, `unit`
  - Modes: `Create only`, `Update only`, `Upsert`
- Steps:
  1. Open `Supplier Master` or `Item Master`
  2. Click `Download Template`
  3. Fill the CSV with your data
  4. Upload the file and review preview/invalid rows
  5. Select mode and run import

## 8) Item-Supplier Mapping (Manager/Admin)
1. Open `Item Master`
2. Click `Suppliers` on any item row
3. Add/Edit mapping fields:
   - `supplier_sku`, `supplier_item_name`, `unit_price`, `currency`
   - `moq`, `lead_time_days`, `is_preferred`, `last_price_date`, `remarks`, `active`
4. Only one preferred supplier can exist per item (enforced in database)
5. Item table shows preferred supplier and last known price

## Environment Files
- `.env.example` is a template
- `.env` is git-ignored

## Project Structure
```text
src/
  components/
    AppLayout.jsx
    ItemSupplierMappingModal.jsx
    WorkflowTimeline.jsx
    ProtectedRoute.jsx
    PublicRoute.jsx
    PageHeader.jsx
    StatusBadge.jsx
  context/
    AuthContext.jsx
  lib/
    formatters.js
    itemImageStorage.js
    masterData.js
    procurementData.js
    roles.js
    supabaseClient.js
    pr/
      prConstants.js
      prNumbering.js
      prService.js
    po/
      poConstants.js
      poService.js
    workflow/
      constants.js
      guardHelpers.js
      historyService.js
      roleHelpers.js
      statusHelpers.js
      varianceConstants.js
      varianceHelpers.js
  pages/
    LoginPage.jsx
    DashboardPage.jsx
    CreatePrPage.jsx
    NewRequestPage.jsx
    RequestsPage.jsx
    ManagerApprovalPage.jsx
    VarianceConfirmationPage.jsx
    ProcurementQueuePage.jsx
    PoDraftPage.jsx
    SupplierMasterPage.jsx
    ItemMasterPage.jsx
    WorkflowDebugPage.jsx
  App.jsx
  main.jsx
  index.css
supabase/
  schema.sql
  procurement_schema.sql
  master_data_phase1.sql
  master_data_phase2.sql
  workflow_history_phase3b.sql
  workflow_history_phase5b_requester_visibility.sql
  pr_phase4a.sql
  pr_phase4b_submit_policy.sql
  pr_phase4_patch_rls.sql
  pr_phase4c_pr_number_fix.sql
  pr_phase4e_department_normalization.sql
  pr_phase5a_manager_queue_rls.sql
  pr_phase5b_all_authenticated_pr_creation.sql
  pr_phase5c_manager_review_actions.sql
  master_data_phase6b_procurement_read.sql
  po_phase6b_schema.sql
  po_phase6c_variance.sql
  po_phase6d_variance_confirmation.sql
  po_phase6e_currency_fix.sql
  po_phase6f_po_headers_variance_fix.sql
  po_phase6g_multi_po_by_supplier.sql
```
