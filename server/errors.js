export function fail(status, message, code = String(status)) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  throw error;
}
export const route = (handler) => (req, res, next) =>
  Promise.resolve()
    .then(() => handler(req, res))
    .catch(next);
export function text(value, min, max, label) {
  if (
    typeof value !== "string" ||
    [...value.trim()].length < min ||
    [...value.trim()].length > max
  )
    fail(400, `${label} must be ${min}–${max} characters.`);
  return value.trim();
}
