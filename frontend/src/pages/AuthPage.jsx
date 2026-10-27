import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';

export default function AuthPage() {
  const { login, register, loginDemo, verify2fa, pending2fa } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [twoFaCode, setTwoFaCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!email.trim() || !password) {
      setErrorMsg('Email and password are required.');
      return;
    }

    setLoading(true);
    try {
      const res = await login(email.trim(), password);
      if (res.requires2fa) {
        showToast('Two-factor authentication required. Enter your 6-digit code.', 'info');
      } else {
        showToast('Signed in successfully!', 'success');
      }
    } catch (err) {
      setErrorMsg(err.data?.error || err.message || 'Invalid email or password.');
      showToast(err.data?.error || err.message || 'Sign in failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!fullName.trim() || fullName.trim().length < 2) {
      setErrorMsg('Full name is required (at least 2 characters).');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim() || !emailRegex.test(email.trim())) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    if (!password || password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setErrorMsg('Password must be at least 8 characters long and contain both letters and numbers.');
      return;
    }

    setLoading(true);
    try {
      await register(email.trim(), password, fullName.trim());
      showToast('Account created successfully! Welcome to SmartPocket.', 'success');
    } catch (err) {
      setErrorMsg(err.data?.error || err.message || 'Registration failed.');
      showToast(err.data?.error || err.message || 'Registration failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2fa = async (e) => {
    e.preventDefault();
    if (!twoFaCode.trim()) {
      setErrorMsg('Please enter your 6-digit code.');
      return;
    }

    setLoading(true);
    try {
      await verify2fa(twoFaCode.trim());
      showToast('Authenticated with 2FA successfully!', 'success');
    } catch (err) {
      setErrorMsg(err.data?.error || err.message || 'Invalid 2FA code.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setErrorMsg('');
    setLoading(true);
    try {
      showToast('Signing in with demo student account...', 'info');
      await loginDemo();
      showToast('Welcome, Aarav! (Demo Account Active)', 'success');
    } catch (err) {
      setErrorMsg(err.data?.error || err.message || 'Demo sign in failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', background: 'var(--color-bg)' }}>
      <div className="card" style={{ maxWidth: '440px', width: '100%', padding: '32px' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <img src="/icon.svg" alt="SmartPocket" style={{ width: '56px', height: '56px', margin: '0 auto 12px' }} />
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-primary)' }}>Welcome to SmartPocket</h2>
          <p style={{ fontSize: '0.88rem', color: 'var(--color-text-muted)' }}>Student Budget & Savings Advisor (React+Vite)</p>
        </div>

        {errorMsg && (
          <div style={{
            color: 'var(--color-danger, #ef4444)',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            padding: '10px 14px',
            borderRadius: '6px',
            marginBottom: '16px',
            fontSize: '0.85rem'
          }}>
            {errorMsg}
          </div>
        )}

        {pending2fa ? (
          <div>
            <h3 style={{ fontSize: '1.15rem', marginBottom: '8px' }}>Two-Factor Verification</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
              Enter the 6-digit verification code from your authenticator app.
            </p>
            <form onSubmit={handleVerify2fa}>
              <div className="form-group">
                <input
                  type="text"
                  maxLength="8"
                  className="form-control"
                  style={{ textAlign: 'center', fontSize: '1.3rem', letterSpacing: '0.2em' }}
                  placeholder="123456"
                  value={twoFaCode}
                  onChange={e => setTwoFaCode(e.target.value)}
                  autoFocus
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
                {loading ? 'Verifying...' : 'Verify & Continue'}
              </button>
            </form>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', marginBottom: '20px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{
                  flex: 1,
                  borderRadius: 0,
                  border: 'none',
                  borderBottom: activeTab === 'login' ? '2px solid var(--color-primary)' : 'none',
                  fontWeight: activeTab === 'login' ? 600 : 'normal',
                  color: activeTab === 'login' ? 'var(--color-primary)' : 'inherit'
                }}
                onClick={() => { setActiveTab('login'); setErrorMsg(''); }}
              >
                Sign In
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{
                  flex: 1,
                  borderRadius: 0,
                  border: 'none',
                  borderBottom: activeTab === 'register' ? '2px solid var(--color-primary)' : 'none',
                  fontWeight: activeTab === 'register' ? 600 : 'normal',
                  color: activeTab === 'register' ? 'var(--color-primary)' : 'inherit'
                }}
                onClick={() => { setActiveTab('register'); setErrorMsg(''); }}
              >
                Register
              </button>
            </div>

            {activeTab === 'login' ? (
              <form onSubmit={handleLoginSubmit}>
                <div className="form-group">
                  <label className="form-label" htmlFor="login-email">College / Personal Email</label>
                  <input
                    id="login-email"
                    type="email"
                    className="form-control"
                    required
                    placeholder="student@example.edu"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="login-password">Password</label>
                  <input
                    id="login-password"
                    type="password"
                    className="form-control"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '12px' }} disabled={loading}>
                  {loading ? 'Signing In...' : 'Sign In'}
                </button>

                <div style={{ marginTop: '14px', textAlign: 'center', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                  Don't have an account?{' '}
                  <span
                    style={{ color: 'var(--color-primary)', fontWeight: 600, cursor: 'pointer' }}
                    onClick={() => { setActiveTab('register'); setErrorMsg(''); }}
                  >
                    Create an account
                  </span>
                </div>

                <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--color-border)', textAlign: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ width: '100%' }}
                    onClick={handleDemoLogin}
                    disabled={loading}
                  >
                    ⚡ 1-Click Demo Login (student@example.edu)
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleRegisterSubmit}>
                <div className="form-group">
                  <label className="form-label" htmlFor="reg-name">Full Name</label>
                  <input
                    id="reg-name"
                    type="text"
                    className="form-control"
                    required
                    placeholder="Aarav Sharma"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="reg-email">Email Address</label>
                  <input
                    id="reg-email"
                    type="email"
                    className="form-control"
                    required
                    placeholder="you@student.edu"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="reg-password">Password (8+ chars, letters & numbers)</label>
                  <input
                    id="reg-password"
                    type="password"
                    className="form-control"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '12px' }} disabled={loading}>
                  {loading ? 'Creating Account...' : 'Create Account'}
                </button>

                <div style={{ marginTop: '14px', textAlign: 'center', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                  Already have an account?{' '}
                  <span
                    style={{ color: 'var(--color-primary)', fontWeight: 600, cursor: 'pointer' }}
                    onClick={() => { setActiveTab('login'); setErrorMsg(''); }}
                  >
                    Sign In
                  </span>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
