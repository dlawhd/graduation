import { Routes, Route, Link } from "react-router-dom";
import Home from "./pages/Home";
import LoginSuccess from "./pages/LoginSuccess";
import JarsPage from "./pages/JarsPage";
import JarsNewPage from "./pages/JarsNewPage";
import JarDetailPage from "./pages/JarDetailPage";

export default function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-logo">E</span>
          <span className="brand-text">ESJH</span>
        </Link>

        <nav className="topnav">
          <Link to="/" className="toplink">
            Home
          </Link>
          <Link to="/jars" className="toplink">
            Jars
          </Link>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login/success" element={<LoginSuccess />} />
        <Route path="/jars" element={<JarsPage />} />
        <Route path="/jars/new" element={<JarsNewPage />} />
        <Route path="/jars/:jarId" element={<JarDetailPage />} />
      </Routes>
    </div>
  );
}