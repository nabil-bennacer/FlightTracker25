import { API_BASE } from './config.js';

// Ici, on gère tout ce qui est lié à l'admin sur le site

async function initAdminMenu() {
  const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
  if (!res.ok) return globalThis.location.href = 'login.html';
  const { username, role } = await res.json();
  if (role !== 'admin') return globalThis.location.href = 'index.html'; 
  document.getElementById('adminUsername').textContent = `Admin: ${username}`;
  
  document.getElementById('logoutBtn')?.addEventListener('click', async (e) => {
    e.preventDefault();
    await fetch(`${API_BASE}/logout`, {
      method: 'POST', 
      credentials: 'include' });
    globalThis.location.href = 'index.html';
  });
}
async function loadAdminData() {
  const res = await fetch(`${API_BASE}/admin/users`, { credentials: 'include' });
  const users = await res.json();
  const tbody = document.querySelector('#usersTable tbody');
  tbody.innerHTML = '';  users.forEach(u => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${u.username}</td>
      <td>${u.consulted.join(', ')||'-'}</td>
      <td>${u.favorites.join(', ')||'-'}</td>
    `;
    tbody.appendChild(tr);
  });
}

globalThis.addEventListener('DOMContentLoaded', async () => {
  await initAdminMenu();
  await loadAdminData();
});