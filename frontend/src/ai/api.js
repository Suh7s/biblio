import axios from "axios";
import { api } from "../api.js";

// Reuse the shared Axios client's base URL and HTTP-only cookie credentials.
export async function aiRequest(method, path, input, signal) {
  const response = await api.request({
    method,
    url: `/ai${path}`,
    signal,
    timeout: 60000,
    ...(method === "get" ? { params: input } : { data: input }),
  });
  return response.data.data;
}
export const isCanceled = axios.isCancel;
export function errorMessage(error) {
  if (error.response?.status === 401)
    return "Please sign in to your library account, then try again.";
  if (error.response?.status === 403)
    return "Your account does not have access to this feature.";
  if (error.response?.status === 429)
    return "You’ve made several requests. Wait a minute, then try again.";
  return (
    error.response?.data?.message ||
    "We couldn’t reach LibraAI. Check your connection and try again."
  );
}
