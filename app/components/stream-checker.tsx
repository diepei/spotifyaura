"use client";
/* eslint-disable @next/next/no-img-element */

import Image from "next/image";
import { CSSProperties, FormEvent, ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Disc3,
  Download,
  LoaderCircle,
  Music2,
} from "lucide-react";
import type { TrackStats } from "@/lib/spotify";

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-ES").format(value);
}

function formatDuration(milliseconds: number) {
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1_000);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(blob);
  });
}

function waitForImage(image: HTMLImageElement): Promise<void> {
  if (image.complete && image.naturalWidth > 0) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const handleLoad = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("Cover could not be decoded."));
    };
    const cleanup = () => {
      image.removeEventListener("load", handleLoad);
      image.removeEventListener("error", handleError);
    };

    image.addEventListener("load", handleLoad, { once: true });
    image.addEventListener("error", handleError, { once: true });
  });
}

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function AutoFitTileBottom({
  label,
  children,
  className = "",
  maxFontSize = 24,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  maxFontSize?: number;
}) {
  const contentRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const content = contentRef.current;
    const container = content?.parentElement;
    if (!content || !container) return;

    const fitContent = () => {
      let fontSize = maxFontSize;
      content.style.fontSize = `${fontSize}px`;

      while (
        fontSize > 10 &&
        (content.scrollHeight > content.clientHeight + 1 ||
          content.scrollWidth > content.clientWidth + 1)
      ) {
        fontSize -= 0.5;
        content.style.fontSize = `${fontSize}px`;
      }
    };

    fitContent();
    const resizeObserver = new ResizeObserver(fitContent);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [children, maxFontSize]);

  return (
    <div className="tile-bottom auto-fit-tile-bottom">
      <span>{label}</span>
      <strong ref={contentRef} className={className}>{children}</strong>
    </div>
  );
}

function AutoFitValue({ children }: { children: ReactNode }) {
  const valueRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const value = valueRef.current;
    const container = value?.parentElement;
    if (!value || !container) return;

    const fitValue = () => {
      let fontSize = 34;
      value.style.fontSize = `${fontSize}px`;

      while (fontSize > 10 && value.scrollWidth > value.clientWidth + 1) {
        fontSize -= 0.5;
        value.style.fontSize = `${fontSize}px`;
      }
    };

    fitValue();
    const resizeObserver = new ResizeObserver(fitValue);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [children]);

  return <strong ref={valueRef}>{children}</strong>;
}

export function StreamChecker() {
  const [url, setUrl] = useState("");
  const [track, setTrack] = useState<TrackStats | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [resultLocked, setResultLocked] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!track) return;

    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [track]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch(`/api/track?url=${encodeURIComponent(url)}`);
      const data = (await response.json()) as TrackStats | { error: string };
      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "Unexpected error");
      }
      setResultLocked(true);
      setTrack(data);
    } catch (requestError) {
      setTrack(null);
      setError(requestError instanceof Error ? requestError.message : "The request could not be completed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload() {
    if (!dashboardRef.current || !track) return;
    const dashboard = dashboardRef.current;
    setError("");
    setDownloading(true);
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    dashboard.classList.add("exporting");
    const coverImages = Array.from(
      dashboard.querySelectorAll<HTMLImageElement>("img.song-cover-image"),
    );
    const originalCoverStyles = coverImages.map((image) => ({
      image,
      display: image.style.display,
      container: image.parentElement,
      backgroundImage: image.parentElement?.style.backgroundImage ?? "",
      backgroundPosition: image.parentElement?.style.backgroundPosition ?? "",
      backgroundSize: image.parentElement?.style.backgroundSize ?? "",
    }));

    try {
      if (coverUrl && coverImages.length > 0) {
        const coverResponse = await fetch(coverUrl, { cache: "no-store" });
        if (!coverResponse.ok) throw new Error("Cover could not be loaded.");
        const inlineCover = await blobToDataUrl(await coverResponse.blob());

        coverImages.forEach((image) => {
          const container = image.parentElement;
          if (!container) return;

          // WebKit can omit raster <img> elements while html-to-image renders its
          // temporary foreignObject. An inline CSS background survives that path.
          container.style.backgroundImage = `url("${inlineCover}")`;
          container.style.backgroundPosition = "center";
          container.style.backgroundSize = "cover";
          image.style.display = "none";
        });
      }

      const panelImages = Array.from(
        dashboard.querySelectorAll<HTMLImageElement>("img:not(.song-cover-image)"),
      );
      await Promise.all(panelImages.map(waitForImage));
      await waitForPaint();
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(dashboard, {
        backgroundColor: "#0b0710",
        cacheBust: true,
        pixelRatio: 1080 / dashboard.offsetWidth,
        filter: (node) =>
          !(node instanceof HTMLElement && node.classList.contains("no-capture")),
      });
      const imageBlob = await (await fetch(dataUrl)).blob();
      const downloadUrl = URL.createObjectURL(imageBlob);
      const link = document.createElement("a");
      const fileName = track.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      link.download = `${fileName || "spotify"}-flex-your-spotify.png`;
      link.href = downloadUrl;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 60_000);
    } catch {
      setError("Your Spotify story could not be downloaded.");
    } finally {
      originalCoverStyles.forEach(({
        image,
        display,
        container,
        backgroundImage,
        backgroundPosition,
        backgroundSize,
      }) => {
        image.style.display = display;
        if (!container) return;
        container.style.backgroundImage = backgroundImage;
        container.style.backgroundPosition = backgroundPosition;
        container.style.backgroundSize = backgroundSize;
      });
      dashboard.classList.remove("exporting");
      setDownloading(false);
    }
  }

  function handleSearchAgain() {
    setResultLocked(false);
    setTrack(null);
    setError("");
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  const themeColors = track
    ? ({
        "--theme-primary": track.palette.primary,
        "--theme-secondary": track.palette.secondary,
        "--theme-accent": track.palette.accent,
      } as CSSProperties)
    : undefined;
  const coverUrl = track?.image ? `/api/cover?url=${encodeURIComponent(track.image)}` : "";

  return (
    <main className={track && resultLocked ? "has-result" : undefined}>
      <section className="landing" aria-labelledby="landing-title">
        <form className="search-form" onSubmit={handleSubmit}>
          <p id="landing-title">Farm Aura From Your Song Streams.</p>
          <div className="search-input">
            <Music2 size={16} aria-hidden="true" />
            <input
              aria-label="Spotify song URL"
              type="text"
              inputMode="url"
              placeholder="Enter a Spotify song URL"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              autoComplete="off"
              aria-describedby={error ? "form-error" : undefined}
            />
            <button type="submit" aria-label="Generate Spotify Aura" disabled={loading || !url.trim()}>
              {loading ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={18} />}
            </button>
          </div>
          <div className="search-caption">
            <span>Generate. Download. Share.</span>
          </div>
          {error ? <p className="error" id="form-error" role="alert">{error}</p> : null}
        </form>
      </section>

      {track ? (
        <section className="result-page" aria-labelledby="result-title">
          <div className="dashboard" ref={dashboardRef} style={themeColors} aria-live="polite">
            <div className="story-glow story-glow-one" aria-hidden="true" />
            <div className="story-glow story-glow-two" aria-hidden="true" />
            <div className="dashboard-heading">
              <div className="mini-cover">
                {coverUrl ? (
                  <img className="song-cover-image" src={coverUrl} alt="" />
                ) : <Disc3 />}
              </div>
              <div>
                <span>Spotify Aura</span>
                <h1 id="result-title">{track.name}</h1>
              </div>
            </div>

            <div className="panel-grid">
              <article className="tile cover-tile">
                {coverUrl ? (
                  <img
                    className="song-cover-image"
                    src={coverUrl}
                    alt={`${track.album} cover`}
                  />
                ) : <Disc3 size={52} />}
                <div className="cover-shade" />
                <AutoFitTileBottom label="Now analyzing" maxFontSize={28}>PLAYING</AutoFitTileBottom>
              </article>

              <article className="tile streams-tile">
                <Image
                  className="panel-background"
                  src="/panel-backgrounds/streams.svg"
                  alt=""
                  width={217}
                  height={235}
                  unoptimized
                  style={{ position: "absolute", inset: "-2%", width: "104%", height: "104%", maxWidth: "none", objectFit: "fill" }}
                />
                <div className="stream-content">
                  <p>Total streams</p>
                  <AutoFitValue>{formatNumber(track.playcount)}</AutoFitValue>
                  <span>plays on Spotify</span>
                </div>
              </article>

              <article className="tile track-tile">
                <Image className="panel-background" src="/panel-backgrounds/track.svg" alt="" fill unoptimized />
                <AutoFitTileBottom label="Track">{track.name}</AutoFitTileBottom>
              </article>

              <article className="tile artist-tile">
                <Image className="panel-background" src="/panel-backgrounds/artist.svg" alt="" fill unoptimized />
                <AutoFitTileBottom label="Artist" className="artist-list">
                  {track.artists.map((artist) => <span key={artist}>{artist}</span>)}
                </AutoFitTileBottom>
              </article>

              <article className="tile album-tile">
                <Image className="panel-background" src="/panel-backgrounds/album.svg" alt="" fill unoptimized />
                <AutoFitTileBottom label="Album">{track.album}</AutoFitTileBottom>
              </article>

              <article className="tile duration-tile">
                <Image className="panel-background" src="/panel-backgrounds/duration.svg" alt="" fill unoptimized />
                <AutoFitTileBottom label="Duration">{formatDuration(track.durationMs)}</AutoFitTileBottom>
              </article>

              <article className="tile year-tile">
                <Image className="panel-background" src="/panel-backgrounds/released.svg" alt="" fill unoptimized />
                <AutoFitTileBottom label="Released">{track.albumYear ?? "—"}</AutoFitTileBottom>
              </article>

            </div>

            <div className="dashboard-footer no-capture">
              <button className="search-again" type="button" onClick={handleSearchAgain}>Search another song ↑</button>
              <button className="download-story" type="button" onClick={handleDownload} disabled={downloading}>
                {downloading ? <LoaderCircle className="spin" size={15} /> : <Download size={15} />}
                {downloading ? "Preparing download" : "Download Your Spotify Flex"}
              </button>
            </div>
          </div>
          {error ? <p className="download-error" role="alert">{error}</p> : null}
        </section>
      ) : null}
    </main>
  );
}
