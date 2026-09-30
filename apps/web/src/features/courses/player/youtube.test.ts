import { expect, test } from 'vitest';
import { youtubeVideoId } from './youtube.js';

test('youtubeVideoId reads watch, Shorts, youtu.be and embed links, nothing else', () => {
  expect(youtubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10')).toBe('dQw4w9WgXcQ');
  expect(youtubeVideoId('https://youtube.com/shorts/abcDEF12345')).toBe('abcDEF12345');
  expect(youtubeVideoId('https://youtu.be/abcDEF12345?si=x')).toBe('abcDEF12345');
  expect(youtubeVideoId('https://m.youtube.com/embed/abcDEF12345')).toBe('abcDEF12345');
  expect(youtubeVideoId('https://www.youtube.com/channel/UC123')).toBeNull();
  expect(youtubeVideoId('https://evil.example/watch?v=abcDEF12345')).toBeNull();
  expect(youtubeVideoId('https://www.youtube.com/watch?v=<script>')).toBeNull();
  expect(youtubeVideoId('not a link')).toBeNull();
});
