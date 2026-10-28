import React, { useState } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';

export default function LoginModal({
  isOpen,
  targetRole = 'student', // 'student' or 'admin'
  onClose,
  onSuccess,
  onOpenRegister,
  t,
  lang
}) {
  const [formData, setFormData] = useState({
    mobile: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState({
    loading: false,
    error: null
  });

  if (!isOpen) return null;

  const isAdmin = targetRole === 'admin';

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleReset = () => {
    setFormData({ mobile: '', password: '' });
    setStatus({ loading: false, error: null });
    setShowPassword(false);
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus({ loading: true, error: null });

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include', // sends and receives HttpOnly auth_token cookie
        body: JSON.stringify({
          mobile: formData.mobile,
          password: formData.password
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || t.loginErrorGeneric);
      }

      // Check role authorization on the specific login modal
      if (isAdmin && data.user.role !== 'admin' && data.user.role !== 'committee_head') {
        // A student attempted to log into the Admin Portal
        // Immediately revoke session cookie
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
          credentials: 'include'
        }).catch(() => {});

        throw new Error(t.loginAdminRoleMismatch);
      }

      // Successful login
      setStatus({ loading: false, error: null });
      onSuccess(data.user);
    } catch (err) {
      setStatus({
        loading: false,
        error: err.message
      });
    }
  };

  return (
    <div className="modal-overlay" onClick={handleReset}>
      <div 
        className="modal-card" 
        style={{ 
          maxWidth: '440px',
          borderTop: isAdmin ? '5px solid #0F172A' : '5px solid var(--color-primary)' 
        }} 
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title-wrap">
            <span className="modal-icon">{isAdmin ? '🔐' : '🔑'}</span>
            <div>
              <h3 className="modal-title" style={{ fontSize: '1.2rem', marginBottom: '0.15rem' }}>
                {isAdmin ? t.loginAdminTitle : t.loginStudentTitle}
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>
                {isAdmin ? t.loginAdminSubtitle : t.loginStudentSubtitle}
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={handleReset} aria-label="Close modal">✕</button>
        </div>

        <div className="modal-body" style={{ padding: '1.25rem 1.5rem' }}>
          {isAdmin && (
            <div style={{
              background: '#F1F5F9',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              padding: '0.5rem 0.75rem',
              marginBottom: '1rem',
              fontSize: '0.825rem',
              color: '#334155',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontWeight: 600
            }}>
              <span>🛡️</span>
              <span>{t.loginAdminBadge}</span>
            </div>
          )}

          {status.error && (
            <div style={{
              background: '#FEE2E2',
              border: '1px solid #FCA5A5',
              color: '#B91C1C',
              padding: '0.65rem 0.85rem',
              borderRadius: '6px',
              fontSize: '0.85rem',
              marginBottom: '1rem'
            }}>
              ⚠️ {status.error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                {t.mobileLabel} *
              </label>
              <input 
                type="tel"
                name="mobile"
                required
                autoComplete="tel"
                placeholder={t.mobilePlaceholder}
                value={formData.mobile}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border)',
                  fontSize: '0.95rem'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                {t.passwordLabel} *
              </label>
              <div style={{ position: 'relative' }}>
                <input 
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  required
                  autoComplete="current-password"
                  placeholder={t.passwordPlaceholder}
                  value={formData.password}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    padding: '0.65rem 2.5rem 0.65rem 0.85rem',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border)',
                    fontSize: '0.95rem'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? t.hidePassword : t.showPassword}
                  style={{
                    position: 'absolute',
                    right: '0.65rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    color: 'var(--color-muted)',
                    fontWeight: 600,
                    padding: '0.2rem'
                  }}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <button 
              type="submit" 
              className={`btn ${isAdmin ? 'btn-primary' : 'btn-primary'} w-full`} 
              disabled={status.loading}
              style={{
                marginTop: '0.5rem',
                background: isAdmin ? '#0F172A' : 'var(--color-primary)'
              }}
            >
              {status.loading ? t.loggingIn : (
                <span>
                  {isAdmin ? '🔐 ' : '🔑 '}
                  {t.btnLoginSubmit}
                </span>
              )}
            </button>
          </form>

          {/* Bottom link for registration (Student modal only) */}
          {!isAdmin && (
            <div style={{ 
              marginTop: '1.25rem', 
              paddingTop: '1rem', 
              borderTop: '1px solid var(--color-border)',
              textAlign: 'center',
              fontSize: '0.875rem',
              color: 'var(--color-muted)'
            }}>
              <span>{t.dontHaveAccount} </span>
              <button
                type="button"
                onClick={() => {
                  handleReset();
                  if (onOpenRegister) onOpenRegister();
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-primary)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: 0
                }}
              >
                {t.registerHere}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
