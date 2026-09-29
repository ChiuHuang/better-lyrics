import { AppState } from "@core/appState";
import { type LogSink, logCore } from "@core/logger";
import { applyLyricDecorations } from "@modules/lyrics/lyricDecorations";
import { currentViewLyrics } from "@modules/lyrics/viewLyrics";
import { currentTickOptions, lyricsElementAdded } from "@modules/ui/mainLyricsView";
import { isAdPlaying } from "@modules/ui/playerControls/playerBarControls";
import { createLyricsRenderer, type LyricsRenderer } from "@braccato/core";
import { decorateEndCard } from "./endCard";
import { syncMicButton } from "./micButton";
import { karaokeOverlay } from "./overlay";
import { persistKaraokeEnabled } from "./settings";
import { isKaraokeActive, isKaraokeWanted, syncKaraokeAttribute } from "./state";

// -- The karaoke view --------------------------

/**
 * The second lyrics view, shown over a fullscreen music video. Created at import time like the
 * side panel's, with no mount and nothing read from AppState: the overlay it builds into is made on
 * first use, and `syncKaraoke` applies the settings.
 */
const karaokeView: Omit<LyricsRenderer, "destroy"> = createLyricsRenderer({
  document,
  window,
  layout: "stage",
  host: {
    isViewVisible: isKaraokeActive,
    syncAdState: () => isAdPlaying(document),
    get log(): LogSink {
      return logCore;
    },
    onStageLayout: box => karaokeOverlay.setPlateBox(box),
  },
});

let builtFrom: object | null = null;
let builtSegmentMap: object | null = null;
let firstSungLineStartS = Number.POSITIVE_INFINITY;
let isStagePreview: boolean | null = null;
let wasActive = false;

function clearKaraokeLyrics(): void {
  karaokeView.clear();
  builtFrom = null;
  builtSegmentMap = null;
  firstSungLineStartS = Number.POSITIVE_INFINITY;
}

/**
 * Builds the karaoke view from the lyrics every secondary view shares, or hangs the latest
 * decorations off the lines it already built. Only while karaoke is wanted, so a listener who
 * never enters fullscreen video never pays for a second build.
 */
function publishKaraokeLyrics(): void {
  const source = AppState.parsedLyrics;
  const view = currentViewLyrics();
  if (!view.lyrics || view.noLyrics) {
    if (builtFrom !== null) clearKaraokeLyrics();
    return;
  }
  if (!isKaraokeWanted()) return;

  const segmentMap = source?.segmentMap ?? null;
  if (source !== builtFrom || segmentMap !== builtSegmentMap) {
    const wantsEndCard = AppState.karaokeCredits === "auto" || AppState.karaokeCredits === "outro";
    karaokeView.setLyrics(view.lyrics, {
      mount: karaokeOverlay.ensureMount(),
      language: view.language,
      songwriters: wantsEndCard ? view.songwriters : [],
    });
    builtFrom = source;
    builtSegmentMap = segmentMap;
    const firstSung = karaokeView.lines.find(line => line.lyricElement.dataset.instrumental !== "true");
    firstSungLineStartS = firstSung?.time ?? Number.POSITIVE_INFINITY;
    karaokeOverlay.setTitleCard({
      title: AppState.lyricData?.song ?? "",
      artist: AppState.lyricData?.artist ?? "",
      songwriters: view.songwriters ?? [],
    });
    decorateEndCard(karaokeView.container);
  }
  applyLyricDecorations(karaokeView, view.decorations);
  karaokeView.scheduleLyricPositionUpdate(isKaraokeActive, tickKaraokeNow);
}

// -- Ticking --------------------------

let lastTick: { timeS: number; wallTime: number; isPlaying: boolean } | null = null;

/**
 * Renders the karaoke view at the side panel's time, on the side panel's frame. Run before the
 * side panel's own tick: braccato's playback clock is shared, and whichever view ticks first is the
 * one that sees a seek as a jump and re-lays its stage with no animation.
 */
export function tickKaraoke(timeS: number, wallTime: number, isPlaying: boolean): void {
  lastTick = { timeS, wallTime, isPlaying };
  karaokeOverlay.update(timeS, firstSungLineStartS);
  karaokeView.tick(timeS, currentTickOptions(wallTime, isPlaying));
}

function tickKaraokeNow(): void {
  if (lastTick) tickKaraoke(lastTick.timeS, lastTick.wallTime, lastTick.isPlaying);
}

function relayoutKaraoke(): void {
  karaokeView.relayout();
  tickKaraokeNow();
}

// -- Sync --------------------------

/**
 * Brings karaoke in line with everything it depends on. Called from every point where one of those
 * changed: settings, fullscreen, video mode, ads, and every lyrics publish.
 */
export function syncKaraoke(): void {
  const active = syncKaraokeAttribute();
  karaokeOverlay.applySettings();

  const preview = AppState.karaokeLayout === "rolling";
  if (preview !== isStagePreview) {
    isStagePreview = preview;
    karaokeView.setStageOptions({ preview });
  }

  if (active) publishKaraokeLyrics();
  else if (!AppState.parsedLyrics && builtFrom !== null) clearKaraokeLyrics();
  karaokeOverlay.setVisible(active, relayoutKaraoke);

  syncMicButton(toggleKaraoke);

  if (active !== wasActive) {
    wasActive = active;
    // Each view was off the screen while the other one showed, so neither kept its measurements.
    if (active) relayoutKaraoke();
    else lyricsElementAdded();
  }
}

function toggleKaraoke(): void {
  persistKaraokeEnabled(!AppState.isKaraokeEnabled);
  syncKaraoke();
}

/**
 * Theme settings are module state, so the side panel's view has already taken them and answered
 * whether the lines need rebuilding; that answer reloads the lyrics, which rebuilds this view too.
 * This view still drops what it resolved against the old stylesheet and measures again.
 */
export function applyKaraokeTheme(css: string): void {
  karaokeView.setTheme(css);
}
