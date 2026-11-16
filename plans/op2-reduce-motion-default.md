# op2-reduce-motion-default

## Goal
A first run on a device that asks for reduced motion starts with Reduce motion on in Options.

## Ruling
OPR2 (a), picked by Caelan: yes, follow the device; once a choice is saved in Options, the saved choice always wins, both ways.

## Behaviour
- No saved reduce-motion choice: the value is the device's `prefers-reduced-motion: reduce` answer.
- A saved true or false is used as saved, whatever the device says.
- The device value is not written to disk until the player picks, so it keeps following the device until then.
- Reset to defaults returns to following the device.
- The media query is read through `globalThis.matchMedia` inside try/catch; with none (node tests) it reads false.

## Acceptance
`tests/settings-reduce-motion.test.js` covers: no matchMedia, device on/off with nothing saved, saved false beating device on, saved true beating device off, matchMedia throwing, device value not persisted by other writes, reset.

## Out of scope
Options UI, CSS, any other setting's default.
