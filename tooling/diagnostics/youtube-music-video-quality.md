# YouTube Music web video-quality investigation

Verified 2026-09-29 in the connected Chrome 153 browser on Linux, with a signed-in
Premium account and Music's audio quality set to High. This is a browser experiment,
not a production extension change.

## Finding

Music's `prefer_gapless: true` player argument causes the current player to prefer
H.264 video and AAC audio. The selected video family has a 1080p ceiling for the
tested video. The server already supplies 1440p and 2160p VP9 in the same response;
changing the argument to `false` makes those formats available and playable.

The existing CSS workaround is at `public/css/ytmusic/general.css`: a 200% player
scaled back down to 50%. It influences automatic quality selection within the
chosen codec family, but cannot overcome this codec-family preference.

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

4K was verified using the video element's `videoWidth`/`videoHeight` and the active
itag, not just the advertised quality list. There was no player error. The audio
response reports AAC 141 at 258,385 bits/s. Forcing `hd2160` during the experiment
sets a saved player quality preference; it is not required to expose the formats.

Switching to Song used its separate audio video ID, `542_EpsMlwc`, and retained
`audio_only: "1"`, `prefer_gapless: true`, and AAC 141. Switching back to Video
caused Music to pass `prefer_gapless: true` again; the wrapper changed only that
argument and 4K playback resumed. Music's video preloading calls were also observed
passing through the wrapper. Gapless end-to-end transitions were not measured.

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

## Proposed extension integration and remaining checks

Integrate a video-only override in the MAIN-world player bridge, using the stable
method names rather than minified player internals. Preserve audio-only requests
and every other Music argument. The 200% CSS workaround can still influence
automatic resolution after VP9 becomes selectable.

Before enabling it by default, validate:

- Initial playback and replacement/recreation of Music's API proxy.
- Consecutive videos, automatic queue advance, preloaded entries, seeking, and
  Song/Video transitions; disabling the preference may sacrifice seamless video
  transitions, and mixed audio/video queue boundaries need particular attention.
- High, Normal, and Low audio preferences, and non-Premium playback.
- Firefox, mobile web, casting, live streams, restricted content, and ads.
- Cleanup/hot reload and a fail-open fallback if undocumented APIs change.

The successful scope is desktop Music VP9/4K on this video and player release.
An AV1-specific workaround has not been demonstrated.
