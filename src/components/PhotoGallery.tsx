'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';

interface PhotoGalleryProps {
  images: string[];
  hideTitle?: boolean;
}

export default function PhotoGallery({ images, hideTitle = false }: PhotoGalleryProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  if (!images || images.length === 0) return null;

  return (
    <div style={{ marginTop: hideTitle ? 0 : '2rem' }}>
      {!hideTitle ? (
        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--foreground)' }}>Галерея</h3>
      ) : null}
      <div className="gallery-container" style={{
        display: 'flex',
        overflowX: 'auto',
        gap: '1rem',
        paddingBottom: '1rem',
        scrollSnapType: 'x mandatory',
        WebkitOverflowScrolling: 'touch'
      }}>
        {images.map((img, idx) => (
          <div 
            key={idx} 
            onClick={() => setSelectedImage(img)}
            style={{
              flex: '0 0 80%',
              maxWidth: '250px',
              aspectRatio: '4/3',
              scrollSnapAlign: 'start',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
              cursor: 'pointer',
              boxShadow: '0 4px 10px rgba(0,0,0,0.05)',
              transition: 'transform 0.2s'
            }}
            className="gallery-thumb"
          >
            <img 
              src={img} 
              alt={`Gallery image ${idx + 1}`} 
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
        ))}
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .gallery-thumb:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.1);
        }
      `}} />

      {/* Lightbox */}
      {selectedImage && (
        <div 
          onClick={() => setSelectedImage(null)}
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.85)',
            zIndex: 14000,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '2rem'
          }}
        >
          <button 
            onClick={() => setSelectedImage(null)}
            style={{
              position: 'absolute',
              top: '1.5rem', right: '1.5rem',
              color: 'white',
              background: 'rgba(255,255,255,0.2)',
              borderRadius: '50%',
              padding: '0.5rem',
              cursor: 'pointer'
            }}
          >
            <X size={24} />
          </button>
          
          <img 
            src={selectedImage} 
            alt="Fullscreen" 
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              borderRadius: '8px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.5)'
            }}
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
