// admin.js
const API_BASE = "https://localhost:3000";
async function initAdminMenu() {
  const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
  if (!res.ok) return window.location.href = 'login.html';
  const { username, role } = await res.json();
  if (role !== 'admin') return window.location.href = 'index.html';
  //… construire le menu admin avec logout …
}
async function loadAdminData() {
  const res = await fetch(`${API_BASE}/admin/users`, { credentials: 'include' });
  const users = await res.json();
  const tbody = document.querySelector('#usersTable tbody');
  tbody.innerHTML = '';
  users.forEach(u => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${u.username}</td>
      <td>${u.consulted.join(', ')||'-'}</td>
      <td>${u.favorites.join(', ')||'-'}</td>
    `;
    tbody.appendChild(tr);
  });
}
window.addEventListener('DOMContentLoaded', async () => {
  await initAdminMenu();
  await loadAdminData();
});
