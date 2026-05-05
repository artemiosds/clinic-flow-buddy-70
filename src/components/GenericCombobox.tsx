import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

interface GenericComboboxProps {
  value?: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  allowCustom?: boolean;
}

const norm = (s: string) =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export default function GenericCombobox({
  value,
  onChange,
  options,
  placeholder = "Selecione...",
  disabled,
  className,
  allowCustom = true,
}: GenericComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = norm(query);
    if (!q) return options;
    return options.filter((item) => norm(item).includes(q));
  }, [query, options]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between h-10 font-normal bg-background",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{value || placeholder}</span>
          <div className="flex items-center gap-1">
            {value && !disabled && (
              <X 
                className="h-3 w-3 opacity-50 hover:opacity-100" 
                onClick={(e) => {
                  e.stopPropagation();
                  onChange("");
                }}
              />
            )}
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[--radix-popover-trigger-width] min-w-[280px]"
        align="start"
      >
        <div className="flex items-center border-b px-2 gap-1.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar..."
            className="h-9 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-0"
          />
        </div>
        <div className="max-h-[280px] overflow-y-auto">
          {filtered.length === 0 && query.trim() !== "" && allowCustom && (
            <button
              type="button"
              onClick={() => {
                onChange(query.trim());
                setOpen(false);
                setQuery("");
              }}
              className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-accent flex items-center gap-2"
            >
              <span>Usar "{query.trim()}"</span>
            </button>
          )}

          {filtered.length === 0 && query.trim() === "" && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma opção encontrada.
            </div>
          )}

          {filtered.map((item) => {
            const selected = value === item;
            return (
              <button
                key={item}
                type="button"
                onClick={() => {
                  onChange(item);
                  setOpen(false);
                  setQuery("");
                }}
                className={cn(
                  "w-full text-left flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground",
                  selected && "bg-accent/60",
                )}
              >
                <Check
                  className={cn(
                    "h-4 w-4",
                    selected ? "opacity-100 text-primary" : "opacity-0",
                  )}
                />
                <span className="truncate">{item}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
