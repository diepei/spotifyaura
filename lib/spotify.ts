import "server-only";

const EMBED_BASE = "https://open.spotify.com/embed/track/";
const GRAPHQL_URL = "https://api-partner.spotify.com/pathfinder/v1/query";
const GET_TRACK_HASH = "612585ae06ba435ad26369870deaae23b5c8800a256cd8a57e08eddc25a37294";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

export type TrackStats = {
  id: string;
  name: string;
  artists: string[];
  album: string;
  albumYear: number | null;
  image: string;
  durationMs: number;
  playcount: number;
  spotifyUrl: string;
  fetchedAt: string;
  palette: {
    primary: string;
    secondary: string;
    accent: string;
  };
};

type SpotifyColor = { red?: number; green?: number; blue?: number };

type EmbedState = {
  props?: {
    pageProps?: {
      state?: {
        data?: {
          entity?: {
            id?: string;
            name?: string;
            artists?: Array<{ name?: string }>;
            duration?: number;
            visualIdentity?: {
              image?: Array<{ url?: string; maxWidth?: number }>;
              backgroundBase?: SpotifyColor;
              backgroundTintedBase?: SpotifyColor;
              textSubdued?: SpotifyColor;
            };
          };
        };
        settings?: { session?: { accessToken?: string } };
      };
    };
  };
};

type TrackGraphQL = {
  data?: {
    trackUnion?: {
      id?: string;
      name?: string;
      playcount?: string;
      duration?: { totalMilliseconds?: number };
      sharingInfo?: { shareUrl?: string };
      albumOfTrack?: {
        name?: string;
        date?: { year?: number };
        coverArt?: {
          sources?: Array<{ url?: string; width?: number }>;
          extractedColors?: { colorRaw?: { hex?: string } };
        };
      };
      firstArtist?: { items?: Array<{ profile?: { name?: string } }> };
    };
  };
  errors?: Array<{ message?: string }>;
};

export class SpotifyLookupError extends Error {
  constructor(
    message: string,
    public readonly status: number = 502,
  ) {
    super(message);
    this.name = "SpotifyLookupError";
  }
}

function spotifyColorToHex(color?: SpotifyColor): string | null {
  if (color?.red === undefined || color.green === undefined || color.blue === undefined) return null;
  return `#${[color.red, color.green, color.blue]
    .map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, "0"))
    .join("")}`;
}

function parseNextData(html: string): EmbedState {
  const match = html.match(
    /<script id=["']__NEXT_DATA__["'] type=["']application\/json["']>([\s\S]*?)<\/script>/,
  );
  if (!match) throw new SpotifyLookupError("Spotify did not return the song data.");

  try {
    return JSON.parse(match[1]) as EmbedState;
  } catch {
    throw new SpotifyLookupError("Spotify's response could not be interpreted.");
  }
}

function parseOpenGraphImage(html: string): string {
  const propertyFirst = html.match(
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  );
  const contentFirst = html.match(
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>/i,
  );
  return (propertyFirst?.[1] ?? contentFirst?.[1] ?? "").replaceAll("&amp;", "&");
}

async function spotifyFetch(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    headers: { "User-Agent": USER_AGENT, ...init?.headers },
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (!response.ok) {
    const status = response.status === 404 ? 404 : response.status === 429 ? 429 : 502;
    const message =
      status === 404
        ? "That song could not be found on Spotify."
        : status === 429
          ? "Spotify has temporarily limited requests. Try again in a few minutes."
          : "Spotify is not responding right now.";
    throw new SpotifyLookupError(message, status);
  }
  return response;
}

export async function fetchTrackStats(trackId: string): Promise<TrackStats> {
  const embedResponse = await spotifyFetch(`${EMBED_BASE}${trackId}`);
  const embedHtml = await embedResponse.text();
  const embed = parseNextData(embedHtml);
  const state = embed.props?.pageProps?.state;
  const token = state?.settings?.session?.accessToken;
  const embedTrack = state?.data?.entity;

  if (!token || !embedTrack?.id) {
    throw new SpotifyLookupError("An anonymous Spotify session could not be started.");
  }

  const graphqlResponse = await spotifyFetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Origin: "https://open.spotify.com",
      Referer: "https://open.spotify.com/",
    },
    body: JSON.stringify({
      variables: { uri: `spotify:track:${trackId}` },
      operationName: "getTrack",
      extensions: { persistedQuery: { version: 1, sha256Hash: GET_TRACK_HASH } },
    }),
  });
  const result = (await graphqlResponse.json()) as TrackGraphQL;
  const track = result.data?.trackUnion;
  const playcount = Number(track?.playcount);

  if (!track?.id || !Number.isSafeInteger(playcount)) {
    throw new SpotifyLookupError(
      result.errors?.[0]?.message || "Spotify has not published a stream count for this song.",
    );
  }

  const covers = track.albumOfTrack?.coverArt?.sources ?? [];
  const image = [...covers].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ??
    [...(embedTrack.visualIdentity?.image ?? [])].sort(
      (a, b) => (b.maxWidth ?? 0) - (a.maxWidth ?? 0),
    )[0]?.url ?? parseOpenGraphImage(embedHtml);
  const visualIdentity = embedTrack.visualIdentity;
  const primary = track.albumOfTrack?.coverArt?.extractedColors?.colorRaw?.hex ??
    spotifyColorToHex(visualIdentity?.backgroundBase) ?? "#6754d9";
  const secondary = spotifyColorToHex(visualIdentity?.backgroundTintedBase) ?? primary;
  const accent = spotifyColorToHex(visualIdentity?.textSubdued) ?? "#f1d3a7";
  const artists = Array.from(new Set([
    ...(embedTrack.artists ?? []).map((artist) => artist.name),
    ...(track.firstArtist?.items ?? []).map((artist) => artist.profile?.name),
  ].filter((name): name is string => Boolean(name))));

  return {
    id: track.id,
    name: track.name ?? embedTrack.name ?? "Spotify song",
    artists,
    album: track.albumOfTrack?.name ?? "Spotify",
    albumYear: track.albumOfTrack?.date?.year ?? null,
    image,
    durationMs: track.duration?.totalMilliseconds ?? embedTrack.duration ?? 0,
    playcount,
    spotifyUrl: track.sharingInfo?.shareUrl ?? `https://open.spotify.com/track/${trackId}`,
    fetchedAt: new Date().toISOString(),
    palette: { primary, secondary, accent },
  };
}
