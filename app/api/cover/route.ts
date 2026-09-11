import { NextRequest, NextResponse } from "next/server";

const ALLOWED_COVER_HOSTS = ["scdn.co", "spotifycdn.com"];

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("url");

  try {
    const url = new URL(source ?? "");
    const allowedHost = ALLOWED_COVER_HOSTS.some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
    );

    if (url.protocol !== "https:" || !allowedHost) {
      return NextResponse.json({ error: "Invalid cover URL." }, { status: 400 });
    }

    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
      return NextResponse.json({ error: "Cover could not be loaded." }, { status: 502 });
    }

    return new NextResponse(await response.arrayBuffer(), {
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Invalid cover URL." }, { status: 400 });
  }
}
