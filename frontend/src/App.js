// src/App.js
import { Routes, Route, Link } from "react-router-dom";
import Home from "./pages/Home";
import LoginSuccess from "./pages/LoginSuccess";
import "./pages/auth.css";

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
          <Link to="/login/success" className="toplink">
            Login Success
          </Link>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login/success" element={<LoginSuccess />} />
      </Routes>
    </div>
  );
}
