import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Chat from './pages/Chat';
import Settings from './pages/Settings';
import SettingsUsers from './pages/SettingsUsers';
import SettingsDepartments from './pages/SettingsDepartments';
import SettingsTags from './pages/SettingsTags';
import SettingsPredefinedMessages from './pages/SettingsPredefinedMessages';
import SettingsConnection from './pages/SettingsConnection';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import { ToastProvider } from './components/Toast';
import { ThemeProvider } from './contexts/ThemeContext';

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <Router future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Chat />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              }
            >
              <Route path="users" element={<AdminRoute><SettingsUsers /></AdminRoute>} />
              <Route path="departments" element={<AdminRoute><SettingsDepartments /></AdminRoute>} />
              <Route path="tags" element={<SettingsTags />} />
              <Route path="predefined-messages" element={<SettingsPredefinedMessages />} />
              <Route path="connection" element={<AdminRoute><SettingsConnection /></AdminRoute>} />
            </Route>
            <Route path="/" element={<Navigate to="/login" replace />} />
          </Routes>
        </Router>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
