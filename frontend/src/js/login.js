// static_html_server/front_end/login.js
document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
  
    try {
      const res = await fetch("https://localhost:3000/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include"
      });
  
      if (res.ok) {
        window.location.href = "index.html";
      } else {
        alert("❌ Identifiants invalides");
      }
    } catch (err) {
      alert("❌ Erreur réseau : " + err.message);
    }
  });
  