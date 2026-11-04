// tv-intro.js — the game opens like a TV switching on (plans/tv1-tv-opening.md).
//
// What plays before the title screen: black, a thin bright line across the
// middle that grows out from a dot, the line opening up and down into the
// picture (an episode title card), the card holding, then melting into the
// title screen. All drawn from rects and text, nothing imported. Pure: numbers
// in, numbers out; the renderer hands drawTvIntro a canvas context and main.js
// owns the clock and the keys.
//
// Every number below is a stand-in for Caelan's eye, not a tuning decision.
// Brightness only ever ramps: nothing here flashes.

export const BLACK_MS   = 250;   // dark before anything
export const LINE_MS    = 350;   // the line grows from a dot to the full width
export const OPEN_MS    = 400;   // the line opens into the picture
export const HOLD_MS    = 700;   // the title card holds
export const FADE_MS    = 250;   // the card melts into the title screen
export const TOTAL_MS   = BLACK_MS + LINE_MS + OPEN_MS + HOLD_MS + FADE_MS;   // 1950, under two seconds
export const STILL_MS   = 1400;  // reduce motion: how long the still card shows before the title

export const W = 320, H = 220;   // the splash canvas's logical size
export const LINE_PX = 2;        // the line's thickness
export const LINE_LEVEL = 0.82;  // its brightest (of full white): warm, not blinding

// The title card's words. The game's name is real; the rest is stand-in text.
export const CARD = Object.freeze({
    name:  'VIOLENCETOWN',
    lines: Object.freeze(['[TEXT]', '[TEXT]']),
});

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ease = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };

// The picture at `ms` after the opening began.
//   done      — the opening is over; the title screen stands alone
//   lineW     — the line's width, 0..1 of the screen
//   lineLevel — its brightness, 0..1
//   open      — how far the picture has opened from the middle, 0..1
//   cardAlpha — how much of the card still covers the title screen, 0..1
//   still     — reduce motion: the card shows as it is, nothing moves
export function introAt(ms, { reduceMotion = false } = {}) {
    if (!(ms >= 0)) ms = 0;
    if (reduceMotion) {
        return ms >= STILL_MS
            ? { done: true, lineW: 0, lineLevel: 0, open: 1, cardAlpha: 0, still: true }
            : { done: false, lineW: 0, lineLevel: 0, open: 1, cardAlpha: 1, still: true };
    }
    if (ms >= TOTAL_MS) return { done: true, lineW: 0, lineLevel: 0, open: 1, cardAlpha: 0, still: false };
    const t1 = BLACK_MS, t2 = t1 + LINE_MS, t3 = t2 + OPEN_MS, t4 = t3 + HOLD_MS;
    if (ms < t1) return { done: false, lineW: 0, lineLevel: 0, open: 0, cardAlpha: 1, still: false };
    if (ms < t2) {
        const t = ease((ms - t1) / LINE_MS);
        return { done: false, lineW: t, lineLevel: LINE_LEVEL * t, open: 0, cardAlpha: 1, still: false };
    }
    if (ms < t3) {
        const t = ease((ms - t2) / OPEN_MS);
        return { done: false, lineW: 1, lineLevel: LINE_LEVEL * (1 - t), open: t, cardAlpha: 1, still: false };
    }
    if (ms < t4) return { done: false, lineW: 1, lineLevel: 0, open: 1, cardAlpha: 1, still: false };
    return { done: false, lineW: 1, lineLevel: 0, open: 1, cardAlpha: 1 - ease((ms - t4) / FADE_MS), still: false };
}

// Does this key press skip the opening? Any key does, except a modifier on its
// own or a browser shortcut (reload, devtools, a function key).
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'NumLock', 'ScrollLock', 'Dead', 'Unidentified', 'OS']);
export function isSkipKey(e) {
    if (!e) return false;
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    const key = e.key ?? '';
    if (MODIFIERS.has(key)) return false;
    if (/^F\d{1,2}$/.test(key)) return false;
    return true;
}

const warm = (level) => {
    const v = Math.round(255 * clamp01(level));
    return `rgb(${v},${Math.round(v * 0.96)},${Math.round(v * 0.86)})`;   // a warm white
};

// Draw the opening at frame `f` (from introAt) onto a 320x220 splash context
// whose transform is already set. Once the card begins to fade it draws over
// whatever is already there (the title screen), so draw that first.
export function drawTvIntro(ctx, font, f) {
    if (!f || f.done) return;
    const cx = W / 2, cy = H / 2;
    const fading = f.cardAlpha < 1;
    const prevAlpha = ctx.globalAlpha;
    if (fading) ctx.globalAlpha = prevAlpha * f.cardAlpha;
    else { ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, W, H); }

    if (f.open > 0) {
        // The picture: the card, drawn whole, with black bars over what the
        // opening has not reached yet.
        ctx.fillStyle = '#14100b';
        ctx.fillRect(0, 0, W, H);
        if (font) {
            font.drawText(ctx, CARD.name, cx + 2, 78 + 2, { color: '#6a5320', scale: 3, align: 'center' });
            font.drawText(ctx, CARD.name, cx, 78, { color: '#d4b96a', scale: 3, align: 'center' });
        }
        ctx.fillStyle = '#8b7340';
        ctx.fillRect(66, 112, 188, 1);
        ctx.fillStyle = '#9bb43e';
        ctx.fillRect(64, 111, 3, 3);
        ctx.fillRect(253, 111, 3, 3);
        if (font) {
            CARD.lines.forEach((line, i) => {
                font.drawText(ctx, line, cx, 126 + i * 16, { color: '#a89878', scale: 1.5, align: 'center' });
            });
        }
        if (f.open < 1) {
            const half = Math.round(cy * f.open);
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, W, cy - half);
            ctx.fillRect(0, cy + half, W, H - (cy + half));
            // the bright edges of the opening picture, fading as it settles
            ctx.fillStyle = warm(f.lineLevel);
            ctx.fillRect(0, cy - half - 1, W, 1);
            ctx.fillRect(0, cy + half, W, 1);
        }
    } else if (f.lineW > 0) {
        const w = Math.max(2, Math.round(W * f.lineW));
        ctx.fillStyle = warm(f.lineLevel);
        ctx.fillRect(Math.round(cx - w / 2), cy - LINE_PX / 2, w, LINE_PX);
    }
    ctx.globalAlpha = prevAlpha;
}
