# YouTube Music web video-quality investigation

Verified 2026-09-29 in the connected Chrome 153 browser on Linux, with a signed-in
Premium account and Music's audio quality set to High. The findings below underpin
the extension's video-quality preferences.

## Finding

Music's `prefer_gapless: true` player argument causes the current player to prefer
H.264 video and AAC audio. The selected video family has a 1080p ceiling for the
tested video. The server already supplies 1440p and 2160p VP9 in the same response;
changing the argument to `false` makes those formats available and playable.

The former CSS workaround used a 200% player scaled back down to 50%. It could
influence automatic selection within the chosen codec family, but could not
overcome this preference. It has been removed: explicit quality selection works
with a normally sized player.

## Reproduction and measured results

Video: `oQfWa3WQXqg`, "brand new chanel$ (Official Video)".

The unmodified Music response includes VP9 313 (2160p) and 271 (1440p), H.264 137
(1080p), AAC 141 (high quality), and other audio/video formats. It contains no AV1.
`MediaSource.isTypeSupported` returned true for VP9, AV1, and Opus on this browser.

| Test | Available maximum | Actual decoded video | Active audio |
| --- | --- | --- | --- |
| Unmodified Music | 1080p | H.264 137, 1920x1080 | AAC 141 |
| Same response, `prefer_gapless: false`, audio arguments omitted | 2160p | VP9 271, 2560x1440 automatically; VP9 313, 3840x2160 when selected | Opus 251 |
| Same response, `prefer_gapless: false`, `aac_high: true` | 2160p | VP9 313, 3840x2160 | AAC 141 |
| Same response, `prefer_gapless: true`, `aac_high: true` | 1080p | H.264 137, 1920x1080 | AAC 141 |
| Fresh native Music player request, gapless false and high audio retained | 2160p | VP9 313, 3840x2160 | AAC 141 |
| Wrapped Music API, native UI Song -> Video transition | 2160p | VP9 313, 3840x2160 | AAC 141 |
| Production bridge on first page load, prefer 2160p, normal player size | 2160p | VP9 313, 3840x2160 | AAC 141 |
| Production bridge, prefer 720p, normal player size | 2160p | VP9 247, 1280x720 | AAC 141 |
| Enhancement disabled while playing; saved 2160p clamped | 2160p until next native load | VP9 248, 1920x1080 | AAC 141 |
| Built production MAIN script, disabled on fresh page load | 1080p | H.264 137, 1920x1080 | AAC 141 |
| Built production MAIN script, enabled in place after that load | 2160p | VP9 313, 3840x2160 | AAC 141 |

4K was verified using the video element's `videoWidth`/`videoHeight` and the active
itag, not just the advertised quality list. There was no player error. The audio
response reports AAC 141 at 258,385 bits/s. Forcing `hd2160` during the experiment
sets a saved player quality preference; it is not required to expose the formats.

Switching to Song used its separate audio video ID, `542_EpsMlwc`, and retained
`audio_only: "1"`, `prefer_gapless: true`, and AAC 141. Switching back to Video
caused Music to pass `prefer_gapless: true` again; the wrapper changed only that
argument and 4K playback resumed. Music's video preloading calls were also observed
passing through the wrapper. The user reported seamless album transitions in listening tests, with one failure
when seeking near a track end. This is consistent with preserving audio-only
arguments, but is not a sample-accurate gapless measurement. A `gapless` playback
category indicates an active playback path, not a guarantee of an inaudible
boundary. Late seeking can leave insufficient time to preload the next track.

## Source trace

First-party scripts inspected directly in the browser:

- [Music application bundle](https://music.youtube.com/s/de0cc54d/music_polymer_inlined_html.js)
- [YouTube player bundle](https://music.youtube.com/s/player/fb50cd46/player_es6.vflset/en_US/base.js)

Player release: `youtube.player.web_20260923_08_RC00`.
Music client: `WEB_REMIX`, `1.20260927.17.00`.

In this Music bundle, `qnb` constructs the playback arguments. It derives
`aac_high` from the user's High audio setting and subscriber status, sets
`audio_only` for audio playback, and adds `prefer_gapless` when its gapless
eligibility predicate succeeds. That predicate checks gapless-audio support,
subscriber/experiment eligibility, and another Music state predicate. It does not
exclude the music-video case we tested.

In this player bundle, the video-data parser reads `prefer_gapless`; `g.fD` passes
that value to the format-policy builder `u_F`. The builder enables both H.264 and
AAC preferences when it is true. `CBK` then places H.264 ahead of VP9/AV1 in the
video-family preference list. Temporary instrumentation confirmed those two
preference booleans follow the input flag in both directions. These minified names
are evidence for this release, not suitable integration points.

No mobile-client spoofing, replacement stream URLs, response rewriting, or custom
decoder is necessary for this VP9 workaround. The experiment does not establish
why the Music response lacks AV1, nor prove that Music universally excludes AV1.
The `disable_av1_setting` experiment flag alone is not proof of a decoding ban.

## Reusable diagnostic

Paste `youtube-music-video-quality.js` into the console on a loaded Music page.
Then switch Song -> Video or select another video using Music's normal controls.
The script exposes:

```js
__betterLyricsVideoQualityDiagnostic.snapshot()
__betterLyricsVideoQualityDiagnostic.restore()
```

Reload the page after restoring to discard modified active/preloaded playback.
The script does not reload the current track or force a quality setting itself.
It keeps only bounded summaries of calls, without signed stream URLs or tokens.

The wrapper uses `await document.querySelector('ytmusic-player').getPlayer()`.
That returns the API proxy Music itself calls. In the tested build it is a
different object from `document.getElementById('movie_player')`, so wrapping only
the DOM player misses Music's native calls. The wrapper preserves all arguments
except `prefer_gapless` for non-audio-only playback. In particular, do not rebuild
the arguments from only the video ID: dropping `aac_high` changed the selected
audio to medium-quality Opus in the initial experiment.

## Extension integration and validation

The default-on **Enable higher-resolution videos** setting changes only video
`prefer_gapless` arguments on Music's API proxy. Audio-only arguments and all other
fields pass through unchanged. **Preferred video quality** defaults to Auto and
otherwise chooses the closest available lower resolution (or the smallest
available when none is lower). Disabling the enhancement disables 1440p/4K/8K in
the settings UI and changes an already-selected high resolution to 1080p.
The native codec policy fully returns on the next video or page refresh.

On first playback, Music can load before its async API becomes available. If its
response advertises >1080p but the selectable list does not, the bridge calls
`updateVideoData({ prefer_gapless: false }, true)` once per video. In this player,
the second argument refilters existing video data. Omitting it only updates
metadata. The refresh retained position, playback state, high-quality audio, and
all other load data in the browser test; it did not restart the track.

The MAIN-world entrypoint starts at document start and waits for settings from an
ISOLATED-world storage bridge. It supports delayed/replaced APIs, settings changes,
and cleanup. Ads, live streams, and audio-only playback keep native quality
selection. Undocumented API failures are caught so Music can continue playing.
No minified function names are used in the extension integration.

Automated selfchecks cover defaults, malformed preferences, resolution fallback,
1080p clamping, disabled controls, immutable video arguments, audio-only passthrough,
native receiver/return preservation, first-load refiltering, API replacement,
ads, cleanup, and storage handshake/races. Browser checks use the production
player module (including the final built MAIN script) injected before Music startup and the built settings page served
locally with fixture Chrome storage/i18n APIs. This verifies the actual UI and
handlers, but does not claim a packaged-extension installation test.

Screenshots in `docs/screenshots/video-quality/` show the built Display settings
with default values and with the enhancement disabled.

Remaining compatibility coverage: sample-accurate/video/mixed-queue transitions,
non-Premium accounts, Normal/Low audio, Firefox runtime, casting, mobile web,
live streams, restricted content, and ads in real playback. The successful live
scope is desktop Music VP9/4K on this video and player release. AV1 was not in this
Music response, so an AV1-specific workaround has not been demonstrated.
