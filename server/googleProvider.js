import { OAuth2Client } from "google-auth-library";
export function googleProvider(
  { clientId, clientSecret, origin },
  { fetchImpl = fetch, verifyIdToken } = {},
) {
  const client = new OAuth2Client({
    clientId,
    clientSecret,
    transporterOptions: { timeout: 10000, retry: false },
  });
  const verify = verifyIdToken || client.verifyIdToken.bind(client);
  const redirect = origin + "/api/auth/google/callback";
  return {
    authorize({ state, nonce, code_challenge }) {
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      for (const [k, v] of Object.entries({
        client_id: clientId,
        redirect_uri: redirect,
        response_type: "code",
        scope: "openid profile",
        state,
        nonce,
        code_challenge,
        code_challenge_method: "S256",
        prompt: "select_account",
      }))
        url.searchParams.set(k, v);
      return url.href;
    },
    async verify({ code, verifier, nonce }) {
      const response = await fetchImpl("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          code_verifier: verifier,
          grant_type: "authorization_code",
          redirect_uri: redirect,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw Error("Google exchange failed");
      const { id_token } = await response.json();
      if (typeof id_token !== "string") throw Error("Missing identity");
      const ticket = await verify({ idToken: id_token, audience: clientId });
      const claims = ticket.getPayload();
      if (!claims?.sub || claims.nonce !== nonce)
        throw Error("Invalid Google identity");
      return { sub: claims.sub, name: claims.name };
    },
  };
}
