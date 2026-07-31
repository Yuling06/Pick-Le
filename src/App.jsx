import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider } from '@/lib/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';

import Landing from './pages/Landing';
import Login from './pages/Login';
import BodyProfileSetup from './pages/BodyProfileSetup';
import CameraScan from './pages/CameraScan';
import LoadingScreen from './pages/LoadingScreen';
import Home from './pages/Home';
import ClothingUpload from './pages/ClothingUpload';
import RecommendationPage from './pages/RecommendationPage';
import Admin from './pages/Admin';

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />

            <Route element={<ProtectedRoute />}>
              <Route path="/setup" element={<BodyProfileSetup />} />
              <Route path="/scan" element={<CameraScan />} />
              <Route path="/loading/:type" element={<LoadingScreen />} />
              <Route path="/home" element={<Home />} />
              <Route path="/upload" element={<ClothingUpload />} />
              <Route path="/result/:requestId" element={<RecommendationPage />} />
              <Route path="/admin" element={<Admin />} />
            </Route>

            <Route path="*" element={<PageNotFound />} />
          </Routes>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
