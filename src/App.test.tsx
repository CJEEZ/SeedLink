import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import App from './App';

vi.mock('./firebase', () => ({
  auth: null,
  database: null,
  getConfiguredAuth: vi.fn(),
  getConfiguredDatabase: vi.fn(),
}));

test('shows the public seed catalog to signed-out visitors', async () => {
  render(<App />);
  expect(await screen.findByRole('heading', { name: /seeds for the season ahead/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
  expect(await screen.findByText('IR64 Rice')).toBeInTheDocument();
});
