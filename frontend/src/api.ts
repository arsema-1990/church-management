import axios from 'axios';

export const api = axios.create({ baseURL: '/api', headers: { 'Content-Type': 'application/json' } });
api.interceptors.request.use(config => {
  const token = sessionStorage.getItem('church-token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
export function messageFromError(error: unknown) {
  if (axios.isAxiosError(error)) return error.response?.data?.error ?? 'Could not reach the church service.';
  return error instanceof Error ? error.message : 'Something went wrong.';
}
