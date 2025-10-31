export default function stripOAuthParams() {
  try {
    const url = new URL(window.location.href);
    let changed = false;

    ["code", "state", "provider", "error", "error_description"].forEach((p) => {
      if (url.searchParams.has(p)) {
        url.searchParams.delete(p);
        changed = true;
      }
    });

    if (url.hash && /access_token|refresh_token|error/i.test(url.hash)) {
      url.hash = "";
      changed = true;
    }

    if (changed) window.history.replaceState({}, document.title, url.toString());
  } catch {
    /* noop */
  }
}
