import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BackButtonProps {
  to?: string;
  label?: string;
  className?: string;
}

export const BackButton = ({ to, label = "Voltar", className }: BackButtonProps) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (to) {
      navigate(to);
    } else {
      navigate(-1);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleBack}
      className={cn("pl-0 text-muted-foreground hover:text-foreground transition-colors group", className)}
    >
      <ChevronLeft className="w-4 h-4 mr-1 transition-transform group-hover:-translate-x-1" />
      <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
    </Button>
  );
};
