import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

function AdminRoute({ children }) {
  const user = useAuthStore((state) => state.user);

  if (!user || user.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

export default AdminRoute;
