import React from 'react';

export default function ActionModal({ isOpen, actionName, onClose, t }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-wrap">
            <span className="modal-icon">ℹ️</span>
            <h3 className="modal-title">{t.modalTitle}</h3>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">✕</button>
        </div>

        <div className="modal-body">
          <div className="modal-action-pill">
            {t.modalSelected} <strong>{actionName}</strong>
          </div>
          <p className="modal-text">
            {t.modalMessage}
          </p>
          <div className="modal-roadmap-note">
            {t.modalRoadmap}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-primary w-full" onClick={onClose}>
            {t.modalClose}
          </button>
        </div>
      </div>
    </div>
  );
}
