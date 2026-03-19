const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

export const API_BASE = isLocalhost 
  ? "https://localhost:3000" 
  : "https://144.24.192.86:3000"; 