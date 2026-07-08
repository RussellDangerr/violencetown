// audio.js — tiny, dependency-free sound for Violencetown.
//
// Everything here is SYNTHESIZED at runtime with the Web Audio API — there are
// no binary asset files to ship, license, or cache-bust. SFX are short
// oscillator/noise bursts shaped by gain envelopes; music is a couple of
// looping chord/arpeggio voices over a slow LFO so the world doesn't read as
// "broken/silent". Nothing copyrighted ever enters the graph.
//
// Browser autoplay policy: an AudioContext created before a user gesture starts
// "suspended" and stays mute. So init() is LAZY — main.js calls it from the
// splash GAME START / Space handler (the first real gesture), and we resume()
// there. Calls that arrive before init() are cheap no-ops, so wiring a playSfx
// at a hook site can never crash even on the very first frame.
//
// Determinism note: gameplay randomness lives on game.rng. The tiny variation
// here (e.g. footstep pitch jitter) is purely cosmetic audio and intentionally
// uses Math.random — it never touches game state, so seeding it buys nothing
// (same rationale the renderer's screen-shake uses).

// ── Tunables ─────────────────────────────────────────────────────────────────

const DEFAULT_SFX_VOLUME   = 0.55; // 0..1 — sane default; a settings UI may override later
const DEFAULT_MUSIC_VOLUME = 0.18; // music sits well under SFX so it's a bed, not a wall
const MASTER_CEILING       = 0.9;  // hard cap so stacked SFX never clip painfully

// Note → frequency (Hz). Small table; we only need a handful for stings/beds.
const NOTE = {
    A1:  55.00, C2:  65.41, D2:  73.42, E2:  82.41, G2:  98.00,
    A2: 110.00, C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00,
    A3: 220.00, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00,
    A4: 440.00, C5: 523.25, E5: 659.25, G5: 783.99,
};

// ── AudioManager ─────────────────────────────────────────────────────────────

class AudioManager {
    constructor() {
        this.ctx          = null;   // AudioContext, created lazily in init()
        this.master       = null;   // master gain → destination
        this.sfxGain      = null;   // SFX bus
        this.musicGain    = null;   // music bus
        // Default-muted: the graph is built silent so nothing sounds in the
        // window before Settings.applyToAudio() runs on the first gesture.
        // Settings (DEFAULTS.muted) is authoritative and will unmute on boot if
        // the player has explicitly turned sound on.
        this.muted        = true;
        this.sfxVolume    = DEFAULT_SFX_VOLUME;
        this.musicVolume  = DEFAULT_MUSIC_VOLUME;

        this._inited      = false;
        this._noiseBuffer = null;   // reusable white-noise buffer for percussive SFX
        this._music       = null;   // { track, nodes:[], timer } for the running bed
        this._currentTrack = null;  // name of the playing track (so re-requests no-op)
    }

    // Lazily build the audio graph. Safe to call repeatedly; only the first
    // call does work. MUST be triggered from a user gesture (click/keydown) or
    // the context starts suspended and nothing is audible.
    init() {
        if (this._inited) {
            // Already built — a later gesture may still need to resume() a
            // context the browser auto-suspended (e.g. after a tab switch).
            this._resume();
            return;
        }
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { this._inited = true; return; } // no Web Audio → silent, but never throw

        try {
            this.ctx = new AC();

            this.master = this.ctx.createGain();
            this.master.gain.value = this.muted ? 0 : MASTER_CEILING;
            this.master.connect(this.ctx.destination);

            this.sfxGain = this.ctx.createGain();
            this.sfxGain.gain.value = this.sfxVolume;
            this.sfxGain.connect(this.master);

            this.musicGain = this.ctx.createGain();
            this.musicGain.gain.value = this.musicVolume;
            this.musicGain.connect(this.master);

            this._buildNoiseBuffer();
        } catch (e) {
            // Construction can throw on locked-down browsers — degrade to silent.
            console.warn('[audio] init failed, running silent', e);
            this.ctx = null;
        }
        this._inited = true;
        this._resume();
    }

    // Resume a suspended context (browsers suspend on creation pre-gesture and
    // again when a tab is backgrounded). No-op if there's nothing to resume.
    _resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            // Promise rejection is harmless here (e.g. gesture lost the race).
            this.ctx.resume().catch(() => {});
        }
    }

    // One second of white noise we slice envelopes out of for percussive SFX
    // (footsteps, wall bumps, hit impacts). Built once, reused per shot.
    _buildNoiseBuffer() {
        const len = Math.floor(this.ctx.sampleRate * 1.0);
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        this._noiseBuffer = buf;
    }

    // True when we're live and audible — every play* method guards on this so
    // pre-init / silent-fallback / muted states are cheap no-ops.
    get _live() {
        return !!this.ctx && !this.muted;
    }

    // ── Volume / mute ────────────────────────────────────────────────────────

    setSfxVolume(v) {
        this.sfxVolume = clamp01(v);
        if (this.sfxGain) this.sfxGain.gain.value = this.sfxVolume;
    }

    setMusicVolume(v) {
        this.musicVolume = clamp01(v);
        if (this.musicGain) this.musicGain.gain.value = this.musicVolume;
    }

    // Flip mute. Drives the master gain so both SFX and music cut together;
    // the music voices keep running silently and snap back on unmute.
    setMuted(m) {
        this.muted = !!m;
        if (this.master) this.master.gain.value = this.muted ? 0 : MASTER_CEILING;
    }

    // ── SFX ──────────────────────────────────────────────────────────────────

    // Play a named one-shot. Unknown names are ignored (so a typo at a call
    // site degrades to silence, never an exception). All recipes are tiny so a
    // burst of them (e.g. a multi-hit turn) stays cheap.
    playSfx(name) {
        if (!this._live) return;
        const recipe = SFX[name];
        if (recipe) recipe(this);
    }

    // ── Tone / noise primitives ─────────────────────────────────────────────
    // Small helpers the SFX recipes compose. Each schedules its own envelope
    // and self-stops, so nodes are fire-and-forget (GC'd once they finish).

    // A pitched blip: oscillator from f0→f1 (Hz) over `dur` s with an
    // attack/decay gain envelope. `type` is an OscillatorType.
    _tone(f0, f1, dur, { type = 'square', gain = 0.5, attack = 0.005, when = 0 } = {}) {
        const t0 = this.ctx.currentTime + when;
        const osc = this.ctx.createOscillator();
        const g   = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(Math.max(1, f0), t0);
        if (f1 && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);

        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

        osc.connect(g);
        g.connect(this.sfxGain);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
    }

    // A noise burst through a band/low/high-pass filter — the percussive layer
    // for steps, bumps, and impacts.
    _noise(dur, { type = 'lowpass', freq = 1200, q = 1, gain = 0.5, when = 0 } = {}) {
        const t0 = this.ctx.currentTime + when;
        const src = this.ctx.createBufferSource();
        src.buffer = this._noiseBuffer;
        const offset = Math.random() * 0.5; // vary the slice so repeats don't phase-lock
        const flt = this.ctx.createBiquadFilter();
        flt.type = type;
        flt.frequency.value = freq;
        flt.Q.value = q;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(gain, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

        src.connect(flt);
        flt.connect(g);
        g.connect(this.sfxGain);
        src.start(t0, offset, dur + 0.02);
        src.stop(t0 + dur + 0.05);
    }

    // ── Music ────────────────────────────────────────────────────────────────

    // Start a looping ambient bed. Tracks are synthesized, not files; 'town'
    // and 'sewer' differ in scale/tempo/timbre so the zone shift is audible.
    // Re-requesting the already-playing track is a no-op (so per-frame or
    // per-map-load calls don't restart it). Unknown tracks fall back to 'town'.
    playMusic(track = 'town', { loop = true } = {}) {
        if (!this.ctx) return;                 // pre-init: nothing to do yet
        if (this._currentTrack === track && this._music) return; // already playing it
        this.stopMusic();

        const def = MUSIC[track] || MUSIC.town;
        this._currentTrack = track;
        this._music = { track, nodes: [], timer: null, loop };

        // A slow drone pad: two detuned saws an octave apart, gently filtered,
        // giving a continuous bed under the arpeggio.
        for (const f of def.padNotes) {
            const osc = this.ctx.createOscillator();
            const g   = this.ctx.createGain();
            const flt = this.ctx.createBiquadFilter();
            osc.type = 'sawtooth';
            osc.frequency.value = f;
            osc.detune.value = (Math.random() * 2 - 1) * 6; // a few cents of life
            flt.type = 'lowpass';
            flt.frequency.value = def.padCutoff;
            g.gain.value = def.padGain;
            osc.connect(flt); flt.connect(g); g.connect(this.musicGain);
            osc.start();
            this._music.nodes.push(osc, g, flt);
        }

        // A slow LFO wobbling the pad gain so the bed breathes instead of
        // sitting flat. Cosmetic; cheap.
        const lfo  = this.ctx.createOscillator();
        const lfoG = this.ctx.createGain();
        lfo.type = 'sine';
        lfo.frequency.value = def.breathHz;
        lfoG.gain.value = def.padGain * 0.4;
        lfo.connect(lfoG);
        // Drive the music bus a touch so the whole bed swells/ebbs.
        lfoG.connect(this.musicGain.gain);
        lfo.start();
        this._music.nodes.push(lfo, lfoG);

        // Sequenced arpeggio over the bed. setInterval steps a tiny pattern;
        // each step is a short pluck. Kept off the render path so it can't
        // stutter the frame loop.
        let step = 0;
        const stepMs = def.stepMs;
        const playStep = () => {
            if (!this._music) return;
            const n = def.seq[step % def.seq.length];
            step++;
            if (n == null) return; // rest
            this._tone(n, n, def.plkDur, {
                type: def.plkType, gain: def.plkGain, attack: 0.01,
            });
        };
        playStep();
        this._music.timer = setInterval(playStep, stepMs);
    }

    // Stop the bed and tear down its nodes. Idempotent.
    stopMusic() {
        if (!this._music) { this._currentTrack = null; return; }
        if (this._music.timer) clearInterval(this._music.timer);
        for (const node of this._music.nodes) {
            try {
                if (typeof node.stop === 'function') node.stop();
                if (typeof node.disconnect === 'function') node.disconnect();
            } catch (e) { /* already stopped — ignore */ }
        }
        this._music = null;
        this._currentTrack = null;
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function clamp01(v) {
    v = Number(v);
    if (!isFinite(v)) return 0;
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ── SFX recipes ──────────────────────────────────────────────────────────────
//
// Each entry is (am) => void and composes the _tone / _noise primitives. Names
// match the hook vocabulary in main.js. Durations are deliberately short
// (15–250ms) so the game stays snappy and overlapping shots don't muddy.

const SFX = {
    // Soft, low filtered-noise tick with a pitch wobble — a footstep.
    move(am) {
        am._noise(0.05, { type: 'lowpass', freq: 520 + Math.random() * 120, gain: 0.18 });
    },

    // Dull thud — walked into a wall. Lower, shorter, no tone.
    'bump-wall'(am) {
        am._noise(0.07, { type: 'lowpass', freq: 240, gain: 0.3 });
        am._tone(110, 70, 0.07, { type: 'sine', gain: 0.18 });
    },

    // Bright percussive crack + a quick down-chirp — your hit landed.
    'attack-hit'(am) {
        am._noise(0.06, { type: 'highpass', freq: 2600, gain: 0.28 });
        am._tone(420, 180, 0.10, { type: 'square', gain: 0.28 });
    },

    // Harsher, lower noise burst with a falling sub — the player got hit.
    'take-damage'(am) {
        am._noise(0.12, { type: 'lowpass', freq: 900, q: 0.7, gain: 0.32 });
        am._tone(200, 90, 0.16, { type: 'sawtooth', gain: 0.26 });
    },

    // Two-note falling "K.O." sting — an enemy died.
    'enemy-killed'(am) {
        am._tone(NOTE.A4, NOTE.E4, 0.10, { type: 'square', gain: 0.26 });
        am._tone(NOTE.E4, NOTE.A3, 0.18, { type: 'square', gain: 0.24, when: 0.09 });
        am._noise(0.10, { type: 'bandpass', freq: 1800, q: 1.5, gain: 0.16 });
    },

    // Bright rising two-step ping — picked something up.
    pickup(am) {
        am._tone(NOTE.E5, NOTE.E5, 0.06, { type: 'triangle', gain: 0.24 });
        am._tone(NOTE.G5, NOTE.G5, 0.10, { type: 'triangle', gain: 0.22, when: 0.06 });
    },

    // Soft low "whoomp" — a menu/overlay opened.
    'menu-open'(am) {
        am._tone(NOTE.C3, NOTE.G3, 0.12, { type: 'sine', gain: 0.22 });
    },

    // Crisp confirm blip — selected/used a menu option.
    'menu-confirm'(am) {
        am._tone(NOTE.G4, NOTE.C5, 0.09, { type: 'square', gain: 0.22 });
    },

    // Descending cancel blip — backed out of a menu.
    'menu-cancel'(am) {
        am._tone(NOTE.G4, NOTE.D4, 0.10, { type: 'square', gain: 0.20 });
    },

    // Short high tick — spun/drilled the wheel one slice.
    'menu-tick'(am) {
        am._tone(NOTE.E5, NOTE.E5, 0.035, { type: 'square', gain: 0.13 });
    },

    // Airy upward swish — threw an item.
    throw(am) {
        am._tone(300, 900, 0.18, { type: 'sawtooth', gain: 0.18 });
        am._noise(0.16, { type: 'bandpass', freq: 1400, q: 0.8, gain: 0.12 });
    },

    // Warm rising major arpeggio — drank/ate something that healed you.
    heal(am) {
        am._tone(NOTE.C4, NOTE.C4, 0.10, { type: 'sine', gain: 0.22 });
        am._tone(NOTE.E4, NOTE.E4, 0.10, { type: 'sine', gain: 0.22, when: 0.08 });
        am._tone(NOTE.G4, NOTE.G4, 0.16, { type: 'sine', gain: 0.22, when: 0.16 });
    },

    // Bright triumphant three-note flourish — a quest stage advanced/completed.
    'quest-advance'(am) {
        am._tone(NOTE.C5, NOTE.C5, 0.10, { type: 'triangle', gain: 0.24 });
        am._tone(NOTE.E5, NOTE.E5, 0.10, { type: 'triangle', gain: 0.24, when: 0.10 });
        am._tone(NOTE.G5, NOTE.G5, 0.22, { type: 'triangle', gain: 0.24, when: 0.20 });
    },

    // Long, dark descending tone — you died.
    death(am) {
        am._tone(NOTE.A3, NOTE.A1, 0.7, { type: 'sawtooth', gain: 0.3, attack: 0.02 });
        am._tone(NOTE.E3, NOTE.A1, 0.7, { type: 'square', gain: 0.16, attack: 0.02 });
    },
};

// ── Music beds ───────────────────────────────────────────────────────────────
//
// Two synthesized loops. 'town' is brighter (major-ish, mid tempo); 'sewer' is
// darker and slower (minor, lower pad, murkier filter). padNotes is the
// sustained drone; seq is the arpeggio pattern (null = rest).

const MUSIC = {
    town: {
        padNotes: [NOTE.C2, NOTE.G2],
        padCutoff: 700, padGain: 0.05, breathHz: 0.07,
        seq: [NOTE.C4, NOTE.E4, NOTE.G4, NOTE.E4, NOTE.A3, NOTE.C4, NOTE.E4, null],
        stepMs: 480, plkDur: 0.18, plkType: 'triangle', plkGain: 0.08,
    },
    sewer: {
        padNotes: [NOTE.A1, NOTE.E2],
        padCutoff: 420, padGain: 0.06, breathHz: 0.05,
        seq: [NOTE.A3, null, NOTE.C4, NOTE.D4, null, NOTE.C4, NOTE.A3, null],
        stepMs: 620, plkDur: 0.22, plkType: 'sine', plkGain: 0.07,
    },
};

// ── Singleton ────────────────────────────────────────────────────────────────
// One manager for the whole game (audio is inherently global). main.js imports
// this and wires hooks; nothing else needs to construct an AudioManager.

export const audio = new AudioManager();
