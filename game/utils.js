// utils.js — small helpers (clean slate, no noise/RNG)

export function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
}

export function manhattan(x1, y1, x2, y2) {
    return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

// Chebyshev (chessboard) distance — diagonal steps cost the same as orthogonal,
// so this is the natural metric once movement is 8-way: adjacency (including
// diagonals) is exactly chebyshev === 1.
export function chebyshev(x1, y1, x2, y2) {
    return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
}
