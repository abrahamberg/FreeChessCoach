import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { CoachPersonaSelect } from './CoachPersonaSelect.js';

describe('CoachPersonaSelect', () => {
  test('renders all 8 personas, marking the current one', () => {
    render(<CoachPersonaSelect value="scholar" onChange={vi.fn()} />);

    expect(screen.getByRole('radio', { name: /coach, classic portrait/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /coach, alternate portrait/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /the scholar/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /the gambler/i })).not.toBeChecked();
    expect(screen.queryByText(/male|female|\d+s/i)).not.toBeInTheDocument();
  });

  test('renders the eight supplied portraits in persona order', () => {
    render(<CoachPersonaSelect value="general" onChange={vi.fn()} />);

    const personas = [...document.querySelectorAll('[data-testid="coach-avatar"]')].map((avatar) =>
      avatar.getAttribute('data-coach-persona')
    );
    expect(personas).toEqual([
      'general',
      'general_female',
      'commander',
      'scholar',
      'huntress',
      'shark',
      'sunzi',
      'gambler'
    ]);
  });

  test('the two default Coach portraits stay distinguishable and each selects its own persona', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<CoachPersonaSelect value="scholar" onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: /coach, classic portrait/i }));
    expect(onChange).toHaveBeenCalledWith('general');

    await user.click(screen.getByRole('radio', { name: /coach, alternate portrait/i }));
    expect(onChange).toHaveBeenCalledWith('general_female');
  });

  test('selecting a non-explicit persona calls onChange immediately, no dialog', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<CoachPersonaSelect value="general" onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: /the scholar/i }));
    expect(onChange).toHaveBeenCalledWith('scholar');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('selecting an explicit persona shows a confirmation dialog instead of calling onChange right away', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<CoachPersonaSelect value="general" onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: /the gambler/i }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveTextContent(/strong language/i);
    // Undo: the radio itself never flipped, since onChange hasn't fired.
    expect(screen.getByRole('radio', { name: /the gambler/i })).not.toBeChecked();
  });

  test('confirming the explicit-persona dialog calls onChange and closes it', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<CoachPersonaSelect value="general" onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: /the gambler/i }));
    await user.click(screen.getByRole('button', { name: /continue with the gambler/i }));

    expect(onChange).toHaveBeenCalledWith('gambler');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('cancelling the explicit-persona dialog leaves the selection unchanged (undo)', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<CoachPersonaSelect value="general" onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: /the street shark/i }));
    await user.click(screen.getByRole('button', { name: /choose a different coach/i }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('re-selecting the already-active explicit persona does not re-prompt', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<CoachPersonaSelect value="gambler" onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: /the gambler/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('marks the gambler and street shark personas explicit, and no others (coaches.md: profanity/insults are part of their character)', () => {
    render(<CoachPersonaSelect value="general" onChange={vi.fn()} />);

    expect(screen.getAllByTitle('Explicit language')).toHaveLength(2);
    expect(screen.getByRole('radio', { name: /the gambler/i }).closest('label')).toHaveTextContent('E');
    expect(screen.getByRole('radio', { name: /the street shark/i }).closest('label')).toHaveTextContent('E');
    expect(screen.getByRole('radio', { name: /the scholar/i }).closest('label')).not.toHaveTextContent('E');
  });
});
