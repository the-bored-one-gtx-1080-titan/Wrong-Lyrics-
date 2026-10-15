// Better Spicy Lyrics — synced lyrics overlay for Spicetify (LRCLIB)
// Open with the lyrics button in the playbar or Alt+L. Close with Esc.
// Gear menu inside the overlay: sync offset, text size, lite mode, ad blocker, lyric sources.
// Press F in the overlay for cinema view, S to cycle lyric styles.

(async function BetterSpicyLyrics() {
    "use strict";

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    while (!window.Spicetify?.Player?.data) await sleep(150);

    // ---------- config ----------
    const API = "https://lrclib.net/api";
    const POLL_MS = 100;        // sync check rate; DOM is only touched when the line changes
    const CACHE_MAX = 30;

    // ---------- settings (saved in localStorage) ----------
    const DEFAULT_ORDER = ["spotify", "lrclib", "netease", "ovh"];
    const autoLite =
        (navigator.hardwareConcurrency || 4) <= 4 ||
        (navigator.deviceMemory || 4) <= 4 ||
        matchMedia("(prefers-reduced-motion: reduce)").matches;

    function loadSettings() {
        let saved = {};
        try { saved = JSON.parse(localStorage.getItem("bsl-settings") || "{}") || {}; } catch {}
        const legacyLite = localStorage.getItem("bsl-lite");
        const legacyProv = localStorage.getItem("bsl-providers");
        const st = {
            offset: 120,   // ms; highlight a touch early so it feels in sync
            scale: 100,    // text size, %
            lite: legacyLite !== null ? legacyLite === "1" : autoLite,
            adblock: true,
            style: "default",
            order: [...DEFAULT_ORDER],
            off: [],       // disabled providers
            ...saved,
        };
        if (!saved.order && legacyProv) {
            const list = legacyProv.split(",").map((x) => x.trim()).filter((id) => DEFAULT_ORDER.includes(id));
            st.order = [...list, ...DEFAULT_ORDER.filter((id) => !list.includes(id))];
            st.off = DEFAULT_ORDER.filter((id) => !list.includes(id));
        }
        st.order = st.order.filter((id) => DEFAULT_ORDER.includes(id));
        for (const id of DEFAULT_ORDER) if (!st.order.includes(id)) st.order.push(id);
        return st;
    }
    const S = loadSettings();
    const saveSettings = () => { try { localStorage.setItem("bsl-settings", JSON.stringify(S)); } catch {} };

    // ---------- cleanup on re-run ----------
    document.getElementById("bsl-root")?.remove();
    document.getElementById("bsl-style")?.remove();

    // ---------- styles ----------
    const style = document.createElement("style");
    style.id = "bsl-style";
    style.textContent = `
    #bsl-root{--bsl-a:#2b2b2e;--bsl-b:#3b3b40;--bsl-c:#fff;--bsl-panel:clamp(260px,32%,400px);
      position:fixed;z-index:100;overflow:hidden;border-radius:10px;background:#0e0e10;color:#fff;
      display:grid;grid-template-columns:var(--bsl-panel) 1fr;
      font-family:"SpotifyMixUITitleVariable","SpotifyMixUI",CircularSp,"CircularSp-Grek","CircularSp-Cyrl",system-ui,sans-serif;
      contain:layout paint}
    #bsl-root[hidden]{display:none}
    #bsl-root.narrow{--bsl-panel:0px;grid-template-columns:1fr}
    #bsl-root.narrow .bsl-panel{display:none}
    #bsl-root .bsl-bg{position:absolute;inset:0;
      background:linear-gradient(rgba(8,8,10,.5),rgba(8,8,10,.5)),
        radial-gradient(110% 90% at 0% 0%,var(--bsl-b) 0%,transparent 62%),
        radial-gradient(90% 80% at 100% 100%,var(--bsl-a) 0%,transparent 66%),#0e0e10}
    #bsl-root .bsl-panel{position:relative;z-index:2;grid-column:1;display:flex;flex-direction:column;
      justify-content:center;gap:18px;padding:40px 8px 40px 40px;min-width:0}
    #bsl-root .bsl-cover{width:100%;max-width:340px;aspect-ratio:1;border-radius:14px;object-fit:cover;background:#26262a}
    #bsl-root:not(.lite) .bsl-cover{box-shadow:0 24px 60px -18px var(--bsl-b)}
    #bsl-root .bsl-meta{display:flex;flex-direction:column;gap:4px;max-width:340px;min-width:0}
    #bsl-root .bsl-title{font-size:22px;font-weight:800;line-height:1.15;letter-spacing:-.01em;display:-webkit-box;
      -webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    #bsl-root .bsl-artist{font-size:15px;font-weight:600;opacity:.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #bsl-root .bsl-src{font-size:12px;opacity:.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #bsl-root .bsl-src:empty{display:none}
    #bsl-root .bsl-prog{height:4px;max-width:340px;border-radius:2px;background:rgba(255,255,255,.18);overflow:hidden}
    #bsl-root .bsl-bar{height:100%;background:var(--bsl-c);transform-origin:left center;transform:scaleX(0)}
    #bsl-root .bsl-times{display:flex;justify-content:space-between;max-width:340px;margin-top:-10px;
      font-size:11px;font-variant-numeric:tabular-nums;opacity:.55}
    #bsl-root .bsl-btn{flex:none;width:36px;height:36px;border:0;border-radius:50%;
      display:grid;place-items:center;color:#fff;background:rgba(255,255,255,.1);cursor:pointer}
    #bsl-root .bsl-btn:hover{background:rgba(255,255,255,.22)}
    #bsl-root .bsl-btn svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}
    #bsl-root .bsl-btn:focus-visible,#bsl-root .bsl-line:focus-visible{outline:2px solid var(--bsl-c);outline-offset:3px}
    #bsl-root .bsl-view{position:relative;z-index:1;grid-column:2;overflow:hidden;min-width:0}
    #bsl-root.narrow .bsl-view{grid-column:1}
    #bsl-root .bsl-track{padding:0 clamp(20px,4vw,72px) 0 clamp(16px,3vw,48px);will-change:transform}
    #bsl-root .bsl-line{display:block;padding:.3em 0;font-size:calc(var(--bsl-size,clamp(26px,3.5vw,52px))*var(--bsl-scale,1));line-height:1.18;font-weight:800;
      letter-spacing:-.015em;opacity:.3;cursor:pointer;overflow-wrap:anywhere}
    #bsl-root .bsl-line.near{opacity:.5}
    #bsl-root .bsl-line.on{opacity:1;color:var(--bsl-c)}
    #bsl-root .bsl-line.gap{letter-spacing:.3em}
    #bsl-root .bsl-status{position:absolute;z-index:2;left:var(--bsl-panel);right:0;top:50%;transform:translateY(-50%);
      text-align:center;font-size:18px;font-weight:700;opacity:.75;padding:0 24px}
    #bsl-root .bsl-status:empty{display:none}
    #bsl-root.plain .bsl-view{overflow-y:auto;padding-top:56px}
    #bsl-root.plain .bsl-track{transform:none!important}
    #bsl-root.plain .bsl-line{opacity:.9;cursor:default;font-size:calc(clamp(18px,2.3vw,28px)*var(--bsl-scale,1));font-weight:700;color:#fff}
    #bsl-root:not(.lite) .bsl-view{-webkit-mask-image:linear-gradient(transparent 0,#000 16%,#000 80%,transparent 100%);
      mask-image:linear-gradient(transparent 0,#000 16%,#000 80%,transparent 100%)}
    #bsl-root:not(.lite) .bsl-track{transition:transform .5s cubic-bezier(.22,.7,.2,1)}
    #bsl-root:not(.lite) .bsl-line{transform:scale(.94);transform-origin:left center;transition:opacity .3s ease,transform .3s ease}
    #bsl-root:not(.lite) .bsl-line.on{transform:scale(1);color:transparent;-webkit-background-clip:text;background-clip:text;
      background-image:linear-gradient(90deg,var(--bsl-c) 0,var(--bsl-c) 46%,rgba(255,255,255,.5) 54%,rgba(255,255,255,.5) 100%);
      background-size:200% 100%;background-position:100% 0;
      animation:bsl-sweep var(--dur,3s) linear var(--off,0ms) forwards}
    #bsl-root:not(.lite) .bsl-line.on.gap{color:var(--bsl-c);background-image:none;animation:none}
    #bsl-root.paused .bsl-line.on{animation-play-state:paused}
    #bsl-root.plain:not(.lite) .bsl-line{transform:none}
    @keyframes bsl-sweep{from{background-position:100% 0}to{background-position:0 0}}
    #bsl-root .bsl-tools{position:absolute;z-index:5;top:16px;right:16px;display:flex;gap:8px}
    #bsl-root .bsl-art,#bsl-root .bsl-ctl{display:none}
    #bsl-root .bsl-set{position:absolute;z-index:6;top:62px;right:16px;width:min(320px,calc(100% - 32px));
      max-height:calc(100% - 84px);overflow:auto;padding:16px 18px;border-radius:12px;background:#18181c;
      box-shadow:0 12px 40px rgba(0,0,0,.5);display:flex;flex-direction:column;gap:12px;font-size:14px}
    #bsl-root .bsl-set[hidden]{display:none}
    #bsl-root .bsl-h{margin:0;font-size:16px;font-weight:800}
    #bsl-root .bsl-h2{margin:6px 0 0;font-size:13px;font-weight:700;opacity:.7}
    #bsl-root .bsl-row{display:flex;flex-direction:column;gap:6px}
    #bsl-root .bsl-lbl{display:flex;justify-content:space-between;font-weight:600}
    #bsl-root .bsl-val{opacity:.65;font-weight:500;font-variant-numeric:tabular-nums}
    #bsl-root .bsl-hint{margin:-6px 0 0;font-size:12px;opacity:.55}
    #bsl-root .bsl-check{display:flex;align-items:center;gap:10px;font-weight:600;cursor:pointer}
    #bsl-root .bsl-set input{accent-color:var(--bsl-c)}
    #bsl-root .bsl-prov{display:flex;align-items:center;justify-content:space-between;gap:6px}
    #bsl-root .bsl-prov .bsl-check{flex:1}
    #bsl-root .bsl-mini{border:0;border-radius:6px;width:26px;height:26px;font-size:10px;color:#fff;
      background:rgba(255,255,255,.1);cursor:pointer}
    #bsl-root .bsl-mini:hover,#bsl-root .bsl-reset:hover{background:rgba(255,255,255,.22)}
    #bsl-root .bsl-reset{margin-top:4px;border:0;border-radius:999px;padding:9px 14px;font:inherit;font-weight:700;
      color:#fff;background:rgba(255,255,255,.12);cursor:pointer}
    #bsl-root .bsl-pp .ic-pause{display:block}
    #bsl-root .bsl-pp .ic-play{display:none}
    #bsl-root.paused .bsl-pp .ic-pause{display:none}
    #bsl-root.paused .bsl-pp .ic-play{display:block}
    #bsl-root .bsl-set select{width:100%;border:0;border-radius:8px;padding:9px 10px;font:inherit;font-weight:600;
      color:#fff;background:#2a2a30;cursor:pointer}
    /* ---- lyric styles (inspired by each app; "default" is the karaoke look above) ---- */
    #bsl-root.s-apple{--bsl-size:clamp(30px,4vw,58px)}
    #bsl-root.s-apple .bsl-line{font-weight:700;letter-spacing:-.025em}
    #bsl-root.s-apple .bsl-line.on{color:#fff}
    #bsl-root.s-apple:not(.lite) .bsl-line{transform:scale(.88);transform-origin:left center;filter:blur(1.2px);
      transition:opacity .35s ease,transform .35s ease,filter .35s ease}
    #bsl-root.s-apple:not(.lite) .bsl-line.near{filter:blur(.5px)}
    #bsl-root.s-apple:not(.lite) .bsl-line.on{transform:scale(1);filter:none;color:#fff;background:none;animation:none}
    #bsl-root.s-tidal{--bsl-size:clamp(22px,2.7vw,40px);--bsl-c:#00ffff!important}
    #bsl-root.s-tidal .bsl-bg{background:#000}
    #bsl-root.s-tidal .bsl-line{opacity:1;color:#5f6368;font-weight:700;letter-spacing:0}
    #bsl-root.s-tidal .bsl-line.near{color:#7d8186}
    #bsl-root.s-tidal .bsl-line.on{color:#fff}
    #bsl-root.s-tidal:not(.lite) .bsl-line{transform:none}
    #bsl-root.s-tidal:not(.lite) .bsl-line.on{transform:none;color:#fff;background:none;animation:none}
    #bsl-root.s-spotify{--bsl-size:clamp(30px,4.2vw,62px)}
    #bsl-root.s-spotify .bsl-bg{background:var(--bsl-b)}
    #bsl-root.s-spotify .bsl-line{opacity:1;color:rgba(0,0,0,.45);font-weight:800;letter-spacing:-.02em}
    #bsl-root.s-spotify .bsl-line.past{color:rgba(255,255,255,.6)}
    #bsl-root.s-spotify .bsl-line.on{color:#fff}
    #bsl-root.s-spotify:not(.lite) .bsl-line{transform:none}
    #bsl-root.s-spotify:not(.lite) .bsl-line.on{transform:none;color:#fff;background:none;animation:none}
    #bsl-root.s-yt{--bsl-size:clamp(24px,3vw,44px);--bsl-c:#ff4e45!important}
    #bsl-root.s-yt .bsl-bg{background:linear-gradient(180deg,var(--bsl-a) -60%,#0f0f0f 55%)}
    #bsl-root.s-yt .bsl-track{text-align:center}
    #bsl-root.s-yt .bsl-line{opacity:.4;font-weight:700;letter-spacing:0}
    #bsl-root.s-yt .bsl-line.near{opacity:.4}
    #bsl-root.s-yt .bsl-line.on{opacity:1;color:#fff}
    #bsl-root.s-yt:not(.lite) .bsl-line{transform:scale(.96);transform-origin:center}
    #bsl-root.s-yt:not(.lite) .bsl-line.on{transform:scale(1);color:#fff;background:none;animation:none}
    #bsl-root.cinema{--bsl-panel:0px;grid-template-columns:1fr;border-radius:0;z-index:2147483000}
    #bsl-root.cinema .bsl-panel{display:none}
    #bsl-root.cinema .bsl-view{grid-column:1}
    #bsl-root.cinema .bsl-art{display:block;position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.3}
    #bsl-root.cinema .bsl-track{padding:0 8vw;text-align:center}
    #bsl-root.cinema{--bsl-size:clamp(34px,5.6vw,92px)}
    #bsl-root.cinema .bsl-line{transform-origin:center}
    #bsl-root.cinema .bsl-ctl{display:flex;position:absolute;z-index:4;left:0;right:0;bottom:0;align-items:center;
      justify-content:space-between;gap:20px;padding:24px 40px 30px;background:linear-gradient(transparent,rgba(0,0,0,.6));
      transition:opacity .4s}
    #bsl-root .bsl-np{display:flex;flex-direction:column;gap:2px;min-width:0}
    #bsl-root .bsl-np-t{font-size:18px;font-weight:800}
    #bsl-root .bsl-np-a{font-size:14px;opacity:.7}
    #bsl-root .bsl-btns{display:flex;gap:12px}
    #bsl-root .bsl-ctl .bsl-btn{width:48px;height:48px}
    #bsl-root.cinema.idle{cursor:none}
    #bsl-root.cinema.idle .bsl-ctl,#bsl-root.cinema.idle .bsl-tools{opacity:0;pointer-events:none}
    @media (prefers-reduced-motion:reduce){#bsl-root .bsl-track,#bsl-root .bsl-line{transition:none!important}
      #bsl-root .bsl-line.on{animation:none!important;color:var(--bsl-c)!important;background:none!important}}
    `;
    document.head.appendChild(style);

    // ---------- DOM ----------
    const root = document.createElement("div");
    root.id = "bsl-root";
    root.hidden = true;
    root.classList.toggle("lite", S.lite);
    root.innerHTML = `
      <div class="bsl-bg"></div>
      <img class="bsl-art" alt="" decoding="async">
      <aside class="bsl-panel">
        <img class="bsl-cover" alt="" decoding="async">
        <div class="bsl-meta">
          <span class="bsl-title"></span>
          <span class="bsl-artist"></span>
          <span class="bsl-src"></span>
        </div>
        <div class="bsl-prog"><div class="bsl-bar"></div></div>
        <div class="bsl-times"><span class="bsl-t0">0:00</span><span class="bsl-t1">0:00</span></div>
      </aside>
      <div class="bsl-view"><div class="bsl-track"></div></div>
      <div class="bsl-status" role="status"></div>
      <div class="bsl-tools">
        <button class="bsl-btn bsl-cin" type="button" aria-label="Cinema view" title="Cinema view (F)">
          <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9"/></svg>
        </button>
        <button class="bsl-btn bsl-gear" type="button" aria-label="Settings" title="Settings">
          <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M1 4h12M1 10h12"/><circle cx="9" cy="4" r="1.8" fill="currentColor"/><circle cx="5" cy="10" r="1.8" fill="currentColor"/></svg>
        </button>
        <button class="bsl-btn bsl-close" type="button" aria-label="Close lyrics" title="Close (Esc)">
          <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M12 2L2 12"/></svg>
        </button>
      </div>
      <div class="bsl-ctl">
        <div class="bsl-np"><span class="bsl-np-t"></span><span class="bsl-np-a"></span></div>
        <div class="bsl-btns">
          <button class="bsl-btn bsl-prev" type="button" aria-label="Previous song">
            <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 2v10"/><path d="M12 2L5 7l7 5z" fill="currentColor"/></svg>
          </button>
          <button class="bsl-btn bsl-pp" type="button" aria-label="Play or pause">
            <svg class="ic-play" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5l9 5.5-9 5.5z" fill="currentColor" stroke="none"/></svg>
            <svg class="ic-pause" viewBox="0 0 14 14" aria-hidden="true"><path d="M4 2v10M10 2v10" stroke-width="3"/></svg>
          </button>
          <button class="bsl-btn bsl-next" type="button" aria-label="Next song">
            <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M11.5 2v10"/><path d="M2 2l7 5-7 5z" fill="currentColor"/></svg>
          </button>
        </div>
      </div>`;
    document.body.appendChild(root);

    const ui = {
        cover: root.querySelector(".bsl-cover"),
        title: root.querySelector(".bsl-title"),
        artist: root.querySelector(".bsl-artist"),
        src: root.querySelector(".bsl-src"),
        bar: root.querySelector(".bsl-bar"),
        t0: root.querySelector(".bsl-t0"),
        t1: root.querySelector(".bsl-t1"),
        close: root.querySelector(".bsl-close"),
        view: root.querySelector(".bsl-view"),
        track: root.querySelector(".bsl-track"),
        status: root.querySelector(".bsl-status"),
        art: root.querySelector(".bsl-art"),
        cin: root.querySelector(".bsl-cin"),
        gear: root.querySelector(".bsl-gear"),
        prev: root.querySelector(".bsl-prev"),
        next: root.querySelector(".bsl-next"),
        pp: root.querySelector(".bsl-pp"),
        npT: root.querySelector(".bsl-np-t"),
        npA: root.querySelector(".bsl-np-a"),
    };

    // ---------- state ----------
    const cache = new Map();
    const state = {
        open: false,
        token: 0,
        abort: null,
        trackInfo: null,
        result: undefined,   // undefined = loading, null = none, object = lyrics
        renderedFor: -1,
        lines: [],
        els: [],
        synced: false,
        idx: -2,
        timer: 0,
    };

    // ---------- track info ----------
    function imgUrl(u) {
        if (!u) return "";
        return u.startsWith("spotify:image:") ? "https://i.scdn.co/image/" + u.slice(14) : u;
    }

    function getTrack() {
        const d = Spicetify.Player.data;
        const item = d?.item ?? d?.track;
        if (!item) return null;
        const m = item.metadata ?? {};
        const title = item.name ?? m.title;
        const artist = item.artists?.[0]?.name ?? m.artist_name ?? m.artist;
        if (!title || !artist) return null;
        return {
            title,
            artist,
            album: item.album?.name ?? m.album_title ?? m.album_name ?? m.album ?? "",
            cover: imgUrl(m.image_large_url || m.image_url || item.album?.images?.[0]?.url),
            uri: item.uri ?? m.uri,
            duration: Spicetify.Player.getDuration(),
        };
    }

    const cleanTitle = (t) =>
        t
            .replace(/\s*[-–]\s*(remaster(ed)?|\d{4}\b|live|mono|stereo|single|radio edit).*$/i, "")
            .replace(/\s*[(\[][^)\]]*(remaster|version|mono|stereo|live|edit)[^)\]]*[)\]]/gi, "")
            .trim();

    // ---------- LRCLIB ----------
    async function lrclib(path, params, signal) {
        const r = await fetch(`${API}/${path}?${new URLSearchParams(params)}`, { signal });
        if (r.status === 404) return null;
        if (!r.ok) throw new Error("LRCLIB " + r.status);
        return r.json();
    }

    function pickBest(list, durSec) {
        const withSync = list.filter((x) => x.syncedLyrics);
        const pool = withSync.length ? withSync : list.filter((x) => x.plainLyrics);
        if (!pool.length) return null;
        pool.sort((a, b) => Math.abs((a.duration || 0) - durSec) - Math.abs((b.duration || 0) - durSec));
        return pool[0];
    }

    async function lrclibProvider(tr, signal) {
        const durSec = Math.round(tr.duration / 1000);
        const base = { track_name: tr.title, artist_name: tr.artist };
        let data = await lrclib("get", { ...base, ...(tr.album && { album_name: tr.album }), duration: durSec }, signal);

        if (!data || (!data.syncedLyrics && !data.plainLyrics && !data.instrumental)) {
            const alt = { track_name: cleanTitle(tr.title), artist_name: tr.artist };
            const list = await lrclib("search", alt, signal);
            data = Array.isArray(list) ? pickBest(list, durSec) : null;
        }
        if (!data) return null;
        if (data.instrumental) return { instrumental: true };
        if (data.syncedLyrics) {
            const lines = parseLRC(data.syncedLyrics);
            if (lines.length) return { synced: true, lines };
        }
        if (data.plainLyrics) {
            return { synced: false, lines: data.plainLyrics.split(/\r?\n/).map((text) => ({ t: 0, text })) };
        }
        return null;
    }

    // [mm:ss.xx] text — also handles several timestamps on one line
    const TAG = /\[(\d+):(\d{2})(?:[.:](\d{1,3}))?\]/g;
    function parseLRC(str) {
        const out = [];
        for (const raw of str.split(/\r?\n/)) {
            TAG.lastIndex = 0;
            const times = [];
            let m, end = 0;
            while ((m = TAG.exec(raw)) !== null) {
                const ms = m[3] ? parseInt(m[3].padEnd(3, "0"), 10) : 0;
                times.push((parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) * 1000 + ms);
                end = TAG.lastIndex;
            }
            if (!times.length) continue;
            const text = raw.slice(end).trim();
            for (const t of times) out.push({ t, text });
        }
        out.sort((a, b) => a.t - b.t);
        // collapse repeated empty lines
        return out.filter((l, i) => l.text || i === 0 || out[i - 1].text);
    }

    // ---------- providers ----------
    // A provider is { name, get(track, signal) } and resolves to one of:
    //   null                                   -> nothing found, try the next provider
    //   { instrumental: true }
    //   { synced: boolean, lines: [{ t, text }] }   (t in ms, ignored when not synced)
    // Throw on network errors; the runner logs it and moves on.
    // To add a source: write one function like the ones below and add it to PROVIDERS.

    const tidy = (lines) => lines.filter((l, i) => l.text || i === 0 || lines[i - 1].text);

    // Spotify's own lyrics endpoint (the one the built-in lyrics view uses)
    async function spotifyProvider(tr) {
        if (!tr.uri?.startsWith("spotify:track:") || !Spicetify.CosmosAsync) return null;
        const id = tr.uri.split(":")[2];
        let body;
        try {
            body = await Spicetify.CosmosAsync.get(
                `https://spclient.wg.spotify.com/color-lyrics/v2/track/${id}?format=json&vocalRemoval=false&market=from_token`
            );
        } catch {
            return null; // 404 = no lyrics for this track
        }
        const l = body?.lyrics;
        if (!l?.lines?.length) return null;
        const synced = l.syncType === "LINE_SYNCED";
        const lines = l.lines.map((x) => {
            const w = (x.words || "").trim();
            return { t: synced ? Number(x.startTimeMs) || 0 : 0, text: w === "♪" ? "" : w };
        });
        return { synced, lines: tidy(lines) };
    }

    // NetEase Cloud Music — large synced catalogue, good for Asian and some Greek/Balkan songs.
    // Experimental: the site may block requests from inside Spotify (CORS); if so it just fails quietly.
    async function neteaseProvider(tr, signal) {
        const q = new URLSearchParams({ s: `${cleanTitle(tr.title)} ${tr.artist}`, type: 1, limit: 5, offset: 0 });
        const sr = await fetch(`https://music.163.com/api/search/get/web?${q}`, { signal });
        if (!sr.ok) throw new Error("NetEase " + sr.status);
        const songs = (await sr.json())?.result?.songs;
        const best = songs?.find((x) => Math.abs((x.duration || 0) - tr.duration) < 3000);
        if (!best) return null;
        const lr = await fetch(`https://music.163.com/api/song/lyric?id=${best.id}&lv=1&kv=1&tv=-1`, { signal });
        if (!lr.ok) throw new Error("NetEase " + lr.status);
        const lrc = (await lr.json())?.lrc?.lyric;
        const lines = lrc ? parseLRC(lrc) : [];
        return lines.length ? { synced: true, lines: tidy(lines) } : null;
    }

    // lyrics.ovh — plain text only, last-resort fallback
    async function ovhProvider(tr, signal) {
        const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(tr.artist)}/${encodeURIComponent(cleanTitle(tr.title))}`;
        const r = await fetch(url, { signal });
        if (r.status === 404) return null;
        if (!r.ok) throw new Error("lyrics.ovh " + r.status);
        const text = ((await r.json())?.lyrics || "").replace(/^Paroles de la chanson[^\n]*\n/, "").trim();
        if (!text) return null;
        return { synced: false, lines: text.split(/\r?\n/).map((s) => ({ t: 0, text: s.trim() })) };
    }

    const PROVIDERS = {
        spotify: { name: "Spotify", get: spotifyProvider },
        lrclib: { name: "LRCLIB", get: lrclibProvider },
        netease: { name: "NetEase", get: neteaseProvider },
        ovh: { name: "lyrics.ovh", get: ovhProvider },
    };
    // Priority and on/off are set in the Settings menu.
    const getOrder = () => S.order.filter((id) => PROVIDERS[id] && !S.off.includes(id));
    const PROVIDER_TIMEOUT_MS = 7000;

    // Tries providers in order. The first synced result wins; plain-only results are kept
    // as a fallback while the remaining providers get a chance to supply synced ones.
    async function findLyrics(tr, signal) {
        const ORDER = getOrder();
        let plain = null;
        let failures = 0;
        for (const id of ORDER) {
            if (signal.aborted) throw new DOMException("Aborted", "AbortError");
            const provider = PROVIDERS[id];
            const ac = new AbortController();
            const onAbort = () => ac.abort();
            signal.addEventListener("abort", onAbort, { once: true });
            let timer;
            const timeout = new Promise((_, reject) => {
                timer = setTimeout(() => { ac.abort(); reject(new Error("timeout")); }, PROVIDER_TIMEOUT_MS);
            });
            try {
                const res = await Promise.race([provider.get(tr, ac.signal), timeout]);
                if (!res) continue;
                res.source = provider.name;
                if (res.instrumental || res.synced) return res;
                plain ??= res;
            } catch (e) {
                if (signal.aborted) throw e;
                failures++;
                console.warn(`[Better Spicy Lyrics] ${provider.name} failed:`, e.message || e);
            } finally {
                clearTimeout(timer);
                signal.removeEventListener("abort", onAbort);
            }
        }
        if (plain) return plain;
        if (ORDER.length && failures === ORDER.length) throw new Error("All lyric providers failed");
        return null;
    }

    // ---------- rendering ----------
    function setStatus(msg) {
        ui.status.textContent = msg || "";
    }

    function clearLyrics() {
        ui.track.textContent = "";
        ui.track.style.transform = "";
        state.lines = [];
        state.els = [];
        state.synced = false;
        state.idx = -2;
        root.classList.remove("plain");
    }

    function render() {
        state.renderedFor = state.token;
        clearLyrics();
        const res = state.result;

        if (res === undefined) return setStatus("Loading lyrics…");
        if (res === null) return setStatus("No lyrics found for this song.");
        if (res.instrumental) return setStatus("Instrumental");
        if (res === "error") return setStatus("Couldn't load lyrics. Check your connection.");

        setStatus("");
        paintArtist();
        state.lines = res.lines;
        state.synced = res.synced;
        root.classList.toggle("plain", !res.synced);

        const frag = document.createDocumentFragment();
        res.lines.forEach((l, i) => {
            const el = document.createElement("div");
            const gap = !l.text;
            el._b = "bsl-line" + (gap ? " gap" : "");
            el.className = el._b;
            el.textContent = gap ? (res.synced ? "♪" : "\u00a0") : l.text;
            el.dataset.i = i;
            if (res.synced) {
                el.tabIndex = 0;
                el.setAttribute("role", "button");
            }
            state.els.push(el);
            frag.appendChild(el);
        });
        ui.track.appendChild(frag);

        if (res.synced) {
            state.idx = -2;
            tick(true);
            syncLoop();
        }
    }

    // pulls a colour toward white so accent text stays readable on the dark background
    function lighten(hex, t) {
        const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
        if (!m) return "#fff";
        const n = parseInt(m[1], 16);
        const ch = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * t));
        return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
    }

    function paintArtist() {
        const tr = state.trackInfo;
        if (!tr) return;
        const src = state.result?.source;
        ui.artist.textContent = tr.artist;
        ui.src.textContent = src ? `Lyrics: ${src}` : "";
    }

    function paintHeader() {
        const tr = state.trackInfo;
        if (!tr) return;
        ui.title.textContent = tr.title;
        paintArtist();
        if (tr.cover && ui.cover.src !== tr.cover) { ui.cover.src = tr.cover; ui.art.src = tr.cover; }
        ui.npT.textContent = tr.title;
        ui.npA.textContent = tr.artist;
        const token = state.token;
        const extract = Spicetify.colorExtractor?.(tr.uri);
        if (extract?.then) {
            extract
                .then((c) => {
                    if (token !== state.token) return;
                    const a = c?.DARK_VIBRANT || c?.DESATURATED || "#2b2b2e";
                    const b = c?.VIBRANT || a;
                    root.style.setProperty("--bsl-a", a);
                    root.style.setProperty("--bsl-b", b);
                    root.style.setProperty("--bsl-c", lighten(c?.LIGHT_VIBRANT || c?.VIBRANT || "#ffffff", 0.35));
                })
                .catch(() => {});
        }
    }

    // ---------- sync ----------
    function findIdx(pos) {
        const L = state.lines;
        let lo = 0, hi = L.length - 1, ans = -1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (L[mid].t <= pos) { ans = mid; lo = mid + 1; } else hi = mid - 1;
        }
        return ans;
    }

    function centerOn(el) {
        const y = el.offsetTop + el.offsetHeight / 2 - ui.view.clientHeight * 0.4;
        ui.track.style.transform = `translate3d(0,${-y}px,0)`;
    }

    // karaoke-style fill across the active line, timed to the gap before the next line
    function startSweep(el, i) {
        const L = state.lines;
        if (!L[i].text) return;
        const dur = Math.max(400, Math.min(L[i + 1] ? L[i + 1].t - L[i].t : 5000, 9000));
        const off = Math.max(0, Math.min(dur, Spicetify.Player.getProgress() + S.offset - L[i].t));
        el.style.setProperty("--dur", dur + "ms");
        el.style.setProperty("--off", -off + "ms");
    }

    function setActive(i) {
        const { els } = state;
        const prev = state.idx;
        if (i === prev || !els.length) return;
        state.idx = i;

        // only touch nearby lines unless we jumped (seek / first paint)
        const jump = prev < -1 || Math.abs(i - prev) > 6;
        const lo = jump ? 0 : Math.max(0, Math.min(prev, i) - 3);
        const hi = jump ? els.length - 1 : Math.min(els.length - 1, Math.max(prev, i) + 3);
        for (let k = lo; k <= hi; k++) {
            const d = k - i;
            els[k].className = els[k]._b + (d === 0 ? " on" : (d < 0 ? " past" : "") + (d === 1 || d === -1 ? " near" : ""));
        }
        centerOn(els[i < 0 ? 0 : i]);
        if (i >= 0 && !S.lite && S.style === "default") startSweep(els[i], i);
    }

    let lastSec = -1;
    const fmt = (ms) => {
        const t = Math.max(0, Math.floor(ms / 1000));
        return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
    };
    function progressUI(ms) {
        const dur = state.trackInfo?.duration || Spicetify.Player.getDuration() || 1;
        ui.bar.style.transform = `scaleX(${Math.min(1, ms / dur).toFixed(4)})`;
        const sec = Math.floor(ms / 1000);
        if (sec !== lastSec) {
            lastSec = sec;
            ui.t0.textContent = fmt(ms);
            ui.t1.textContent = fmt(dur);
        }
    }

    function tick(force) {
        if (!state.open) return;
        const raw = Spicetify.Player.getProgress();
        progressUI(raw);
        if (!state.synced) return;
        const pos = raw + S.offset;
        const L = state.lines;
        let i = state.idx;
        const stillValid = i >= 0 && L[i].t <= pos && (i + 1 >= L.length || L[i + 1].t > pos);
        if (!stillValid) i = findIdx(pos);
        if (i !== state.idx || force) setActive(i);
    }

    // timer only runs while the overlay is open, visible and playing
    function syncLoop() {
        clearInterval(state.timer);
        state.timer = 0;
        const playing = Spicetify.Player.isPlaying();
        root.classList.toggle("paused", !playing);
        if (state.open && playing && !document.hidden) {
            state.timer = setInterval(tick, POLL_MS);
        }
    }

    // ---------- song handling ----------
    async function onSong() {
        if (adBlock.isAd(Spicetify.Player.data?.item ?? Spicetify.Player.data?.track)) return;
        const tr = getTrack();
        if (!tr) return;
        const token = ++state.token;
        state.abort?.abort();
        state.trackInfo = tr;
        state.result = undefined;
        if (state.open) { paintHeader(); render(); }

        const key = `${tr.artist}|${tr.title}|${Math.round(tr.duration / 1000)}`;
        let res = cache.get(key);
        if (res === undefined) {
            const ac = new AbortController();
            state.abort = ac;
            try {
                res = await findLyrics(tr, ac.signal);
            } catch (e) {
                if (e.name === "AbortError") return;
                console.error("[Better Spicy Lyrics]", e);
                if (token === state.token) { state.result = "error"; if (state.open) render(); }
                return;
            }
            cache.set(key, res);
            if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
        }
        if (token !== state.token) return;
        state.result = res;
        if (state.open) render();
    }

    // ---------- open / close ----------
    function place() {
        const r = document.querySelector(".Root__main-view")?.getBoundingClientRect();
        const s = root.style;
        if (state.cinema) {
            root.classList.remove("narrow");
            s.left = s.top = "0";
            s.width = "100%";
            s.height = "100%";
            return;
        }
        if (r && r.width > 0) {
            root.classList.toggle("narrow", r.width < 760);
            s.left = r.left + "px";
            s.top = r.top + "px";
            s.width = r.width + "px";
            s.height = r.height + "px";
        } else {
            s.left = s.top = "0";
            s.width = "100%";
            s.height = "calc(100% - 90px)";
        }
    }

    let playbarBtn = null;
    function setOpen(v) {
        if (state.open === v) return;
        state.open = v;
        root.hidden = !v;
        if (playbarBtn) playbarBtn.active = v;
        if (v) {
            place();
            if (!state.trackInfo) state.trackInfo = getTrack();
            paintHeader();
            if (state.renderedFor !== state.token) render();
            else { state.idx = -2; tick(true); }
            syncLoop();
        } else {
            if (state.cinema) setCinema(false);
            setPanel.hidden = true;
            syncLoop();
        }
    }
    const toggle = () => setOpen(!state.open);

    // ---------- ad blocker ----------
    // Best effort: Spotify changes these internals often, so parts of this may stop working after an update.
    // Audio ads are muted and skipped; ad banners and upgrade buttons are hidden with CSS.
    const adBlock = (() => {
        const CSS_ID = "bsl-adblock-css";
        const HIDE = [
            ".main-leaderboardComponent-container",
            ".sponsor-container",
            ".main-topBar-UpgradeButton",
            '[data-testid="upgrade-button"]',
            '[aria-label="Upgrade to Premium"]',
        ];
        let on = false, muted = false, wasMuted = false, poll = 0;

        const isAd = (item) => {
            if (!item) return false;
            const m = item.metadata || {};
            return item.type === "ad" || (item.uri || m.uri || "").startsWith("spotify:ad:") || m.is_advertisement === "true";
        };

        function disableManagers() {
            const am = Spicetify.Platform?.AdManagers;
            if (!am) return;
            for (const mgr of Object.values(am)) {
                try { Promise.resolve(mgr?.disable?.()).catch(() => {}); } catch {}
            }
        }

        function restore() {
            if (muted) { if (!wasMuted) Spicetify.Player.setMute(false); muted = false; }
            if (poll) { clearInterval(poll); poll = 0; }
        }

        function check() {
            if (!on) return;
            const item = Spicetify.Player.data?.item ?? Spicetify.Player.data?.track;
            if (isAd(item)) {
                if (!muted) { wasMuted = Spicetify.Player.getMute(); Spicetify.Player.setMute(true); muted = true; }
                try { Spicetify.Player.next(); } catch {}
                if (!poll) poll = setInterval(check, 500);
            } else {
                restore();
            }
        }

        function set(v) {
            on = !!v;
            document.getElementById(CSS_ID)?.remove();
            if (on) {
                const st = document.createElement("style");
                st.id = CSS_ID;
                st.textContent = HIDE.join(",") + "{display:none!important}";
                document.head.appendChild(st);
                disableManagers();
                check();
            } else {
                restore();
            }
        }
        return { set, check, isAd };
    })();

    // ---------- cinema view ----------
    state.cinema = false;
    state.fs = false;
    let idleT = 0;
    function wake() {
        root.classList.remove("idle");
        clearTimeout(idleT);
        if (state.cinema) idleT = setTimeout(() => root.classList.add("idle"), 3000);
    }
    function recenter() {
        if (state.synced && state.open) { state.idx = -2; tick(true); }
    }
    function setCinema(v) {
        if (v === state.cinema || (v && !state.open)) return;
        state.cinema = v;
        root.classList.toggle("cinema", v);
        setPanel.hidden = true;
        if (v) {
            Promise.resolve(root.requestFullscreen?.()).then(() => { state.fs = !!document.fullscreenElement; }).catch(() => {});
            wake();
        } else {
            clearTimeout(idleT);
            root.classList.remove("idle");
            state.fs = false;
            if (document.fullscreenElement) Promise.resolve(document.exitFullscreen?.()).catch(() => {});
        }
        place();
        setTimeout(recenter, 80);
    }

    // ---------- settings menu ----------
    const setPanel = document.createElement("div");
    setPanel.className = "bsl-set";
    setPanel.hidden = true;
    root.appendChild(setPanel);

    function h(tag, props = {}, ...kids) {
        const e = document.createElement(tag);
        Object.assign(e, props);
        e.append(...kids);
        return e;
    }
    const STYLES = [
        ["default", "Karaoke (default)"],
        ["apple", "Apple Music"],
        ["tidal", "Tidal"],
        ["spotify", "Spotify"],
        ["yt", "YT Music"],
    ];
    function cycleStyle() {
        const i = STYLES.findIndex(([k]) => k === S.style);
        S.style = STYLES[(i + 1) % STYLES.length][0];
        saveSettings();
        applyLook();
        recenter();
        buildSettings();
    }
    function applyLook() {
        root.classList.toggle("lite", S.lite);
        for (const [k] of STYLES) root.classList.toggle("s-" + k, S.style === k);
        root.style.setProperty("--bsl-scale", String(S.scale / 100));
    }
    let reloadT = 0;
    function reloadLyrics() {
        clearTimeout(reloadT);
        reloadT = setTimeout(() => { cache.clear(); onSong(); }, 300);
    }
    function slider(label, key, min, max, step, fmtVal, onChange) {
        const val = h("span", { className: "bsl-val" });
        const inp = h("input", { type: "range", min, max, step, value: S[key] });
        const sync = () => { val.textContent = fmtVal(S[key]); };
        inp.addEventListener("input", () => { S[key] = Number(inp.value); sync(); saveSettings(); onChange?.(); });
        sync();
        return h("label", { className: "bsl-row" }, h("span", { className: "bsl-lbl" }, label, val), inp);
    }
    function selectRow(label, key, options, onChange) {
        const sel = h("select", {});
        for (const [v, name] of options) sel.append(h("option", { value: v, textContent: name }));
        sel.value = S[key];
        sel.addEventListener("change", () => { S[key] = sel.value; saveSettings(); onChange?.(); });
        return h("label", { className: "bsl-row" }, h("span", { className: "bsl-lbl" }, label), sel);
    }
    function toggleRow(label, key, onChange) {
        const inp = h("input", { type: "checkbox", checked: !!S[key] });
        inp.addEventListener("change", () => { S[key] = inp.checked; saveSettings(); onChange?.(); });
        return h("label", { className: "bsl-check" }, inp, h("span", {}, label));
    }
    const provBox = h("div", { className: "bsl-provs" });
    function renderProviders() {
        provBox.textContent = "";
        S.order.forEach((id, i) => {
            const on = h("input", { type: "checkbox", checked: !S.off.includes(id) });
            on.addEventListener("change", () => {
                S.off = on.checked ? S.off.filter((x) => x !== id) : [...S.off, id];
                saveSettings();
                reloadLyrics();
            });
            const move = (d) => {
                const j = i + d;
                if (j < 0 || j >= S.order.length) return;
                [S.order[i], S.order[j]] = [S.order[j], S.order[i]];
                saveSettings();
                renderProviders();
                reloadLyrics();
            };
            const up = h("button", { type: "button", className: "bsl-mini", title: "Move up", textContent: "▲" });
            const down = h("button", { type: "button", className: "bsl-mini", title: "Move down", textContent: "▼" });
            up.addEventListener("click", () => move(-1));
            down.addEventListener("click", () => move(1));
            provBox.append(
                h("div", { className: "bsl-prov" }, h("label", { className: "bsl-check" }, on, h("span", {}, PROVIDERS[id].name)), up, down)
            );
        });
    }
    function buildSettings() {
        setPanel.textContent = "";
        renderProviders();
        const reset = h("button", { type: "button", className: "bsl-reset", textContent: "Reset to defaults" });
        reset.addEventListener("click", () => {
            ["bsl-settings", "bsl-lite", "bsl-providers"].forEach((k) => localStorage.removeItem(k));
            Object.assign(S, loadSettings());
            buildSettings();
            applyLook();
            recenter();
            adBlock.set(S.adblock);
            reloadLyrics();
        });
        setPanel.append(
            h("h2", { className: "bsl-h", textContent: "Settings" }),
            selectRow("Lyrics style", "style", STYLES, () => { applyLook(); recenter(); }),
            slider("Sync offset", "offset", -600, 1000, 20, (v) => (v > 0 ? "+" : "") + v + " ms"),
            h("p", { className: "bsl-hint", textContent: "Raise it if lyrics show up late, lower it if they show up early." }),
            slider("Text size", "scale", 70, 150, 5, (v) => v + "%", () => { applyLook(); setTimeout(recenter, 50); }),
            toggleRow("Lite mode (faster on old PCs)", "lite", () => { applyLook(); recenter(); }),
            toggleRow("Block ads", "adblock", () => adBlock.set(S.adblock)),
            h("h3", { className: "bsl-h2", textContent: "Lyric sources" }),
            provBox,
            reset
        );
    }

    // ---------- events ----------
    ui.close.addEventListener("click", () => setOpen(false));
    ui.cin.addEventListener("click", () => setCinema(!state.cinema));
    ui.gear.addEventListener("click", () => { setPanel.hidden = !setPanel.hidden; });
    ui.prev.addEventListener("click", () => Spicetify.Player.back());
    ui.next.addEventListener("click", () => Spicetify.Player.next());
    ui.pp.addEventListener("click", () => Spicetify.Player.togglePlay());
    root.addEventListener("mousemove", wake);
    document.addEventListener("fullscreenchange", () => {
        if (state.cinema && state.fs && !document.fullscreenElement) { state.fs = false; setCinema(false); }
    });
    ui.track.addEventListener("click", (e) => {
        const el = e.target.closest(".bsl-line");
        if (!el || !state.synced) return;
        Spicetify.Player.seek(state.lines[+el.dataset.i].t);
        setTimeout(() => tick(true), 50);
    });
    ui.track.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.target.click(); }
    });
    document.addEventListener("keydown", (e) => {
        if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "l") { e.preventDefault(); toggle(); return; }
        if (!state.open) return;
        if (e.key === "Escape") {
            if (!setPanel.hidden) setPanel.hidden = true;
            else if (state.cinema) setCinema(false);
            else setOpen(false);
            return;
        }
        const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || "") || e.target?.isContentEditable;
        if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key.toLowerCase() === "f") { e.preventDefault(); setCinema(!state.cinema); }
        else if (e.key === " " && state.cinema) { e.preventDefault(); Spicetify.Player.togglePlay(); }
        else if (e.key.toLowerCase() === "s") { e.preventDefault(); cycleStyle(); }
    });
    document.addEventListener("visibilitychange", syncLoop);

    let resizeT = 0;
    window.addEventListener("resize", () => {
        if (!state.open) return;
        clearTimeout(resizeT);
        resizeT = setTimeout(() => { place(); if (state.synced) tick(true); }, 150);
    });

    Spicetify.Player.addEventListener("songchange", onSong);
    Spicetify.Player.addEventListener("songchange", () => adBlock.check());
    Spicetify.Player.addEventListener("onplaypause", () => adBlock.check());
    Spicetify.Player.addEventListener("onplaypause", () => { syncLoop(); tick(); });
    Spicetify.Player.addEventListener("onprogress", () => { if (!state.timer) tick(); }); // seeks while paused
    Spicetify.Player.addEventListener("appchange", () => setOpen(false));

    // playbar button (falls back to Alt+L only if the API isn't there)
    try {
        if (Spicetify.Playbar?.Button) {
            const icon =
                Spicetify.SVGIcons?.lyrics ||
                '<path d="M2 3h12v1.5H2zM2 7.25h12v1.5H2zM2 11.5h8V13H2z"/>';
            playbarBtn = new Spicetify.Playbar.Button("Lyrics (Alt+L)", icon, toggle, false, false);
        }
    } catch (e) {
        console.warn("[Better Spicy Lyrics] Playbar button unavailable, use Alt+L.", e);
    }

    applyLook();
    buildSettings();
    adBlock.set(S.adblock);
    onSong();
    console.log(`[Better Spicy Lyrics] Ready${S.lite ? " (lite mode)" : ""}`);
})();
