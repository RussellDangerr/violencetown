// bitmap-font.js — canvas UI text.
//
// Originally a hand-drawn 8x8 pixel atlas. Now renders **VT323** (SIL Open Font
// License — bundled at assets/fonts/, license alongside) via canvas fillText.
// As the UI grew ornate (gradients, embossed panels, dusk skyline) the cramped
// 8px bitmap read as the least-legible thing on screen, so we swapped to a crisp
// retro terminal font — while keeping the `BitmapFont` name and the drawText /
// measure API so every caller (renderer.js) is untouched.
//
// VT323 is monospace with advance = 0.4 * fontSize (measured, stable at all
// sizes). We map scale -> fontSize = scale * PX_PER_SCALE (12), which keeps each
// scale's cap-height matching the old 8/16/24px glyphs; the narrower advance
// just leaves a little horizontal slack (never overflow).

const FAMILY = 'VT323';
const PX_PER_SCALE = 12;      // fontSize = scale * PX_PER_SCALE
const ADV_RATIO = 0.4;        // VT323 advance width = 0.4 * fontSize
const TOP_NUDGE = -1;         // 'top' baseline sits ~1px low for VT323; lift it

export class BitmapFont {
    constructor(family = FAMILY) { this.family = family; }

    // Load the VT323 web font and resolve once it's ready, so the very first
    // render already has glyphs (no flash). The arg is kept for call-site
    // compatibility; a *.ttf path is honored, anything else falls back to the
    // bundled VT323.
    static async load(src = 'assets/fonts/VT323.ttf') {
        const url = (typeof src === 'string' && src.endsWith('.ttf')) ? src : 'assets/fonts/VT323.ttf';
        const face = new FontFace(FAMILY, `url('${url}')`);
        await face.load();
        try { document.fonts.add(face); await document.fonts.load(`16px '${FAMILY}'`); } catch { /* headless */ }
        return new BitmapFont();
    }

    // Pixel width of `text`. VT323 is monospace, so this is exact without a ctx.
    measure(text, scale = 1) {
        return text.length * PX_PER_SCALE * scale * ADV_RATIO;
    }

    // Draw `text` anchored by its top-left at (x, y). Options mirror the old
    // atlas API: color, scale (1 / 2 / 3 …), shadow (offset color), align.
    drawText(ctx, text, x, y, opts = {}) {
        const { color = '#ffffff', scale = 1, shadow = null, align = 'left' } = opts;
        ctx.save();
        ctx.font = `${scale * PX_PER_SCALE}px '${this.family}', monospace`;
        ctx.textAlign = align === 'center' ? 'center' : (align === 'right' ? 'right' : 'left');
        ctx.textBaseline = 'top';
        const ox = Math.round(x), oy = Math.round(y) + TOP_NUDGE;
        if (shadow) { ctx.fillStyle = shadow; ctx.fillText(text, ox + scale, oy + scale); }
        ctx.fillStyle = color;
        ctx.fillText(text, ox, oy);
        ctx.restore();
    }
}
