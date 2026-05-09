import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080';

const api = axios.create({ baseURL: BASE });

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('nx_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('nx_token');
      window.location.href = '/';
    }
    return Promise.reject(err);
  }
);

export const authApi = {
  login: (email: string, password: string) =>
    api.post('/api/auth/login', { email, password }),
  register: (email: string, password: string) =>
    api.post('/api/auth/register', { email, password }),
  me: () => api.get('/api/me'),
};

export const metricsApi = {
  historical: (params?: { node?: string; from?: string; to?: string }) =>
    api.get('/api/metrics', { params }),
  nodes: () => api.get<string[]>('/api/nodes'),
  processes: (node: string) => api.get(`/api/processes/${node}`),
};

export const alertsApi = {
  list: () => api.get('/api/alerts'),
  rules: () => api.get('/api/alerts/rules'),
  createRule: (rule: Partial<AlertRule>) => api.post('/api/alerts/rules', rule),
  updateRule: (id: number, rule: Partial<AlertRule>) => api.put(`/api/alerts/rules/${id}`, rule),
  deleteRule: (id: number) => api.delete(`/api/alerts/rules/${id}`),
  resolve: (id: number) => api.post(`/api/alerts/${id}/resolve`),
};

export interface AlertRule {
  id?: number;
  name: string;
  metric: 'cpu' | 'mem' | 'disk';
  threshold: number;
  duration: number;
  enabled: boolean;
  webhook: string;
}

export interface AlertEvent {
  id: number;
  rule_id: number;
  node_id: string;
  value: number;
  message: string;
  severity: 'critical' | 'warning' | 'info';
  resolved: boolean;
  created_at: string;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
}

export { api };
