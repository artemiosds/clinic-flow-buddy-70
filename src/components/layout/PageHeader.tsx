import React from 'react';
import { BackButton } from './BackButton';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  backTo?: string;
  className?: string;
}

export const PageHeader = ({ title, subtitle, actions, backTo, className }: PageHeaderProps) => (
  <div className={cn("flex flex-col gap-4 mb-6 md:flex-row md:items-center md:justify-between animate-fade-in", className)}>
    <div className="flex flex-col gap-1 min-w-0">
      {backTo && <BackButton to={backTo} className="mb-1" />}
      <h1 className="text-2xl md:text-3xl font-bold font-display tracking-tight text-foreground truncate">{title}</h1>
      {subtitle && <p className="text-sm md:text-base text-muted-foreground line-clamp-1">{subtitle}</p>}
    </div>
    {actions && (
      <div className="flex flex-wrap items-center gap-2 md:justify-end shrink-0">
        {actions}
      </div>
    )}
  </div>
);
