import React, { useState } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';

export default function RegisterModal({ isOpen, onClose, t, lang }) {
  const [formData, setFormData] = useState({
    fullName: '',
    mobile: '',
    school: '',
    classOrGrade: '',
    password: '',
    confirmPassword: ''
  });

  const [status, setStatus] = useState({
    loading: false,
    error: null,
    successData: null
  });

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus({ loading: true, error: null, successData: null });

    // Client-side quick check
    if (formData.password !== formData.confirmPassword) {
      setStatus({
        loading: false,
        error: lang === 'hi' ? 'पासवर्ड और पासवर्ड पुष्टि समान होने चाहिए।' : 'Passwords do not match.',
        successData: null
      });
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      let data = {};
      try {
        data = await response.json();
      } catch {
        // Non-JSON response
      }

      if (!response.ok) {
        throw new Error(data.error?.message || (lang === 'hi' ? 'पंजीकरण विफल रहा।' : 'Registration failed.'));
      }

      setStatus({
        loading: false,
        error: null,
        successData: data.user
      });
    } catch (err) {
      const isNetworkErr = err.message === 'Failed to fetch' || err.name === 'TypeError';
      const fallbackMsg = lang === 'hi'
        ? 'सर्वर से संपर्क नहीं हो सका। कृपया इंटरनेट कनेक्शन अथवा Render CORS जांचें।'
        : 'Cannot connect to server. Please check your internet connection or verify CORS on Render.';
      setStatus({
        loading: false,
        error: isNetworkErr ? fallbackMsg : err.message,
        successData: null
      });
    }
  };

  const handleReset = () => {
    setFormData({
      fullName: '',
      mobile: '',
      school: '',
      classOrGrade: '',
      password: '',
      confirmPassword: ''
    });
    setStatus({ loading: false, error: null, successData: null });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleReset}>
      <div className="modal-card" style={{ maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-wrap">
            <span className="modal-icon">✍️</span>
            <h3 className="modal-title">
              {lang === 'hi' ? 'नया छात्र पंजीकरण' : 'Student Registration'}
            </h3>
          </div>
          <button className="modal-close-btn" onClick={handleReset} aria-label="Close modal">✕</button>
        </div>

        <div className="modal-body">
          {status.successData ? (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🎉</div>
              <h4 style={{ color: 'var(--color-success)', fontSize: '1.25rem', marginBottom: '0.5rem' }}>
                {lang === 'hi' ? 'पंजीकरण सफलतापूर्वक पूर्ण हुआ!' : 'Registration Successful!'}
              </h4>
              <p style={{ color: 'var(--color-muted)', fontSize: '0.925rem', marginBottom: '1.25rem' }}>
                {lang === 'hi' 
                  ? 'आपका छात्र खाता डेटाबेस में सुरक्षित रूप से दर्ज कर दिया गया है।' 
                  : 'Your student account has been securely created in MongoDB.'}
              </p>
              <div style={{ background: 'var(--color-page)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '1rem', textAlign: 'left', fontSize: '0.875rem' }}>
                <p><strong>{lang === 'hi' ? 'नाम:' : 'Name:'}</strong> {status.successData.fullName}</p>
                <p><strong>{lang === 'hi' ? 'मोबाइल नंबर:' : 'Mobile:'}</strong> {status.successData.mobileNormalized}</p>
                <p><strong>{lang === 'hi' ? 'विद्यालय:' : 'School:'}</strong> {status.successData.school}</p>
                <p><strong>{lang === 'hi' ? 'कक्षा / ग्रेड:' : 'Class:'}</strong> {status.successData.classOrGrade}</p>
                <p><strong>{lang === 'hi' ? 'भूमिका (Role):' : 'Role:'}</strong> <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{status.successData.role}</span></p>
              </div>
              <button className="btn btn-primary w-full" style={{ marginTop: '1.5rem' }} onClick={handleReset}>
                {lang === 'hi' ? 'पूर्ण / बंद करें' : 'Done / Close'}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {status.error && (
                <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', color: '#B91C1C', padding: '0.65rem 0.85rem', borderRadius: '6px', fontSize: '0.85rem' }}>
                  ⚠️ {status.error}
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  {lang === 'hi' ? 'विद्यार्थी का पूरा नाम *' : 'Full Name *'}
                </label>
                <input 
                  type="text"
                  name="fullName"
                  required
                  placeholder={lang === 'hi' ? 'उदा. राहुल शर्मा' : 'e.g. Rahul Sharma'}
                  value={formData.fullName}
                  onChange={handleChange}
                  style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  {lang === 'hi' ? 'मोबाइल नंबर (10 अंक) *' : 'Mobile Number (10 digits) *'}
                </label>
                <input 
                  type="tel"
                  name="mobile"
                  required
                  placeholder={lang === 'hi' ? 'उदा. 9876543210' : 'e.g. 9876543210'}
                  value={formData.mobile}
                  onChange={handleChange}
                  style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    {lang === 'hi' ? 'विद्यालय / कॉलेज *' : 'School / College *'}
                  </label>
                  <input 
                    type="text"
                    name="school"
                    required
                    placeholder={lang === 'hi' ? 'उदा. शासकीय उच्च विद्यालय' : 'e.g. Govt High School'}
                    value={formData.school}
                    onChange={handleChange}
                    style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    {lang === 'hi' ? 'कक्षा / ग्रेड *' : 'Class / Grade *'}
                  </label>
                  <input 
                    type="text"
                    name="classOrGrade"
                    required
                    placeholder={lang === 'hi' ? 'उदा. कक्षा 10 / 12' : 'e.g. Grade 10 / 12'}
                    value={formData.classOrGrade}
                    onChange={handleChange}
                    style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    {lang === 'hi' ? 'पासवर्ड (न्यूनतम 6 अक्षर) *' : 'Password (min 6 chars) *'}
                  </label>
                  <input 
                    type="password"
                    name="password"
                    required
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={handleChange}
                    style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    {lang === 'hi' ? 'पासवर्ड पुष्टि *' : 'Confirm Password *'}
                  </label>
                  <input 
                    type="password"
                    name="confirmPassword"
                    required
                    placeholder="••••••••"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}
                  />
                </div>
              </div>

              <button 
                type="submit"
                disabled={status.loading}
                className="btn btn-primary w-full"
                style={{ marginTop: '0.5rem' }}
              >
                {status.loading 
                  ? (lang === 'hi' ? 'पंजीकरण हो रहा है...' : 'Registering...') 
                  : (lang === 'hi' ? 'पंजीकरण पूर्ण करें' : 'Complete Registration')}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
