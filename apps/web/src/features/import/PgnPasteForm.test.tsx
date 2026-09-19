import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { ImportGameRequestSchema } from '@freechesscoach/shared';
import { PgnPasteForm } from './PgnPasteForm.js';

describe('PgnPasteForm', () => {
  test('offers two buttons — Analyze and Get coaching session — and no generic Import button', () => {
    render(<PgnPasteForm onSubmit={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Analyze' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Get coaching session' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^import/i })).not.toBeInTheDocument();
  });

  test.each([
    ['Analyze', 'review'],
    ['Get coaching session', 'coach']
  ] as const)('the %s button submits a valid body with intent "%s"', async (label, intent) => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<PgnPasteForm onSubmit={onSubmit} />);

    await user.type(screen.getByRole('textbox', { name: /pgn/i }), '1. e4 e5 2. Nf3 Nc6');
    await user.click(screen.getByRole('button', { name: label }));

    expect(onSubmit).toHaveBeenCalledOnce();
    const [body, submittedIntent] = onSubmit.mock.calls[0] ?? [];
    expect(ImportGameRequestSchema.safeParse(body).success).toBe(true);
    expect(body).toEqual({ pgn: '1. e4 e5 2. Nf3 Nc6', source: 'paste' });
    expect(submittedIntent).toBe(intent);
  });

  test('does not submit an empty pgn from either button', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<PgnPasteForm onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'Analyze' }));
    await user.click(screen.getByRole('button', { name: 'Get coaching session' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
