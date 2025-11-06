import axios from "axios";

const API_BASE_URL = "http://localhost:8000";

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("access_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If 401 and not already retried, try to refresh token
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem("refresh_token");
        if (refreshToken) {
          const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
            refresh_token: refreshToken,
          });

          const { access_token } = response.data;
          localStorage.setItem("access_token", access_token);

          originalRequest.headers.Authorization = `Bearer ${access_token}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        // Refresh failed, logout user
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("user");
        window.location.href = "/login";
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// ==================== AUTH APIs ====================
export const authAPI = {
  register: (data) => api.post("/auth/register", data),
  login: (data) => api.post("/auth/login", data),
  getCurrentUser: () => api.get("/auth/me"),
};

// ==================== SETTINGS APIs ====================
export const settingsAPI = {
  getSettings: () => api.get("/settings"),
  updateSettings: (data) => api.post("/settings", data),
  getSupportedModels: () => api.get("/settings/models"),
  deleteSettings: () => api.delete("/settings"),
};

// ==================== INGEST APIs ====================
export const ingestAPI = {
  ingestGuideline: (formData) =>
    api.post("/ingest/guideline", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),

  getStatus: (sessionId) => api.get(`/ingest/status/${sessionId}`),

  // Progress stream (EventSource, not axios)
  createProgressStream: (sessionId) => {
    return new EventSource(`${API_BASE_URL}/ingest/progress/${sessionId}`);
  },

  downloadResult: (sessionId) => {
    window.open(`${API_BASE_URL}/ingest/download/${sessionId}`, "_blank");
  },
};

// ==================== COMPARE APIs (Placeholder for future) ====================
export const compareAPI = {
  // Will be implemented later
};

export default api;
