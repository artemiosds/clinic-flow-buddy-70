import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { procedureService } from '@/services/procedureService';

interface BuscaCIDProps {
  onSelect: (cid: { codigo: string; descricao: string }) => void;
  placeholder?: string;
}

export function BuscaCID({ onSelect, placeholder = "Buscar CID-10 por código ou diagnóstico..." }: BuscaCIDProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ codigo: string; descricao: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const search = async () => {
      if (query.length < 2) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const list = await procedureService.searchCids(query);
        setResults(list);
      } finally {
        setLoading(false);
      }
    };

    const timeout = setTimeout(search, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="pl-9"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {open && query.length >= 2 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md max-h-60 overflow-y-auto">
          {results.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground text-center">Nenhum CID encontrado</div>
          ) : (
            results.map((c) => (
              <button
                key={c.codigo}
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-accent hover:text-accent-foreground text-sm border-b last:border-0"
                onClick={() => {
                  onSelect(c);
                  setQuery('');
                  setOpen(false);
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="font-bold font-mono text-primary">{c.codigo}</span>
                  <span className="truncate">{c.descricao}</span>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
