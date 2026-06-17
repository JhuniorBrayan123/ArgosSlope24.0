'use client';

import { useState, useCallback } from 'react';
import { useMonitor } from '@/context/MonitorContext';

interface BotonCapturaHDProps {
  /** Clases CSS adicionales */
  className?: string;
  /** Label personalizado (default: "📸 Capturar Talud HD") */
  label?: string;
  /** Variante visual */
  variant?: 'primary' | 'outline' | 'small';
}

export default function BotonCapturaHD({
  className = '',
  label = '📸 Capturar Talud HD',
  variant = 'primary',
}: BotonCapturaHDProps) {
  const { mqttConnected, triggerCapturaHd } = useMonitor();
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(() => {
    if (loading || !mqttConnected) return;
    setLoading(true);
    triggerCapturaHd();
    setTimeout(() => setLoading(false), 3000);
  }, [loading, mqttConnected, triggerCapturaHd]);

  const baseStyle =
    'rounded-lg px-4 py-2 text-sm font-medium transition-all';

  const variants = {
    primary: `${baseStyle} bg-dark-accent text-black hover:bg-dark-accent/80 active:scale-95 ${className}`,
    outline: `${baseStyle} border border-dark-accent/50 text-dark-accent hover:bg-dark-accent/10 ${className}`,
    small: `${baseStyle} px-3 py-1.5 text-xs bg-dark-accent text-black hover:bg-dark-accent/80 ${className}`,
  };

  if (!mqttConnected) {
    return (
      <button
        disabled
        className={`${baseStyle} cursor-not-allowed bg-dark-surface text-dark-secondary/50 ${className}`}
        title="MQTT desconectado"
      >
        📡 Sin conexión
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={variants[variant]}
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent" />
          Procesando...
        </span>
      ) : (
        label
      )}
    </button>
  );
}
