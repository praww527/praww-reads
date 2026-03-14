import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./hooks/AuthContext";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Marketplace from "./pages/Marketplace";
import BookDetail from "./pages/BookDetail";
import StoryDetail from "./pages/StoryDetail";
import Write from "./pages/Write";
import Profile from "./pages/Profile";
import Favorites from "./pages/Favorites";
import Inbox from "./pages/Inbox";
import SearchPage from "./pages/Search";
import Settings from "./pages/Settings";
import "./App.css";

function AppShell() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/books/:id" element={<BookDetail />} />
          <Route path="/stories/:id" element={<StoryDetail />} />
          <Route path="/write" element={<Write />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile/:userId" element={<Profile />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
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
