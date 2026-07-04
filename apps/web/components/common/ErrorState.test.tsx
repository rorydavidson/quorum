import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorState } from './ErrorState';
import { LoadingState } from './LoadingState';

describe('ErrorState', () => {
  it('renders the default title and message', () => {
    render(<ErrorState />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders custom title/message', () => {
    render(<ErrorState title="Nope" message="Detail here" />);
    expect(screen.getByText('Nope')).toBeInTheDocument();
    expect(screen.getByText('Detail here')).toBeInTheDocument();
  });

  it('shows the retry button only when onRetry is provided and calls it', async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<ErrorState />);
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();

    rerender(<ErrorState onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe('LoadingState', () => {
  it('renders a polite status with a label', () => {
    render(<LoadingState label="Loading space…" />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Loading space…');
  });
});
