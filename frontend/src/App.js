import { useEffect, useState } from "react";
import { Routes, Route, Link } from "react-router-dom";
import Home from "./pages/Home";
import LoginSuccess from "./pages/LoginSuccess";

export default function App() {
  return (
    <div style={{ padding: 24 }}>
      <nav style={{ marginBottom: 16 }}>
        <Link to="/">Home</Link>{" "}
        <Link to="/login/success">Login Success</Link>
      </nav>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login/success" element={<LoginSuccess />} />
      </Routes>
    </div>
  );
}
