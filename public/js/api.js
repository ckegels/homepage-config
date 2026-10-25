// Thin fetch wrapper. Every request carries X-HC-Request (CSRF guard on the server).
export class ApiError extends Error {
  constructor(status, data) {
    super(data?.error || `HTTP ${status}`);
    this.status = status;
    this.data = data;
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => (onUnauthorized = fn);

export async function api(path, { method = "GET", body, raw, headers = {} } = {}) {
  const opts = { method, credentials: "same-origin", headers: { "X-HC-Request": "1", ...headers } };
  if (raw !== undefined) {
    opts.body = raw;
    opts.headers["Content-Type"] = "application/octet-stream";
  } else if (body !== undefined) {
    opts.body = JSON.stringify(body);
    opts.headers["Content-Type"] = "application/json";
  }
  const res = await fetch(path, opts);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/api/auth/")) onUnauthorized();
    throw new ApiError(res.status, data);
  }
  return data;
}

export const get = (p) => api(p);
export const put = (p, body) => api(p, { method: "PUT", body });
export const post = (p, body) => api(p, { method: "POST", body: body ?? {} });
export const del = (p) => api(p, { method: "DELETE" });
