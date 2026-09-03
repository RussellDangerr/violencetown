// settings.js — player-facing options, persisted independently of the save blob.
//
// Accessibility / audio preferences belong to the *device*, not to a run, so
// they live under their own localStorage key (`violencetown.settings`) and
// survive RESTART / save-wipe. The save system never touches them and they
// never touch the save system — clearing one leaves the other intact.
//
// Mirrors save.js's defensive posture: every localStorage access is wrapped in
// try/catch (private-mode / quota / disabled storage all degrade to in-memory
// defaults) and values are clamped + type-checked on load — never trust what
// came back from disk. A single module-level `current` object is the live
// source of truth; the UI reads/writes it through the exported helpers.

export const SETTINGS_VERSION = 1;
const KEY = 'violencetown.settings';

// Authoritative defaults. Any field missing or invalid on load falls back to
// the matching value here. Volumes are 0..1 floats; flags are booleans.
export const DEFAULTS = Object.freeze({
    version:     SETTINGS_VERSION,
    musicVolume: 0.7,
    sfxVolume:   0.8,
    reduceMotion: false,   // suppress / dampen screenshake + flash
    // MUTED BY DEFAULT, and this is a RULING rather than a placeholder.
    //
    // (Caelan, 2026-09-02) The previous comment here said "default-ON until
    // audio/music is intentionally worked on", which read as a stale TODO — so
    // it got flipped to false on the grounds that a silent demo undersells the
    // procedural audio. He overruled it the same day: sound firing the instant
    // someone clicks GAME START "is too janky to be auto-playing on click".
    //
    // He is right, and the reasoning is worth keeping because the alternative is
    // seductive: yes, Web Audio needs a gesture and the splash button is one, so
    // unmuting is technically well-behaved. It is still the wrong default. A
    // stranger opening a link — on a work laptop, in an open office, beside
    // someone else — should choose to make noise, not discover they already are.
    //
    // The real problem the flip was aiming at (nobody knows the audio exists) is
    // a DISCOVERABILITY problem and wants a visible sound control, not autoplay.
    //
    // Do not flip this again without asking him.
    muted:        true,    // hard mute, independent of the two volumes
    firstRunHintSeen: false, // (pointer model) one-time "tap to move" hint shown?
    // (Slice 2) how the action wheel opens: 'tap-toggle' (tap opens + stays —
    // today's behaviour) or 'hold' (press-and-hold opens, release closes).
    // Toggled in Options; the opener reads it live via Settings.get().
    wheelOpenMode: 'tap-toggle',
    // (threat overlay) How enemy vision is drawn. 'shadow' stipples the tiles
    // NOBODY can see, so the safe ground is what you read; 'danger' tints the
    // watched ones instead. Two readings of the same field — some players hunt
    // for cover, some track the threat.
    threatStyle: 'shadow',
    // (hints) Which situational one-shots have fired, as a comma-joined id
    // list. A LIST rather than a flag each, because hints.js is meant to grow —
    // a new lesson should be a row in that table and nothing else, and a new
    // boolean here per hint would make every addition a three-file change.
    // Superseded `blindSpotHintSeen`, which is still coerced below so an
    // existing player who already learned that one is not told again.
    hintsSeen: '',
});

// Live, mutable copy of the settings. Seeded with defaults so callers can read
// safely before load() runs (it runs on boot, but defensive code is cheap).
let current = { ...DEFAULTS };

// Subscribers notified after any persisted change. Lets audio.js (when present)
// or the renderer react without settings.js importing them — inversion keeps
// this module dependency-free, as the no-build / zero-dep mandate requires.
const listeners = new Set();

// ── Clamp / coerce helpers ───────────────────────────────────────────────────

function clamp01(v, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return n < 0 ? 0 : n > 1 ? 1 : n;
}

function asBool(v, fallback) {
    return typeof v === 'boolean' ? v : fallback;
}

// Coerce to one of a fixed set of allowed values, else the fallback — the
// string-enum counterpart to clamp01/asBool (used by wheelOpenMode).
function asEnum(v, allowed, fallback) {
    return allowed.includes(v) ? v : fallback;
}

// Coerce an arbitrary parsed object into a fully-valid settings object. Unknown
// keys are dropped; missing/invalid known keys fall back to DEFAULTS. Pure —
// returns a fresh object, never mutates its input.
export function validate(raw) {
    const o = (raw && typeof raw === 'object') ? raw : {};
    return {
        version:      SETTINGS_VERSION,
        musicVolume:  clamp01(o.musicVolume, DEFAULTS.musicVolume),
        sfxVolume:    clamp01(o.sfxVolume,   DEFAULTS.sfxVolume),
        reduceMotion: asBool(o.reduceMotion, DEFAULTS.reduceMotion),
        muted:        asBool(o.muted,        DEFAULTS.muted),
        firstRunHintSeen: asBool(o.firstRunHintSeen, DEFAULTS.firstRunHintSeen),
        wheelOpenMode:    asEnum(o.wheelOpenMode, ['hold', 'tap-toggle'], DEFAULTS.wheelOpenMode),
        // validate() DROPS unknown keys, so a field added to DEFAULTS and not
        // here is silently discarded on every load — it would read correctly all
        // session and reset on reload.
        threatStyle:      asEnum(o.threatStyle, ['shadow', 'danger'], DEFAULTS.threatStyle),
        hintsSeen: (typeof o.hintsSeen === 'string') ? o.hintsSeen
                 : (o.blindSpotHintSeen === true ? 'blindSpot' : DEFAULTS.hintsSeen),
    };
}

// ── Load / persist ───────────────────────────────────────────────────────────

// Read + validate from localStorage into `current`. Idempotent; call once on
// boot. Returns the live settings object so callers can `const s = load()`.
export function load() {
    try {
        const s = localStorage.getItem(KEY);
        if (s) {
            const parsed = JSON.parse(s);
            current = validate(parsed);
        } else {
            current = { ...DEFAULTS };
        }
    } catch (e) {
        // Corrupt JSON, disabled storage, etc. — fall back to defaults rather
        // than crashing the boot path. Settings are non-critical.
        console.warn('[settings] load failed, using defaults', e);
        current = { ...DEFAULTS };
    }
    return current;
}

// Write `current` to localStorage. Swallows failures (quota / private mode):
// the in-memory copy still drives the session, it just won't persist.
function persist() {
    try {
        localStorage.setItem(KEY, JSON.stringify(current));
    } catch (e) {
        console.warn('[settings] persist failed (not saved)', e);
    }
}

// ── Read / write API ─────────────────────────────────────────────────────────

// Snapshot of the live settings. Returns a copy so callers can't mutate the
// store without going through set()/update() (which persist + notify).
export function getSettings() {
    return { ...current };
}

// Convenience single-key reader.
export function get(key) {
    return current[key];
}

// Set one field, re-validating the whole object so an out-of-range write can't
// poison the store. Persists and notifies only when the value actually changed.
export function set(key, value) {
    if (!(key in DEFAULTS) || key === 'version') return;
    const next = validate({ ...current, [key]: value });
    if (next[key] === current[key]) return; // no-op — skip churn
    current = next;
    persist();
    notify();
}

// Apply a patch of several fields at once (one persist + one notify).
export function update(patch) {
    if (!patch || typeof patch !== 'object') return;
    current = validate({ ...current, ...patch });
    persist();
    notify();
}

// Restore every field to its default. Used by a "reset to defaults" affordance.
export function reset() {
    current = { ...DEFAULTS };
    persist();
    notify();
}

// ── Subscription ─────────────────────────────────────────────────────────────

// Register fn to run after any persisted change; returns an unsubscribe fn.
export function subscribe(fn) {
    if (typeof fn === 'function') listeners.add(fn);
    return () => listeners.delete(fn);
}

function notify() {
    for (const fn of listeners) {
        try { fn(getSettings()); } catch (e) { console.warn('[settings] listener threw', e); }
    }
}

// ── Effective audio levels ───────────────────────────────────────────────────
//
// The single place that folds `muted` into the per-channel volumes, so audio
// code (whenever it lands) doesn't each re-implement the mute rule. Returns
// 0 for a channel when muted; otherwise the stored volume.

export function effectiveMusicVolume() {
    return current.muted ? 0 : current.musicVolume;
}

export function effectiveSfxVolume() {
    return current.muted ? 0 : current.sfxVolume;
}

// Push the current levels into an audio manager *if one exists*. Defensive by
// design: feat/audio's manager isn't a hard dependency, so we duck-type every
// setter and silently no-op anything that's absent. After feat/audio merges,
// wiring its manager in here (or via subscribe()) is all that's needed for the
// sliders to drive real volume — no changes to the settings store itself.
export function applyToAudio(audio) {
    if (!audio) return;
    try {
        if (typeof audio.setMusicVolume === 'function') audio.setMusicVolume(effectiveMusicVolume());
        if (typeof audio.setSfxVolume   === 'function') audio.setSfxVolume(effectiveSfxVolume());
        if (typeof audio.setMuted       === 'function') audio.setMuted(current.muted);
    } catch (e) {
        console.warn('[settings] applyToAudio failed', e);
    }
}
