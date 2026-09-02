export default function AdminLoading() {
  return (
    <div className="admin-page-shell" style={{ padding: '1rem 0 4rem' }} aria-busy>
      <div
        style={{
          height: 28,
          maxWidth: 280,
          borderRadius: 8,
          background: 'rgba(15,23,42,0.08)',
          marginBottom: '1rem',
        }}
      />
      <div
        style={{
          height: 120,
          maxWidth: 360,
          borderRadius: 12,
          background: 'rgba(15,23,42,0.06)',
        }}
      />
    </div>
  );
}
