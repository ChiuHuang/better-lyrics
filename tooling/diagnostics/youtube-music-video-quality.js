/**
 * Temporary YouTube Music video-quality experiment. Paste into the page console.
 * Then switch Song -> Video or select another music video through Music's UI.
 * Reload the page to fully undo it. This is not an extension entrypoint.
 * See youtube-music-video-quality.md for findings and limitations.
 */
(async () => {
  const key = "__betterLyricsVideoQualityDiagnostic";
  if (window[key]) return window[key].snapshot();
  if (location.hostname !== "music.youtube.com") {
    throw new Error("Run this diagnostic on music.youtube.com.");
  }

  const host = document.querySelector("ytmusic-player");
  if (typeof host?.getPlayer !== "function") throw new Error("Music player is not ready.");
  // Music calls this API proxy; wrapping #movie_player alone misses its calls.
  const api = await host.getPlayer();
  if (window[key]) return window[key].snapshot();
  if (typeof api?.loadVideoByPlayerVars !== "function") {
    throw new Error("Music's player API has changed.");
  }

  const hooks = [];
  const calls = [];
  for (const name of [
    "loadVideoByPlayerVars",
    "cueVideoByPlayerVars",
    "preloadVideoByPlayerVars",
    "queueNextVideo",
    "enqueueVideoByPlayerVars",
  ]) {
    const original = api[name];
    if (typeof original !== "function") continue;
    const wrapped = function (vars, ...rest) {
      const audioOnly = [true, 1, "1", "True"].includes(vars?.audio_only);
      const hasVideoId = typeof (vars?.video_id ?? vars?.videoId) === "string";
      const override = hasVideoId && !audioOnly;
      calls.push({
        method: name,
        videoId: vars?.video_id ?? vars?.videoId,
        audioOnly,
        incomingGapless: vars?.prefer_gapless,
        override,
        highAudio: vars?.aac_high,
      });
      if (calls.length > 20) calls.shift();
      // Preserve every other Music-supplied argument, particularly aac_high,
      // prefer_low_quality_audio, player_params, pause_at_start, and list.
      return Reflect.apply(original, this, [override ? { ...vars, prefer_gapless: false } : vars, ...rest]);
    };
    api[name] = wrapped;
    hooks.push({ name, original, wrapped });
  }

  const diagnostic = {
    snapshot() {
      const player = document.getElementById("movie_player");
      const video = player?.querySelector("video");
      const stats = player?.getVideoStats?.() ?? {};
      return {
        videoId: player?.getVideoData?.().video_id,
        quality: player?.getPlaybackQuality?.(),
        available: player?.getAvailableQualityLevels?.(),
        dimensions: video ? [video.videoWidth, video.videoHeight] : null,
        videoFormat: stats.fmt,
        audioFormat: stats.afmt,
        error: stats.vemsg,
        calls: calls.map(call => ({ ...call })),
      };
    },
    restore() {
      for (const { name, original, wrapped } of hooks) {
        if (api[name] === wrapped) api[name] = original;
      }
      if (window[key] === diagnostic) delete window[key];
      return "Hooks removed. Reload the page to reset active and preloaded playback.";
    },
  };
  window[key] = diagnostic;
  console.info(
    "Video-quality diagnostic installed. Switch Song -> Video or select a video. " +
      `Inspect with ${key}.snapshot(); undo with ${key}.restore() and reload.`
  );
  return diagnostic.snapshot();
})();
