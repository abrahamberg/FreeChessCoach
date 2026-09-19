import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { DemoCoachRedirect } from './DemoCoachRedirect.js';
import { setDemoRuntime } from './demoRuntime.js';

afterEach(() => setDemoRuntime(null));

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/coach" element={<DemoCoachRedirect />} />
        <Route path="/session/:id" element={<p>session page</p>} />
        <Route path="/games" element={<p>games page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('DemoCoachRedirect', () => {
  it('opens the demo coach conversation, whatever its id is after a re-recording', () => {
    setDemoRuntime({ coachSessionId: 'abc' } as never);
    renderAt('/coach');
    expect(screen.getByText('session page')).toBeInTheDocument();
  });

  it('goes to Games when there is no demo running', () => {
    renderAt('/coach');
    expect(screen.getByText('games page')).toBeInTheDocument();
  });
});
