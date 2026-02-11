export async function GET(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (!code || !state) {
      return new Response("Missing code/state", { status: 400 });
    }

    return new Response(
      `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>HubSpot connected</title></head>
  <body>
    <p>Почти готово. Возвращаемся в Wix…</p>
    <script>
      (function () {
        try {
          // We can't rely on Wix auth in this callback request (HubSpot redirects directly).
          // Send the code/state to the dashboard page, which will finish OAuth using fetchWithAuth().
          window.opener && window.opener.postMessage(
            { type: "hubspot_oauth_callback", code: ${JSON.stringify(code)}, state: ${JSON.stringify(state)} },
            "*"
          );
        } catch {}
        setTimeout(function () { window.close(); }, 250);
      })();
    </script>
  </body>
</html>`,
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  } catch (err) {
    console.error("OAuth callback failed.");
    return new Response("Internal server error", { status: 500 });
  }
}

