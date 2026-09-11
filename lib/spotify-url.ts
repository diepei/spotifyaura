const TRACK_ID_PATTERN = /^[A-Za-z0-9]{22}$/;
const SPOTIFY_HOSTS = new Set(["open.spotify.com", "play.spotify.com"]);

export function extractTrackId(input: string): string | null {
  const value = input.trim();

  if (TRACK_ID_PATTERN.test(value)) return value;

  const uriMatch = value.match(/^spotify:track:([A-Za-z0-9]{22})$/i);
  if (uriMatch) return uriMatch[1];

  try {
    const url = new URL(value);
    if (!SPOTIFY_HOSTS.has(url.hostname)) {
      return null;
    }

    const segments = url.pathname.split("/").filter(Boolean);
    const trackIndex = segments.indexOf("track");
    const id = trackIndex >= 0 ? segments[trackIndex + 1] : undefined;
    return id && TRACK_ID_PATTERN.test(id) ? id : null;
  } catch {
    return null;
  }
}

export async function resolveTrackId(input: string): Promise<string | null> {
  const directId = extractTrackId(input);
  if (directId) return directId;

  let currentUrl: URL;
  try {
    currentUrl = new URL(input.trim());
  } catch {
    return null;
  }

  const segments = currentUrl.pathname.split("/").filter(Boolean);
  if (
    currentUrl.protocol !== "https:" ||
    currentUrl.hostname !== "open.spotify.com" ||
    segments[0] !== "s" ||
    !segments[1]
  ) {
    return null;
  }

  for (let redirectCount = 0; redirectCount < 5; redirectCount += 1) {
    const response = await fetch(currentUrl, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    const location = response.headers.get("location");
    if (!location) return extractTrackId(response.url);

    const nextUrl = new URL(location, currentUrl);
    if (nextUrl.protocol !== "https:" || !SPOTIFY_HOSTS.has(nextUrl.hostname)) return null;

    const redirectedId = extractTrackId(nextUrl.toString());
    if (redirectedId) return redirectedId;
    currentUrl = nextUrl;
  }

  return null;
}
