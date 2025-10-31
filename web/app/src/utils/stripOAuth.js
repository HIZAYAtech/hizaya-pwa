// Nettoie ?code=... & ?state=... et les fragments d'erreur, tout en conservant le #/route
export default function stripOAuth() {
  try {
    const url = new URL(window.location.href);
    let changed = false;

    ["code", "state", "error", "error_description", "provider"].forEach((p) => {
      if (url.searchParams.has(p)) {
        url.searchParams.delete(p);
        changed = true;
      }
    });

    // si des tokens sont dans le hash (rare en PKCE), on les enlève
    if (url.hash && /(access_token|refresh_token|error)=/i.test(url.hash)) {
      // on conserve uniquement la partie route avant le '?'
      const frag = url.hash.split("?")[0];
      url.hash = frag;
      changed = true;
    }

    if (changed) {
      window.history.replaceState({}, document.title, url.toString());
    }
  } catch (_) {}
}
