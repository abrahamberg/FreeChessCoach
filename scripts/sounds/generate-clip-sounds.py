#!/usr/bin/env python3
"""Generates the videos' two cut sounds (docs/courses.md §13.8) from scratch.

Pure Python, no dependencies, deterministic (fixed seeds). No recorded audio.

- riser: a low hum that builds for 5 s under a puzzle's countdown and is
  released at the reveal: two soft sines an octave apart gliding up a fifth,
  with filtered noise swelling in.
- whoosh: a soft air sweep for a cut (a chapter card, the video's hook
  cutting back to the start): band-passed noise gliding down, 0.45 s.

    python3 scripts/sounds/generate-clip-sounds.py [out_dir]

Writes riser.wav and whoosh.wav as 16-bit mono 44.1 kHz WAV (default:
apps/web/public/sounds/). The board sounds are generate-board-sounds.py's.
"""
import math
import os
import random
import struct
import sys
import wave

RATE = 44100


def lowpass(samples, cutoff):
    alpha = 1 - math.exp(-2 * math.pi * cutoff / RATE)
    out, level = [], 0.0
    for sample in samples:
        level += alpha * (sample - level)
        out.append(level)
    return out


def riser(seconds=5.0):
    rng = random.Random(11)
    length = int(RATE * seconds)
    noise = lowpass([rng.uniform(-1, 1) for _ in range(length)], 900)
    out, phase_low, phase_high = [], 0.0, 0.0
    for n in range(length):
        t = n / length
        # Glide up a fifth (55 Hz to 82 Hz), the swell easing in.
        frequency = 55 * (1.5 ** (t * t))
        phase_low += 2 * math.pi * frequency / RATE
        phase_high += 2 * math.pi * frequency * 2 / RATE
        swell = t ** 1.6
        tone = 0.6 * math.sin(phase_low) + 0.25 * math.sin(phase_high)
        out.append(swell * (tone + 0.35 * t * noise[n]))
    # A soft start and a quick release at the very end.
    fade_in, fade_out = int(RATE * 0.3), int(RATE * 0.08)
    for n in range(fade_in):
        out[n] *= n / fade_in
    for n in range(fade_out):
        out[length - 1 - n] *= n / fade_out
    return out


def whoosh(seconds=0.45):
    rng = random.Random(12)
    length = int(RATE * seconds)
    out, low, band = [], 0.0, 0.0
    for n in range(length):
        t = n / length
        # A band that sweeps from bright to dark: two one-pole stages whose
        # cutoffs glide down, their difference a moving band.
        high_cut = 6000 * (1 - t) + 700 * t
        low_cut = 1500 * (1 - t) + 200 * t
        sample = rng.uniform(-1, 1)
        low += (1 - math.exp(-2 * math.pi * low_cut / RATE)) * (sample - low)
        band += (1 - math.exp(-2 * math.pi * high_cut / RATE)) * (sample - band)
        envelope = math.sin(math.pi * t) ** 1.5
        out.append((band - low) * envelope)
    return out


def finish(samples, peak):
    top = max(abs(sample) for sample in samples) or 1.0
    return [sample / top * peak for sample in samples]


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
    # Under the voice and the board: quieter than the knocks.
    for name, samples, peak in (('riser', riser(), 0.45), ('whoosh', whoosh(), 0.5)):
        finished = finish(samples, peak)
        write(os.path.join(out_dir, f'{name}.wav'), finished)
        print(f'{name}.wav  {len(finished) / RATE * 1000:.0f} ms')


if __name__ == '__main__':
    main()
