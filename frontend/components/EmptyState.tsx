import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export default function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-dark-border bg-dark-surface p-12 text-center animate-fade-in">
      {Icon && (
        <div className="mb-4 rounded-full bg-dark-accent/10 p-4 text-dark-accent shadow-glow-accent">
          <Icon size={32} />
        </div>
      )}
      <h3 className="mb-1 text-lg font-semibold text-dark-text">{title}</h3>
      <p className="text-sm text-dark-textSecondary max-w-md mx-auto mb-6">{description}</p>
      {action}
    </div>
  );
}
