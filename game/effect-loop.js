// effect-loop.js — one tick of the transient visual effects loop.
//
// Damage numbers, hit-splats, heal halos, glows: main.js drives them with a
// requestAnimationFrame loop that runs until nothing is left in flight. The
// loop's fragile part is not the timing, it is what happens when a frame
// throws — so that part lives here, where it is node-testable and cannot drift.
//
// The rule: ONE BAD FRAME COSTS ONE FRAME. The old loop re-armed on the line
// after the render, so a render that threw skipped the re-arm AND left main's
// "already running" flag set — nothing could restart it, and every transient
// effect for the rest of the session silently stopped moving. The thrown error
// is handed back rather than swallowed, so a real bug still reaches the console.
//
// Pure: no DOM, no game state — main.js injects the frame and the question.

export function makeEffectLoop({ render, hasMore, onFrameError, onSettled }) {
    let failures = 0;
    return {
        // Draw one frame. Returns whether the loop should ask for another.
        tick() {
            // Asked BEFORE the frame, so a render that throws cannot change the
            // answer — the loop keeps running on exactly the terms it would have.
            const more = hasMore();
            // And the settle is announced before the last frame draws, not after:
            // main's _render runs _trackFight, which starts a loop when a fight
            // ends (the fog's fade). It can only do that once main has let go of
            // its "already running" flag, so it has to hear about this first.
            if (!more && onSettled) onSettled();
            try {
                render();
            } catch (e) {
                if (onFrameError) onFrameError(e, ++failures);
            }
            return more;
        },
    };
}
