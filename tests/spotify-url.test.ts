import test from "node:test";
import assert from "node:assert/strict";
import { extractTrackId, resolveTrackId } from "../lib/spotify-url.ts";

const id = "4cOdK2wGLETKBW3PvgPWqT";

test("extracts track IDs from supported Spotify formats", () => {
  assert.equal(extractTrackId(`https://open.spotify.com/track/${id}?si=abc`), id);
  assert.equal(extractTrackId(`https://open.spotify.com/intl-es/track/${id}`), id);
  assert.equal(extractTrackId(`spotify:track:${id}`), id);
  assert.equal(extractTrackId(id), id);
});

test("rejects non-track and untrusted URLs", () => {
  assert.equal(extractTrackId(`https://example.com/track/${id}`), null);
  assert.equal(extractTrackId("https://open.spotify.com/album/123"), null);
  assert.equal(extractTrackId("not-a-spotify-url"), null);
});

test("resolves Spotify mobile short links", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, {
    status: 302,
    headers: { location: `https://open.spotify.com/track/${id}?si=mobile` },
  });

  try {
    assert.equal(await resolveTrackId("https://open.spotify.com/s/Jgg6354"), id);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects short links that redirect outside Spotify", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, {
    status: 302,
    headers: { location: "https://example.com/track/not-spotify" },
  });

  try {
    assert.equal(await resolveTrackId("https://open.spotify.com/s/Jgg6354"), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
