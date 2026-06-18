import React from 'react';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: 'default' | 'accent' | 'danger';
}

export default function GlassCard({ children, className = '', variant = 'default', ...props }: GlassCardProps) {
  const baseStyles = 'rounded-xl border backdrop-blur-md transition-all duration-300';
  
  const variants = {
    default: 'bg-dark-surface/80 border-dark-border hover:bg-dark-surface hover:border-dark-border/80 shadow-lg',
    accent: 'bg-dark-accent/5 border-dark-accent/20 hover:bg-dark-accent/10 hover:border-dark-accent/40 shadow-glow-accent',
    danger: 'bg-dark-danger/5 border-dark-danger/20 hover:bg-dark-danger/10 hover:border-dark-danger/40 shadow-[0_0_15px_rgba(239,68,68,0.15)]',
  };

  return (
    <div className={`${baseStyles} ${variants[variant]} ${className}`} {...props}>
      {children}
    </div>
  );
}
