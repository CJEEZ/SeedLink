import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AuthProvider } from './AuthContext';
import { useAuth } from './useAuth';

vi.mock('../firebase', () => ({
  auth: null,
  database: null,
  getConfiguredAuth: vi.fn(),
  getConfiguredDatabase: vi.fn(),
}));

function Harness() {
  const { user, profile, signIn, signUpFarmer, signOutUser } = useAuth();
  const [error, setError] = useState('');

  return (
    <div>
      <div data-testid="status">{user ? `signed-in:${user.email ?? 'unknown'}` : 'signed-out'}</div>
      <div data-testid="role">{profile?.role ?? 'none'}</div>
      <div data-testid="error">{error}</div>
      <button onClick={() => void signIn('admin@seedlink.test', 'SeedLink123!')}>login</button>
      <button onClick={() => void signIn('wrong@seedlink.test', 'wrong-pass').catch((reason) => setError(reason instanceof Error ? reason.message : 'Login failed'))}>invalid-login</button>
      <button onClick={() => void signUpFarmer('New Farmer', 'farmer2@seedlink.test', 'SeedLink123!', 'Baco')}>signup</button>
      <button onClick={() => void signOutUser()}>logout</button>
    </div>
  );
}

describe('auth fallback mode', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('logs in a seeded demo account when Firebase is not configured', async () => {
    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>
    );

    fireEvent.click(screen.getByText('login'));

    expect(await screen.findByTestId('status')).toHaveTextContent('signed-in:admin@seedlink.test');
    expect(screen.getByTestId('role')).toHaveTextContent('admin');
  });

  test('creates a farmer profile in local fallback mode', async () => {
    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>
    );

    fireEvent.click(screen.getByText('signup'));

    expect(await screen.findByTestId('status')).toHaveTextContent('signed-in:farmer2@seedlink.test');
    expect(screen.getByTestId('role')).toHaveTextContent('farmer');
  });

  test('hides demo credential hints on invalid sign-in', async () => {
    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>
    );

    fireEvent.click(screen.getByText('login'));

    expect(await screen.findByTestId('status')).toHaveTextContent('signed-in:admin@seedlink.test');

    fireEvent.click(screen.getByText('logout'));
    const demoError = 'Invalid email or password. Please try again.';

    const loginButton = screen.getByText('invalid-login');
    fireEvent.click(loginButton);

    expect(screen.getByTestId('status')).toHaveTextContent('signed-out');
    expect(screen.queryByText(/admin@seedlink.test|SeedLink123!/i)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent(demoError);
    });
  });
});
