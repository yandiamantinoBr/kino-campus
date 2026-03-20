/* KinoCampus - Toast Component */
// -----------------------------
// Toast
// -----------------------------
function showToast(message, type = 'info', duration = 3000) {
  const existing = document.querySelector('.kc-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `kc-toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 250);
  }, duration);
}
