#!/usr/bin/env python3
"""Generates the board sounds (docs/plan.md Phase 88) from scratch.

Pure Python, no dependencies, deterministic (fixed seeds): the output is the
same on every run. No recorded audio is used or included.

The knocks follow a *pattern* taken from two reference sounds the owner
chose (a chess move and a capture): how loud the sound is every 2.5 ms, and
how its energy is spread over third-octave bands early, mid-way and late in
the sound (PROFILES below: coarse numbers only). Each sound is then built
new: every band gets its own fresh random resonances and noise at that
band's level, the whole shaped by the loudness pattern, and the frequencies
are shifted a few percent. The same kind of sound, a different wave.

Check is the capture's pattern made sharper over a heavier knock; bad is
the move's knock with its ring choked; great is between a capture and a
move.

    python3 scripts/sounds/generate-board-sounds.py [out_dir]

Writes move, opponent, capture, check, bad and great as 16-bit mono 44.1 kHz
WAV (default: apps/web/public/sounds/).
"""
import math
import os
import random
import struct
import sys
import wave

RATE = 44100

# Third-octave band centres, Hz.
BANDS = [125, 157, 198, 250, 315, 397, 500, 630, 794, 1000, 1260, 1587, 2000, 2520, 3175, 4000, 5040, 6350]

# The pattern, measured once from the reference sounds: loudness (dB below
# the peak) every 2.5 ms, and band levels (dB below the loudest band) over
# 0-12 ms, 12-40 ms and 40-120 ms.
PROFILES = {
    'move': {
        'env': [-9, -17, -16, -21, -22, -26, -26, -31, -35, -39, -44, -43, -51, -47, -49, -51, -48, -54, -51, -59, -55, -52, -53, -51, -52, -54, -55, -54, -58, -57, -53, -56, -58, -56, -54, -58, -54, -57, -56, -57, -57, -58, -59, -55, -61, -60, -61, -61, -60, -61, -60, -59, -63, -66, -65, -63, -67, -65, -61, -60, -62, -71],
        'early': [-18, -14, -12, -14, -20, -5, -3, -5, -4, 0, -4, -7, -12, -19, -33, -43, -41, -53],
        'mid': [-20, -18, -11, -10, -9, -3, 0, -11, -8, -3, -6, -13, -24, -33, -39, -44, -45, -50],
        'late': [-36, -21, -12, -12, -13, -6, -2, -4, -4, 0, -6, -8, -17, -25, -36, -45, -43, -53],
    },
    'capture': {
        'env': [-40, -23, -25, -15, -9, -15, -16, -21, -21, -23, -23, -23, -32, -36, -32, -39, -40, -39, -40, -43, -43, -43, -45, -42, -45, -42, -43, -43, -44, -43, -42, -43, -43, -46, -45, -46, -47, -48, -51, -47, -51, -50, -52, -49, -49, -52, -52, -51, -55, -54, -54, -59, -54, -52, -55, -56, -59, -58, -57, -54, -58, -58, -57, -56, -60, -55, -62, -63, -59, -60, -66, -63, -62, -68, -65, -70, -67, -69, -67, -69, -67, -68, -70, -68, -67, -67, -68, -69, -73],
        'early': [-21, -17, -14, -16, -17, -10, -8, -6, -12, -9, -1, -8, -9, -10, -6, 0, -6, -11],
        'mid': [-17, -12, -14, -18, -9, -10, -8, -7, -6, -5, 0, -2, -12, -14, -23, -22, -22, -30],
        'late': [-25, -10, -9, -18, -11, -13, -5, -7, -7, -3, 0, -2, -7, -14, -15, -11, -15, -19],
    },
}
STEP = 0.0025  # the loudness pattern's step, seconds
TIMES = (0.006, 0.026, 0.08)  # the middle of each band window, seconds


def silence(seconds):
    return [0.0] * int(RATE * seconds)


def add(into, sound, at_seconds=0.0, gain=1.0):
    """Mixes `sound` into `into` at an offset, growing `into` as needed."""
    start = int(RATE * at_seconds)
    end = start + len(sound)
    if end > len(into):
        into.extend([0.0] * (end - len(into)))
    for index, sample in enumerate(sound):
        into[start + index] += sample * gain
    return into


def bandpass(samples, centre, q=4.3):
    """RBJ band-pass (0 dB peak), about a third of an octave wide."""
    w = 2 * math.pi * centre / RATE
    alpha = math.sin(w) / (2 * q)
    a0 = 1 + alpha
    b0, b2, a1, a2 = alpha / a0, -alpha / a0, -2 * math.cos(w) / a0, (1 - alpha) / a0
    out, x1, x2, y1, y2 = [], 0.0, 0.0, 0.0, 0.0
    for x in samples:
        y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2
        out.append(y)
        x2, x1, y2, y1 = x1, x, y1, y
    return out


def interpolate(points, time):
    """Linear between (time, value) points, flat outside them."""
    if time <= points[0][0]:
        return points[0][1]
    for (t0, v0), (t1, v1) in zip(points, points[1:]):
        if time <= t1:
            return v0 + (v1 - v0) * (time - t0) / (t1 - t0)
    return points[-1][1]


def from_profile(profile, seed, shift=1.04, tilt=0.0):
    """A new sound following `profile`: per band, fresh random resonances and
    noise at the band's level over time, under the loudness pattern. `shift`
    moves every band's frequencies; `tilt` (dB per octave above 1 kHz)
    darkens or brightens it."""
    rng = random.Random(seed)
    length = int(len(profile['env']) * STEP * RATE)
    out = [0.0] * length
    for index, centre in enumerate(BANDS):
        frequency = centre * shift
        if frequency > RATE / 2.5:
            continue
        octaves_above = max(0.0, math.log2(frequency / 1000))
        levels = [(time, profile[window][index] + tilt * octaves_above) for time, window in zip(TIMES, ('early', 'mid', 'late'))]
        band = [0.0] * length
        # Resonances: a few sine modes at random frequencies inside the band.
        for _ in range(4):
            mode = frequency * 2 ** rng.uniform(-1 / 6, 1 / 6)
            phase = rng.uniform(0, 2 * math.pi)
            step = 2 * math.pi * mode / RATE
            for n in range(length):
                band[n] += math.sin(phase + step * n) * 0.35
        # Noise: the contact's roughness, filtered to the band.
        noise = bandpass([rng.uniform(-1, 1) for _ in range(length)], frequency)
        for n in range(length):
            out[n] += (band[n] + noise[n] * 2.0) * 10 ** (interpolate(levels, n / RATE) / 20)
    # The loudness pattern, smoothed between its steps.
    points = [(i * STEP + STEP / 2, level) for i, level in enumerate(profile['env'])]
    for n in range(length):
        out[n] *= 10 ** (interpolate(points, n / RATE) / 20)
    # A 1 ms rise, so the first sample isn't a click.
    rise = int(RATE * 0.001)
    for n in range(min(length, rise)):
        out[n] *= n / rise
    return out


def lowpass(samples, cutoff):
    """One-pole low-pass: takes the brightness off."""
    alpha = 1 - math.exp(-2 * math.pi * cutoff / RATE)
    out, level = [], 0.0
    for sample in samples:
        level += alpha * (sample - level)
        out.append(level)
    return out


def blend(first, second, share=0.5):
    """A profile between two: each number `share` of the way from the first
    to the second (the shorter loudness pattern padded with silence)."""
    length = max(len(first['env']), len(second['env']))
    pad = lambda env: env + [-80] * (length - len(env))
    mix = lambda a, b: [x + (y - x) * share for x, y in zip(a, b)]
    return {'env': mix(pad(first['env']), pad(second['env'])), **{key: mix(first[key], second[key]) for key in ('early', 'mid', 'late')}}


def sharpen(samples, after, decay):
    """A faster fade: past `after` seconds the sound dies with time constant `decay`."""
    return [sample * (1.0 if n / RATE < after else math.exp(-(n / RATE - after) / decay)) for n, sample in enumerate(samples)]


def sounds():
    move = from_profile(PROFILES['move'], seed=1, shift=1.04)
    # The other side: a lower, darker version of the same knock.
    opponent = from_profile(PROFILES['move'], seed=2, shift=0.9, tilt=-3.0)
    capture = from_profile(PROFILES['capture'], seed=3, shift=1.05)
    # Check: the capture's pattern made sharper (higher, brighter), over a
    # heavier knock, fading a little slower: it should dominate.
    check = add(
        sharpen(from_profile(PROFILES['capture'], seed=4, shift=1.2, tilt=3.0), after=0.02, decay=0.05),
        from_profile(PROFILES['move'], seed=6, shift=0.85),
        0.0,
        0.6,
    )
    # Bad: the move's knock with its ring choked, as if a hand were on the
    # board: darker, a little lower, and it stops almost at once.
    bad = sharpen(lowpass(from_profile(PROFILES['move'], seed=5, shift=0.92, tilt=-8.0), 1100), after=0.004, decay=0.01)
    # Great: between a capture and a move.
    great = from_profile(blend(PROFILES['move'], PROFILES['capture']), seed=7, shift=1.06)
    return {'move': move, 'opponent': opponent, 'capture': capture, 'check': check, 'bad': bad, 'great': great}


def finish(samples, peak=0.9, fade=0.01):
    """Normalizes to `peak`, trims silence at the end and fades out."""
    top = max(abs(sample) for sample in samples) or 1.0
    scaled = [sample / top * peak for sample in samples]
    end = len(scaled)
    while end > 1 and abs(scaled[end - 1]) < peak * 0.001:
        end -= 1
    fade_length = int(RATE * fade)
    out = scaled[: end + fade_length]
    for index in range(max(0, len(out) - fade_length), len(out)):
        out[index] *= (len(out) - index) / fade_length
    return out


def write(path, samples):
    with wave.open(path, 'wb') as file:
        file.setnchannels(1)
        file.setsampwidth(2)
        file.setframerate(RATE)
        file.writeframes(b''.join(struct.pack('<h', int(max(-1.0, min(1.0, sample)) * 32767)) for sample in samples))


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    out_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, '..', '..', 'apps', 'web', 'public', 'sounds')
    os.makedirs(out_dir, exist_ok=True)
    for name, samples in sounds().items():
        finished = finish(samples)
        write(os.path.join(out_dir, f'{name}.wav'), finished)
        print(f'{name}.wav  {len(finished) / RATE * 1000:.0f} ms')


if __name__ == '__main__':
    main()
