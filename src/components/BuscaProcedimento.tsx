import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2, Tag } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { procedureService, type ProcedimentoDB } from '@/services/procedureService';

interface BuscaProcedimentoProps {
  value?: string;
  onChange: (procedimento: ProcedimentoDB) => void;
  profissao?: string;
  placeholder?: string;
}

function highlight(text: string, q: string) {
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 dark:bg-yellow-700/50 rounded px-0.5">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

export function BuscaProcedimento({ onChange, profissao, placeholder = "Buscar em toda a base SIGTAP (nome ou código)..." }: BuscaProcedimentoProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProcedimentoDB[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const reqIdRef = useRef(0);

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
    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    const id = ++reqIdRef.current;
    setLoading(true);
    const timeout = setTimeout(async () => {
      try {
        const list = await procedureService.searchProcedimentos(query, profissao, 30);
        if (id === reqIdRef.current) setResults(list);
      } finally {
        if (id === reqIdRef.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timeout);
  }, [query, profissao]);

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="pl-9"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {open && query.trim().length >= 2 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-80 overflow-y-auto">
          {!loading && results.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              Nenhum procedimento encontrado para "{query}"
            </div>
          ) : (
            results.map((p) => (
              <button
                key={p.id}
                type="button"
                className="w-full text-left px-3 py-2.5 hover:bg-accent hover:text-accent-foreground border-b last:border-0 transition-colors"
                onClick={() => { onChange(p); setQuery(''); setOpen(false); }}
              >
                <div className="flex items-start gap-2">
                  <span className="font-mono text-xs font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded shrink-0 mt-0.5">
                    {highlight(p.id, query)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium leading-snug">{highlight(p.nome, query)}</div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      {p.especialidade && (
                        <span className="capitalize">{p.especialidade.replace(/_/g, ' ')}</span>
                      )}
                      {(p.total_cids ?? 0) > 0 && (
                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px] gap-1">
                          <Tag className="h-2.5 w-2.5" />
                          {p.total_cids} CID{(p.total_cids ?? 0) > 1 ? 's' : ''}
                        </Badge>
                      )}
                      {p.origem === 'PERSONALIZADO' && (
                        <Badge variant="outline" className="h-5 px-1.5 text-[10px]">Personalizado</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
