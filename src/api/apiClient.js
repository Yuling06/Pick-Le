// Self-hosted replacement for the old @apiClient/sdk client.
// Talks to the Express + PostgreSQL backend in /server.

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const TOKEN_KEY = 'pickle_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
const clearToken = () => localStorage.removeItem(TOKEN_KEY);

// Files (avatars, clothing photos, etc.) are stored as /api/files/:id - a path relative
// to the EXPRESS backend, not the Vite dev server the React app is served from. Anywhere
// one of these URLs is rendered directly (<img>, GLTFLoader, an <a href>, ...), it needs
// to go through this so it resolves to the right origin instead of 404ing against Vite.
export function resolveFileUrl(url) {
  if (!url) return url;
  if (url.startsWith('/api/')) return `${API_URL}${url}`;
  return url; // already absolute (e.g. an external URL), leave it alone
}

async function request(path, { method = 'GET', body, isFormData = false } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!isFormData && body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: isFormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore non-JSON error bodies
    }
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }

  if (res.status === 204) return null;
  return res.json();
}

function toQueryString(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

function makeEntity(resource) {
  return {
    list: (sort) => request(`/api/${resource}${toQueryString({ sort })}`),
    filter: (query = {}, sort) => request(`/api/${resource}${toQueryString({ ...query, sort })}`),
    create: (data) => request(`/api/${resource}`, { method: 'POST', body: data }),
    update: (id, data) => request(`/api/${resource}/${id}`, { method: 'PUT', body: data }),
    delete: (id) => request(`/api/${resource}/${id}`, { method: 'DELETE' }),
  };
}

export const apiClient = {
  auth: {
    async me() {
      return request('/api/auth/me');
    },
    async login(email, password) {
      const data = await request('/api/auth/login', { method: 'POST', body: { email, password } });
      setToken(data.token);
      return data.user;
    },
    async signup(email, password, gender) {
      const data = await request('/api/auth/signup', { method: 'POST', body: { email, password, gender } });
      setToken(data.token);
      return data.user;
    },
    logout(redirectUrl) {
      clearToken();
      if (redirectUrl) window.location.href = redirectUrl;
    },
    redirectToLogin() {
      window.location.href = '/login';
    },
  },

  entities: {
    UserProfile: makeEntity('user-profiles'),
    FitRequest: makeEntity('fit-requests'),
    FitResult: makeEntity('fit-results'),
    FeedbackSurvey: makeEntity('feedback-surveys'),
    User: { list: () => request('/api/users') },
  },

  integrations: {
    Core: {
      async UploadFile({ file }) {
        const formData = new FormData();
        formData.append('file', file);
        return request('/api/upload', { method: 'POST', body: formData, isFormData: true });
      },
    },
  },

  bodyScan: {
    // payload: { height_cm, weight_kg, front: {...}, side: {...} } - see server/src/routes/bodyScan.js
    async submit(payload) {
      return request('/api/body-scan', { method: 'POST', body: payload });
    },
  },
};
