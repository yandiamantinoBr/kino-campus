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
  // Accessible status for assistive tech (publish, help, comments, etc.).
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.setAttribute('aria-atomic', 'true');
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

// Classic script: keep window binding explicit for controllers that call window.showToast.
try {
  if (typeof window !== 'undefined') window.showToast = showToast;
} catch (_) { /* ignore */ }
