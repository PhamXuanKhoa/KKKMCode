import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface FloatingActionButtonsProps {
  onAccept: () => void;
  onReject: () => void;
  className?: string;
}

export function FloatingActionButtons({ onAccept, onReject, className }: FloatingActionButtonsProps) {
  return (
    <div className={cn(
      "flex items-center gap-2 p-1 bg-zinc-900 border border-zinc-800 rounded-md shadow-sm",
      className
    )}>
      <Button
        variant="ghost"
        size="sm"
        onClick={onReject}
        className="h-8 px-3 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-sm transition-colors cursor-pointer"
      >
        <X size={14} />
        <span className="text-sm">Reject</span>
      </Button>

      <div className="w-[1px] h-4 bg-zinc-800" />

      <Button
        variant="ghost"
        size="sm"
        onClick={onAccept}
        className="h-8 px-3 text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-sm transition-colors cursor-pointer"
      >
        <Check size={14} />
        <span className="text-sm">Accept</span>
      </Button>
    </div>
  );
}
