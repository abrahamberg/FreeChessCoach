import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { PlayPage } from './PlayPage.js';

function renderPlayPage() {
  return render(
    <MemoryRouter initialEntries={['/play']}>
      <Routes>
        <Route path="/play" element={<PlayPage />} />
        <Route path="/play/new" element={<div>play-coach-marker</div>} />
        <Route path="/play-bot/new" element={<div>play-bot-marker</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PlayPage', () => {
  test('the "Play with Coach" card navigates to the coach play start page', async () => {
    const user = userEvent.setup();
    renderPlayPage();

    await user.click(screen.getByRole('link', { name: /play with coach/i }));

    expect(await screen.findByText('play-coach-marker')).toBeInTheDocument();
  });

  test('the "Play a Bot" card navigates to the bot play start page', async () => {
    const user = userEvent.setup();
    renderPlayPage();

    await user.click(screen.getByRole('link', { name: /play a bot/i }));

    expect(await screen.findByText('play-bot-marker')).toBeInTheDocument();
  });
});
