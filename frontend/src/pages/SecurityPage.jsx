import React, { useState } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';

export default function SecurityPage() {
  const { currentUser, setCurrentUser } = useAuth();
  const { showToast } = useToast();

  const [setupData, setSetupData] = useState(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [showDisableModal, setShowDisableModal] = useState(false);

  const handleStartSetup = async () => {
    setLoading(true);
    try {
      const res = await api.auth.setup2fa();
      setSetupData(res);
    } catch (err) {
      showToast(err.message || 'Failed to start 2FA setup.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm2fa = async (e) => {
    e.preventDefault();
    if (!verifyCode.trim()) return;

    setLoading(true);
    try {
      const res = await api.auth.verify2fa({
        secret: setupData.secret,
        token: verifyCode.trim()
      });
      setCurrentUser(prev => ({ ...prev, totpEnabled: true }));
      setSetupData(null);
      setRecoveryCodes(res.recoveryCodes || []);
      showToast('Two-factor authentication successfully enabled!', 'success');
    } catch (err) {
      showToast(err.message || 'Verification failed. Please check the code.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDisable2fa = async (e) => {
    e.preventDefault();
    if (!disablePassword) return;

    setLoading(true);
    try {
      await api.auth.disable2fa({ password: disablePassword });
      setCurrentUser(prev => ({ ...prev, totpEnabled: false }));
      setShowDisableModal(false);
      setDisablePassword('');
      showToast('2FA has been disabled.', 'info');
    } catch (err) {
      showToast(err.message || 'Failed to disable 2FA. Check password.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const is2faActive = Boolean(currentUser?.totpEnabled);

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto' }}>
      <div className="card" style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.25rem', color: 'var(--color-primary)', marginBottom: '8px' }}>
          Two-Factor Authentication (2FA)
        </h2>
        <p style={{ fontSize: '0.88rem', color: 'var(--color-text-muted)', marginBottom: '20px' }}>
          Protect your student savings and budget records with industry-standard TOTP authentication (Google Authenticator, Authy).
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: 'var(--color-surface-subtle)', borderRadius: '8px', marginBottom: '20px' }}>
          <div>
            <strong>Status: </strong>
            <span className={`status-badge ${is2faActive ? 'healthy' : 'no_budget'}`}>
              {is2faActive ? 'Active & Enabled' : 'Disabled'}
            </span>
          </div>
          {is2faActive ? (
            <button className="btn btn-secondary btn-sm" style={{ color: 'var(--color-danger)' }} onClick={() => setShowDisableModal(true)}>
              Disable 2FA
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={handleStartSetup} disabled={loading || setupData}>
              {loading ? 'Setting up...' : 'Enable 2FA'}
            </button>
          )}
        </div>

        {/* 2FA Setup Flow */}
        {setupData && !is2faActive && (
          <div style={{ border: '1px solid var(--color-border)', borderRadius: '8px', padding: '20px', marginTop: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '12px' }}>Scan QR Code</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
              Open your authenticator app (Google Authenticator, Authy, Microsoft Authenticator) and scan the QR code below:
            </p>

            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <img
                src={setupData.qrCodeDataUrl}
                alt="2FA QR Code"
                style={{ width: '180px', height: '180px', borderRadius: '8px', border: '1px solid var(--color-border)', margin: '0 auto 12px' }}
              />
              <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                Manual Setup Key: <code style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>{setupData.secret}</code>
              </p>
            </div>

            <form onSubmit={handleConfirm2fa}>
              <div className="form-group">
                <label className="form-label" htmlFor="verify-2fa-token">Enter 6-Digit Code from App</label>
                <input
                  id="verify-2fa-token"
                  type="text"
                  maxLength="6"
                  className="form-control"
                  style={{ textAlign: 'center', fontSize: '1.3rem', letterSpacing: '0.2em' }}
                  placeholder="123456"
                  required
                  value={verifyCode}
                  onChange={e => setVerifyCode(e.target.value)}
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
                  {loading ? 'Verifying...' : 'Verify & Activate 2FA'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setSetupData(null)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Recovery Codes Box */}
        {recoveryCodes.length > 0 && (
          <div style={{ border: '1px solid var(--color-primary)', background: 'rgba(5, 150, 105, 0.05)', borderRadius: '8px', padding: '20px', marginTop: '16px' }}>
            <h3 style={{ fontSize: '1.05rem', color: 'var(--color-primary)', marginBottom: '8px' }}>
              Save Your One-Time Backup Recovery Codes
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
              If you ever lose access to your phone or authenticator app, each of these codes can be used once to access your account:
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: 'var(--color-surface)', padding: '12px', borderRadius: '6px', fontFamily: 'monospace' }}>
              {recoveryCodes.map((code, idx) => (
                <div key={idx} style={{ padding: '4px 8px', background: 'var(--color-surface-subtle)', borderRadius: '4px' }}>
                  {code}
                </div>
              ))}
            </div>
            <button className="btn btn-primary btn-sm" style={{ marginTop: '14px' }} onClick={() => setRecoveryCodes([])}>
              I Have Safely Saved My Codes
            </button>
          </div>
        )}
      </div>

      {/* Disable 2FA Modal */}
      {showDisableModal && (
        <div className="modal-overlay active" style={{ display: 'flex' }} onClick={() => setShowDisableModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Disable Two-Factor Authentication</h3>
              <button className="modal-close" onClick={() => setShowDisableModal(false)}>&times;</button>
            </div>
            <form onSubmit={handleDisable2fa}>
              <div className="form-group">
                <label className="form-label">Enter account password to confirm:</label>
                <input
                  type="password"
                  className="form-control"
                  required
                  placeholder="••••••••"
                  value={disablePassword}
                  onChange={e => setDisablePassword(e.target.value)}
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1, backgroundColor: 'var(--color-danger)' }} disabled={loading}>
                  {loading ? 'Disabling...' : 'Confirm & Disable'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowDisableModal(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

