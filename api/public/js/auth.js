// Authentication handling

function initAuth() {
  const tabs = document.querySelectorAll('.tab-btn');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');

  // Tab switching
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      if (tabName === 'login') {
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
      } else {
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
      }
    });
  });

  // Login form
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');

    try {
      errorEl.textContent = '';
      const result = await api.login(email, password);
      showMainView(result.user);
    } catch (error) {
      errorEl.textContent = error.message;
    }
  });

  // Register form
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const confirm = document.getElementById('register-confirm').value;
    const errorEl = document.getElementById('register-error');

    if (password !== confirm) {
      errorEl.textContent = 'Passwords do not match';
      return;
    }

    try {
      errorEl.textContent = '';
      const result = await api.register(email, password);
      showMainView(result.user);
    } catch (error) {
      errorEl.textContent = error.message;
    }
  });

  // Logout button
  document.getElementById('logout-btn').addEventListener('click', () => {
    api.logout();
    showAuthView();
  });
}

function showAuthView() {
  document.getElementById('auth-view').classList.remove('hidden');
  document.getElementById('main-view').classList.add('hidden');
  
  // Clear forms
  document.getElementById('login-form').reset();
  document.getElementById('register-form').reset();
  document.getElementById('login-error').textContent = '';
  document.getElementById('register-error').textContent = '';
}

function showMainView(user) {
  document.getElementById('auth-view').classList.add('hidden');
  document.getElementById('main-view').classList.remove('hidden');
  document.getElementById('user-email').textContent = user.email;
  
  // Load dashboard
  loadDashboard();
}

async function checkAuth() {
  if (!api.isAuthenticated()) {
    showAuthView();
    return;
  }

  try {
    const user = await api.getMe();
    showMainView(user);
  } catch (error) {
    api.logout();
    showAuthView();
  }
}
