import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { procedureService, type ProcedimentoDB } from '@/services/procedureService';

interface BuscaProcedimentoProps {
  value?: string;
  onChange: (procedimento: ProcedimentoDB) => void;
  profissao?: string;
  placeholder?: string;
}

export function BuscaProcedimento({ value, onChange, profissao, placeholder = "Buscar procedimento por nome ou código..." }: BuscaProcedimentoProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProcedimentoDB[]>([]);
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
        const all = profissao 
          ? await procedureService.getByProfissao(profissao)
          : await procedureService.getActive();
        
        const q = query.toLowerCase();
        const filtered = all.filter(p => 
          p.nome.toLowerCase().includes(q) || 
          p.id.toLowerCase().includes(q)
        ).slice(0, 20);
        
        setResults(filtered);
      } finally {
        setLoading(false);
      }
    };

    const timeout = setTimeout(search, 300);
    return () => clearTimeout(timeout);
  }, [query, profissao]);

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
            <div className="p-3 text-sm text-muted-foreground text-center">Nenhum procedimento encontrado</div>
          ) : (
            results.map((p) => (
              <button
                key={p.id}
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-accent hover:text-accent-foreground text-sm border-b last:border-0"
                onClick={() => {
                  onChange(p);
                  setQuery('');
                  setOpen(false);
                }}
              >
                <div className="font-medium">{p.nome}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <span className="bg-muted px-1 rounded font-mono">{p.id}</span>
                  <span>{p.profissao}</span>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
