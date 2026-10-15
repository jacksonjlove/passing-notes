import { createHash, timingSafeEqual } from "node:crypto";

const challenge = 'Basic realm="Passing Notes", charset="UTF-8"';
const digest = (value) => createHash("sha256").update(value).digest();

function credentialsFromHeader(header) {
  if (typeof header !== "string") return null;
  const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(header);
  if (!match) return null;
  const encoded = match[1];
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.toString("base64") !== encoded) return null;
  const separator = decoded.indexOf(":");
  if (separator < 0) return null;
  return [
    decoded.subarray(0, separator).toString("utf8"),
    decoded.subarray(separator + 1).toString("utf8"),
  ];
}

export function basicAuth({ username, password }) {
  if (typeof username !== "string" || typeof password !== "string")
    throw new TypeError("basicAuth requires a username and password");
  const expectedUsername = digest(username);
  const expectedPassword = digest(password);

  return (req, res, next) => {
    const supplied = credentialsFromHeader(req.headers.authorization);
    const actualUsername = digest(supplied?.[0] ?? "");
    const actualPassword = digest(supplied?.[1] ?? "");
    const usernameMatches = timingSafeEqual(actualUsername, expectedUsername);
    const passwordMatches = timingSafeEqual(actualPassword, expectedPassword);
    const valid = supplied !== null && usernameMatches && passwordMatches;
    if (!valid) {
      res.set("WWW-Authenticate", challenge);
      return res.status(401).end();
    }
    next();
  };
}
