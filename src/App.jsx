import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import ProtectedRoute from './components/ProtectedRoute'
import PublicRoute from './components/PublicRoute'
import { useAuth } from './context/AuthContext'
import { PAGE_KEYS, PAGE_ROLE_ACCESS } from './lib/roles'
import CreatePrPage from './pages/CreatePrPage'
import DashboardPage from './pages/DashboardPage'
import FinalApprovalQueuePage from './pages/FinalApprovalQueuePage'
import FinalApprovalReviewPage from './pages/FinalApprovalReviewPage'
import ItemMasterPage from './pages/ItemMasterPage'
import LoginPage from './pages/LoginPage'
import ManagerApprovalPage from './pages/ManagerApprovalPage'
import PoDraftPage from './pages/PoDraftPage'
import ProcurementQueuePage from './pages/ProcurementQueuePage'
import RequestsPage from './pages/RequestsPage'
import SupplierMasterPage from './pages/SupplierMasterPage'
import VarianceConfirmationPage from './pages/VarianceConfirmationPage'
import WorkflowDebugPage from './pages/WorkflowDebugPage'

function FallbackRedirect() {
  const { isAuthenticated } = useAuth()
  return <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />
}

function App() {
  return (
    <Routes>
      <Route element={<PublicRoute />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route
            path="/new-request"
            element={
              <ProtectedRoute allowedRoles={PAGE_ROLE_ACCESS[PAGE_KEYS.NEW_REQUEST]}>
                <CreatePrPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/create-pr/:prId"
            element={
              <ProtectedRoute allowedRoles={PAGE_ROLE_ACCESS[PAGE_KEYS.REQUESTS]}>
                <CreatePrPage />
              </ProtectedRoute>
            }
          />
          <Route path="/create-pr" element={<Navigate to="/new-request" replace />} />
          <Route path="/requests" element={<RequestsPage />} />
          <Route
            path="/manager-approval"
            element={
              <ProtectedRoute allowedRoles={PAGE_ROLE_ACCESS[PAGE_KEYS.MANAGER_APPROVAL]}>
                <ManagerApprovalPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/variance-confirmation"
            element={
              <ProtectedRoute allowedRoles={PAGE_ROLE_ACCESS[PAGE_KEYS.VARIANCE_CONFIRMATION]}>
                <VarianceConfirmationPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/final-approval-queue"
            element={
              <ProtectedRoute allowedRoles={PAGE_ROLE_ACCESS[PAGE_KEYS.FINAL_APPROVAL_QUEUE]}>
                <FinalApprovalQueuePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/final-approval-review/:poId"
            element={
              <ProtectedRoute allowedRoles={PAGE_ROLE_ACCESS[PAGE_KEYS.FINAL_APPROVAL_QUEUE]}>
                <FinalApprovalReviewPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/procurement-queue"
            element={
              <ProtectedRoute allowedRoles={PAGE_ROLE_ACCESS[PAGE_KEYS.PROCUREMENT_QUEUE]}>
                <ProcurementQueuePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/po-draft/:prId"
            element={
              <ProtectedRoute allowedRoles={PAGE_ROLE_ACCESS[PAGE_KEYS.PO_DRAFT]}>
                <PoDraftPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/po-draft/by-id/:poId"
            element={
              <ProtectedRoute allowedRoles={PAGE_ROLE_ACCESS[PAGE_KEYS.PO_DRAFT]}>
                <PoDraftPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/supplier-master"
            element={
              <ProtectedRoute allowedRoles={PAGE_ROLE_ACCESS[PAGE_KEYS.SUPPLIER_MASTER]}>
                <SupplierMasterPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/item-master"
            element={
              <ProtectedRoute allowedRoles={PAGE_ROLE_ACCESS[PAGE_KEYS.ITEM_MASTER]}>
                <ItemMasterPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/workflow-debug"
            element={
              <ProtectedRoute allowedRoles={PAGE_ROLE_ACCESS[PAGE_KEYS.WORKFLOW_DEBUG]}>
                <WorkflowDebugPage />
              </ProtectedRoute>
            }
          />
        </Route>
      </Route>

      <Route path="*" element={<FallbackRedirect />} />
    </Routes>
  )
}

export default App
