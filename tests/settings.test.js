import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, validate } from '../game/settings.js';

test('DEFAULTS.wheelOpenMode is "tap-toggle"', () => {
  assert.equal(DEFAULTS.wheelOpenMode, 'tap-toggle');
});

test('validate({}) injects wheelOpenMode default', () => {
  const result = validate({});
  assert.equal(result.wheelOpenMode, 'tap-toggle');
});

test('validate({wheelOpenMode:"hold"}) preserves valid enum value', () => {
  const result = validate({ wheelOpenMode: 'hold' });
  assert.equal(result.wheelOpenMode, 'hold');
});

test('validate({wheelOpenMode:"tap-toggle"}) preserves tap-toggle', () => {
  const result = validate({ wheelOpenMode: 'tap-toggle' });
  assert.equal(result.wheelOpenMode, 'tap-toggle');
});

test('validate({wheelOpenMode:"garbage"}) coerces to default "tap-toggle"', () => {
  const result = validate({ wheelOpenMode: 'garbage' });
  assert.equal(result.wheelOpenMode, 'tap-toggle');
});

test('validate({wheelOpenMode:null}) coerces to default', () => {
  const result = validate({ wheelOpenMode: null });
  assert.equal(result.wheelOpenMode, 'tap-toggle');
});

test('validate({wheelOpenMode:undefined}) coerces to default', () => {
  const result = validate({ wheelOpenMode: undefined });
  assert.equal(result.wheelOpenMode, 'tap-toggle');
});

test('validate({wheelOpenMode:123}) coerces to default (not a string)', () => {
  const result = validate({ wheelOpenMode: 123 });
  assert.equal(result.wheelOpenMode, 'tap-toggle');
});

test('validate preserves existing keys: muted, reduceMotion, volumes', () => {
  const result = validate({
    muted: false,
    reduceMotion: true,
    musicVolume: 0.5,
    sfxVolume: 0.6,
    wheelOpenMode: 'hold'
  });
  assert.equal(result.muted, false);
  assert.equal(result.reduceMotion, true);
  assert.equal(result.musicVolume, 0.5);
  assert.equal(result.sfxVolume, 0.6);
  assert.equal(result.wheelOpenMode, 'hold');
});

test('validate drops unknown keys, keeps known keys', () => {
  const result = validate({
    wheelOpenMode: 'hold',
    muted: true,
    unknownKey: 'should-be-dropped',
    anotherBadKey: 42
  });
  assert.equal(result.wheelOpenMode, 'hold');
  assert.equal(result.muted, true);
  assert.ok(!('unknownKey' in result));
  assert.ok(!('anotherBadKey' in result));
});

test('validate with non-object input returns defaults including wheelOpenMode', () => {
  const result1 = validate(null);
  const result2 = validate(undefined);
  const result3 = validate('string');
  assert.equal(result1.wheelOpenMode, 'tap-toggle');
  assert.equal(result2.wheelOpenMode, 'tap-toggle');
  assert.equal(result3.wheelOpenMode, 'tap-toggle');
});

test('validate returns fresh object (not mutating input)', () => {
  const input = { wheelOpenMode: 'hold', muted: false };
  const result = validate(input);
  assert.notEqual(result, input);
  assert.equal(input.wheelOpenMode, 'hold');
  assert.equal(result.wheelOpenMode, 'hold');
});

// ── threatStyle (threat overlay) ─────────────────────────────────────────────
//
// The trap this pins: validate() DROPS unknown keys, so a field added to
// DEFAULTS but not to validate() reads correctly all session and silently
// resets on every reload. Easy to add half of, and impossible to notice without
// quitting the game.

test('DEFAULTS.threatStyle is "shadow"', () => {
  assert.equal(DEFAULTS.threatStyle, 'shadow');
});

test('validate() carries threatStyle through — it must not be dropped as unknown', () => {
  assert.equal(validate({ threatStyle: 'danger' }).threatStyle, 'danger');
});

test('validate({}) injects the threatStyle default', () => {
  assert.equal(validate({}).threatStyle, 'shadow');
});

test('a threatStyle from disk that is not one of the two coerces to the default', () => {
  for (const junk of ['garbage', '', null, undefined, 0, 42, {}, []]) {
    assert.equal(validate({ threatStyle: junk }).threatStyle, 'shadow',
      `${JSON.stringify(junk)} should not survive`);
  }
});

test('both real treatments survive a round trip', () => {
  for (const style of ['shadow', 'danger']) {
    assert.equal(validate(validate({ threatStyle: style })).threatStyle, style);
  }
});

// (theft) The blind-spot hint flag — same drop-unknown-keys trap as threatStyle.
test('blindSpotHintSeen defaults off and survives validate', () => {
  assert.equal(DEFAULTS.blindSpotHintSeen, false);
  assert.equal(validate({}).blindSpotHintSeen, false);
  assert.equal(validate({ blindSpotHintSeen: true }).blindSpotHintSeen, true,
    'must not be dropped as an unknown key, or the hint repeats every session');
});

test('a junk blindSpotHintSeen coerces rather than being trusted', () => {
  for (const junk of ['yes', 1, null, {}]) {
    assert.equal(typeof validate({ blindSpotHintSeen: junk }).blindSpotHintSeen, 'boolean');
  }
});
