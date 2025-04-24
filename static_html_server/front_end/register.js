// static_html_server/front_end/register.js
document.getElementById("registerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("username").value;
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
  
    try {
      const res = await fetch("https://localhost:3000/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
        credentials: "include"
      });
  
      const data = await res.json();
      if (res.ok) {
        alert("✅ Inscription réussie ! Vous pouvez maintenant vous connecter.");
        window.location.href = "login.html";
      } else {
        alert("❌ Erreur : " + (data.error || "Échec de l'inscription."));
      }
    } catch (err) {
      alert("❌ Erreur réseau : " + err.message);
    }
  });
  