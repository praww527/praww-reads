import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/AuthContext";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Marketplace from "./pages/Marketplace";
import BookDetail from "./pages/BookDetail";
import StoryDetail from "./pages/StoryDetail";
import Write from "./pages/Write";
import EditStory from "./pages/EditStory";
import AddChapter from "./pages/AddChapter";
import BottomNav from "./components/BottomNav";
import Messages from "./pages/Messages";
import Conversation from "./pages/Conversation";
import Profile from "./pages/Profile";
import Favorites from "./pages/Favorites";
import SearchPage from "./pages/Search";
import Settings from "./pages/Settings";
import Earnings from "./pages/Earnings";
import { Loader2 } from "lucide-react";
import "./App.css";

function PrivateRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
      </div>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function AppShell() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="pb-28 md:pb-0">
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected routes — require login */}
          <Route path="/marketplace" element={<PrivateRoute><Marketplace /></PrivateRoute>} />
          <Route path="/books/:id" element={<PrivateRoute><BookDetail /></PrivateRoute>} />
          <Route path="/stories/:id" element={<PrivateRoute><StoryDetail /></PrivateRoute>} />
          <Route path="/stories/:id/edit" element={<PrivateRoute><EditStory /></PrivateRoute>} />
          <Route path="/stories/:id/add-chapter" element={<PrivateRoute><AddChapter /></PrivateRoute>} />
          <Route path="/messages" element={<PrivateRoute><Messages /></PrivateRoute>} />
          <Route path="/messages/:userId" element={<PrivateRoute><Conversation /></PrivateRoute>} />
          <Route path="/write" element={<PrivateRoute><Write /></PrivateRoute>} />
          <Route path="/profile" element={<Navigate to="/profile/me" replace />} />
          <Route path="/profile/:userId" element={<PrivateRoute><Profile /></PrivateRoute>} />
          <Route path="/favorites" element={<PrivateRoute><Favorites /></PrivateRoute>} />
          <Route path="/inbox" element={<Navigate to="/messages" replace />} />
          <Route path="/search" element={<PrivateRoute><SearchPage /></PrivateRoute>} />
          <Route path="/settings" element={<PrivateRoute><Settings /></PrivateRoute>} />
          <Route path="/earnings" element={<PrivateRoute><Navigate to="/settings?tab=earnings" replace /></PrivateRoute>} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
      <h1 className="font-serif text-6xl font-bold text-muted-foreground/30">404</h1>
      <p className="text-xl font-serif">Page Not Found</p>
      <a href="/" className="rounded-lg bg-primary text-primary-foreground px-5 py-2 text-sm font-medium hover:bg-primary/90">Go Home</a>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  );
}
