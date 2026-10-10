const UPSTREAM = process.env.API_URL ?? "http://127.0.0.1:8000";
const DROP_REQUEST = new Set([
  "host",
  "connection",
  "content-length",
  "cookie",
]);
const DROP_RESPONSE = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
]);

type Context = { params: Promise<{ path: string[] }> };

async function proxy(request: Request, { params }: Context) {
  const { path } = await params;
  const { search } = new URL(request.url);
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!DROP_REQUEST.has(key)) headers.set(key, value);
  });
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    signal: request.signal,
    redirect: "manual",
  };
  if (hasBody) init.duplex = "half";
  let upstream: Response;
  try {
    upstream = await fetch(
      `${UPSTREAM}/${path.map(encodeURIComponent).join("/")}${search}`,
      init,
    );
  } catch {
    return Response.json(
      { detail: "The audit service is not reachable" },
      { status: 502 },
    );
  }
  const out = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!DROP_RESPONSE.has(key)) out.set(key, value);
  });
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export {
  proxy as DELETE,
  proxy as GET,
  proxy as PATCH,
  proxy as POST,
  proxy as PUT,
};
