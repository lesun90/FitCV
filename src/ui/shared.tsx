import type { ReactNode } from 'react';

export const StatusPill = ({ icon, label, value, tone = 'neutral' }: { icon: ReactNode; label: string; value: string; tone?: 'neutral' | 'good' | 'warn' }) => (
  <span className={`status-pill ${tone}`}>
    {icon}
    <span>{label}</span>
    <strong>{value}</strong>
  </span>
);

export const downloadBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
};
