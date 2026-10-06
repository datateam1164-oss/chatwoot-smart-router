import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './Layout';
import DashboardPage from './pages/DashboardPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import EventsPage from './pages/EventsPage';
import LoginPage from './pages/LoginPage';
import ResolveAuditPage from './pages/ResolveAuditPage';
import ErrorBoundary from './components/ErrorBoundary';
import { authStorage } from './api/agents';
import { GLOBAL_CSS } from './styles';
import { ThemeProvider } from './context/ThemeContext';

function ProtectedRoute({ children }) {
  const token = authStorage.getToken();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <ThemeProvider>
      <style>{GLOBAL_CSS}</style>
      <ErrorBoundary>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          
          <Route element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/resolve-audit" element={<ResolveAuditPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
    </ThemeProvider>
  );
}
