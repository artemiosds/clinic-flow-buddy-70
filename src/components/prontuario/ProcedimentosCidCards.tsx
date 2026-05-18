import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Loader2, Plus, X, Star, StarOff, AlertTriangle,
  CheckCircle2, CloudOff, CloudUpload, Cloud, Stethoscope, Tag, History, Trash2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { procedureService } from '@/services/procedureService';

type ProcedimentoDB = {
  id: string;
  nome: string;
  especialidade?: string;
  origem?: string;
  total_cids?: number;
  [k: string]: any;
};

interface CidItem { codigo: string; descricao: string }

interface Props {
  procedimentos: ProcedimentoDB[];
  selectedProcIds: string[];
  setSelectedProcIds: React.Dispatch<React.SetStateAction<string[]>>;
  cidsByProc: Record<string, CidItem[]>;
  setCidsByProc: React.Dispatch<React.SetStateAction<Record<string, CidItem[]>>>;
  selectedCidsByProc: Record<string, string[]>;
  setSelectedCidsByProc: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  loadCidsForProc: (procId: string) => void;
  autosaveStatus: 'idle' | 'saving' | 'saved' | 'error';
  autosaveAt: Date | null;
  onRetrySave?: () => void;
  isMaster: boolean;
  onNewProcedure: () => void;
  pacienteProcHistory: Array<{ id: string; nome: string; ultima: string }>;
  profissao?: string;
}

/**
 * Redesigned section: Procedimentos vinculados a CIDs.
 * - Cards de procedimentos já adicionados (no topo)
 * - CID principal explícito (= primeiro da lista)
 * - CIDs relacionados como chips
 * - Busca unificada (procedimento ou CID) com Adicionar
 * - Indicador de status de salvamento em tempo real
 *
 * Persistência mantida: mesmos estados/lógica de selectedProcIds + selectedCidsByProc.
 */
const ProcedimentosCidCards: React.FC<Props> = ({
  procedimentos, selectedProcIds, setSelectedProcIds,
  cidsByProc, setCidsByProc, selectedCidsByProc, setSelectedCidsByProc,
  loadCidsForProc, autosaveStatus, autosaveAt, onRetrySave,
  isMaster, onNewProcedure, pacienteProcHistory, profissao,
}) => {
  const [query, setQuery] = useState('');
  const [procResults, setProcResults] = useState<ProcedimentoDB[]>([]);
  const [cidResults, setCidResults] = useState<CidItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const reqId = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Search debounce — busca procedimento + CID em paralelo
  useEffect(() => {
    if (query.trim().length < 2) { setProcResults([]); setCidResults([]); setSearching(false); return; }
    const id = ++reqId.current;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const [pr, ci] = await Promise.all([
          procedureService.searchProcedimentos(query, profissao, 15),
          procedureService.searchCids(query),
        ]);
        if (id === reqId.current) { setProcResults(pr); setCidResults(ci.slice(0, 15)); }
      } finally {
        if (id === reqId.current) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, profissao]);

  // Click outside fecha o dropdown
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const addedCards = useMemo(() => {
    return selectedProcIds
      .map(id => procedimentos.find(p => p.id === id))
      .filter(Boolean) as ProcedimentoDB[];
  }, [selectedProcIds, procedimentos]);

  const addProcedure = (proc: ProcedimentoDB) => {
    setSelectedProcIds(prev => prev.includes(proc.id) ? prev : [...prev, proc.id]);
    loadCidsForProc(proc.id);
    setQuery(''); setOpen(false);
  };

  const removeProcedure = (procId: string) => {
    setSelectedProcIds(prev => prev.filter(id => id !== procId));
    setSelectedCidsByProc(m => { const c = { ...m }; delete c[procId]; return c; });
  };

  const addCidToProc = (procId: string, cid: CidItem) => {
    setCidsByProc(m => {
      const ex = m[procId] || [];
      if (ex.some(x => x.codigo === cid.codigo)) return m;
      return { ...m, [procId]: [...ex, cid] };
    });
    setSelectedCidsByProc(m => ({
      ...m,
      [procId]: Array.from(new Set([...(m[procId] || []), cid.codigo])),
    }));
  };

  const removeCidFromProc = (procId: string, codigo: string) => {
    setSelectedCidsByProc(m => ({ ...m, [procId]: (m[procId] || []).filter(c => c !== codigo) }));
  };

  const setPrincipalCid = (procId: string, codigo: string) => {
    setSelectedCidsByProc(m => {
      const arr = m[procId] || [];
      if (!arr.includes(codigo)) return m;
      return { ...m, [procId]: [codigo, ...arr.filter(c => c !== codigo)] };
    });
  };

  // Quando o usuário escolhe um CID na busca global, vincula ao procedimento mais recente
  // (ou pede para selecionar primeiro um procedimento)
  const handlePickCidFromSearch = (cid: CidItem) => {
    if (addedCards.length === 0) {
      setOpen(false);
      // marca o CID como "pendente": cria um procedimento "Aguardando vínculo"? — não. Apenas avisa.
      // Como não há procedimento, abrimos um aviso visual usando o próprio query field.
      setQuery(cid.codigo + ' — adicione antes um procedimento');
      return;
    }
    const target = selectedProcIds[selectedProcIds.length - 1];
    addCidToProc(target, cid);
    setQuery(''); setOpen(false);
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-3">
        {/* Header — título + status de salvamento */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Stethoscope className="h-4 w-4 text-primary" />
            <Label className="text-sm font-semibold">Procedimentos & CIDs</Label>
            {addedCards.length > 0 && (
              <Badge variant="secondary" className="text-[10px]">{addedCards.length} adicionado{addedCards.length > 1 ? 's' : ''}</Badge>
            )}
          </div>
          <SaveStatus status={autosaveStatus} at={autosaveAt} onRetry={onRetrySave} />
        </div>

        {/* Cards de procedimentos adicionados */}
        {addedCards.length > 0 && (
          <div className="space-y-2">
            {addedCards.map(proc => {
              const allCids = cidsByProc[proc.id] || [];
              const selectedCodes = selectedCidsByProc[proc.id] || [];
              const principal = selectedCodes[0];
              const related = selectedCodes.slice(1);
              const sigtapInvalid = (proc.id || '').replace(/\D/g, '').length !== 10 && proc.origem !== 'PERSONALIZADO';
              return (
                <div
                  key={proc.id}
                  className="rounded-xl border border-border bg-card shadow-sm hover:shadow-elevated transition-shadow"
                >
                  {/* Card header */}
                  <div className="flex items-start gap-3 p-3 border-b">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-foreground leading-tight">{proc.nome}</span>
                        {proc.origem === 'PERSONALIZADO' ? (
                          <Badge variant="outline" className="h-5 text-[10px]">Personalizado</Badge>
                        ) : (
                          <code className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                            {proc.id}
                          </code>
                        )}
                        {sigtapInvalid && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="destructive" className="h-5 text-[10px] gap-1">
                                <AlertTriangle className="h-3 w-3" /> SIGTAP
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>Código SIGTAP inválido — não será exportado no BPA-I</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      {proc.especialidade && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 capitalize">
                          {proc.especialidade.replace(/_/g, ' ')}
                        </p>
                      )}
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button" variant="ghost" size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                          onClick={() => removeProcedure(proc.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Remover procedimento</TooltipContent>
                    </Tooltip>
                  </div>

                  {/* CID principal */}
                  <div className="px-3 pt-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">CID principal</span>
                    </div>
                    {principal ? (
                      <div className="inline-flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/30 px-2.5 py-1.5">
                        <code className="font-mono text-xs font-bold text-primary">{principal}</code>
                        <span className="text-xs text-foreground truncate max-w-[260px]">
                          {allCids.find(c => c.codigo === principal)?.descricao || ''}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeCidFromProc(proc.id, principal)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          aria-label="Remover CID principal"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground italic bg-muted/40 border border-dashed rounded-lg px-2.5 py-1.5">
                        Nenhum CID principal — selecione abaixo
                      </div>
                    )}
                  </div>

                  {/* CIDs relacionados */}
                  {related.length > 0 && (
                    <div className="px-3 pt-3">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          CIDs relacionados ({related.length})
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {related.map(code => {
                          const desc = allCids.find(c => c.codigo === code)?.descricao || '';
                          return (
                            <Tooltip key={code}>
                              <TooltipTrigger asChild>
                                <span className="group inline-flex items-center gap-1 rounded-full bg-secondary text-secondary-foreground border border-border pl-2 pr-1 py-0.5 text-[11px]">
                                  <button
                                    type="button"
                                    onClick={() => setPrincipalCid(proc.id, code)}
                                    className="font-mono font-semibold hover:text-amber-600 transition-colors"
                                    title="Tornar principal"
                                  >
                                    {code}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeCidFromProc(proc.id, code)}
                                    className="text-muted-foreground hover:text-destructive p-0.5 rounded-full hover:bg-destructive/10"
                                    aria-label={`Remover ${code}`}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <div className="text-xs">
                                  <div className="font-medium">{code}</div>
                                  {desc && <div className="text-muted-foreground">{desc}</div>}
                                  <div className="text-[10px] mt-1 opacity-70">Clique no código para tornar principal</div>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* CIDs sugeridos para este procedimento */}
                  <CidPickerForProc
                    proc={proc}
                    allCids={allCids}
                    selectedCodes={selectedCodes}
                    onAdd={(c) => addCidToProc(proc.id, c)}
                    onLoad={() => loadCidsForProc(proc.id)}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {addedCards.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center">
            <Stethoscope className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">Nenhum procedimento adicionado</p>
            <p className="text-xs text-muted-foreground mt-1">
              Pesquise abaixo por procedimento (nome ou código SIGTAP) ou CID-10.
            </p>
          </div>
        )}

        {/* Busca unificada + Adicionar */}
        <div ref={containerRef} className="relative">
          <div className="flex items-center justify-between mb-1.5">
            <Label className="text-xs text-muted-foreground">Buscar procedimento ou CID</Label>
            {isMaster && (
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={onNewProcedure}>
                <Plus className="h-3 w-3 mr-1" /> Novo procedimento
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={e => { setQuery(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                placeholder="Digite ao menos 2 caracteres..."
                className="pl-9 h-10"
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
          </div>

          {/* Dropdown unificado */}
          {open && query.trim().length >= 2 && (
            <div className="absolute z-50 left-0 right-0 mt-1 bg-popover border rounded-lg shadow-elevated max-h-96 overflow-y-auto">
              {/* Procedimentos */}
              {procResults.length > 0 && (
                <div>
                  <div className="sticky top-0 bg-popover/95 backdrop-blur px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground border-b">
                    Procedimentos ({procResults.length})
                  </div>
                  {procResults.map(p => {
                    const already = selectedProcIds.includes(p.id);
                    return (
                      <button
                        key={p.id} type="button"
                        disabled={already}
                        onClick={() => addProcedure(p)}
                        className="w-full text-left px-3 py-2 hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed border-b last:border-0 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <code className="font-mono text-[11px] bg-primary/10 text-primary px-1.5 py-0.5 rounded shrink-0">
                            {p.id}
                          </code>
                          <span className="text-sm flex-1 truncate">{p.nome}</span>
                          {already ? (
                            <Badge variant="secondary" className="h-5 text-[10px]">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Adicionado
                            </Badge>
                          ) : (
                            <Plus className="h-4 w-4 text-primary shrink-0" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {/* CIDs */}
              {cidResults.length > 0 && (
                <div>
                  <div className="sticky top-0 bg-popover/95 backdrop-blur px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground border-b">
                    CIDs ({cidResults.length}) {addedCards.length === 0 && '— adicione um procedimento primeiro'}
                  </div>
                  {cidResults.map(c => (
                    <button
                      key={c.codigo} type="button"
                      disabled={addedCards.length === 0}
                      onClick={() => handlePickCidFromSearch(c)}
                      className="w-full text-left px-3 py-2 hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed border-b last:border-0 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-[11px] bg-amber-500/10 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded shrink-0 font-bold">
                          {c.codigo}
                        </code>
                        <span className="text-sm flex-1 truncate">{c.descricao}</span>
                        <Plus className="h-4 w-4 text-primary shrink-0" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {!searching && procResults.length === 0 && cidResults.length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Nenhum resultado para "{query}"
                </div>
              )}
            </div>
          )}
        </div>

        {/* Histórico do paciente */}
        {pacienteProcHistory.length > 0 && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <div className="flex items-center gap-2 mb-2">
              <History className="h-3.5 w-3.5 text-primary" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                Histórico do paciente
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {pacienteProcHistory.slice(0, 8).map(h => {
                const added = selectedProcIds.includes(h.id);
                return (
                  <button
                    key={h.id} type="button"
                    disabled={added}
                    onClick={() => {
                      const proc = procedimentos.find(p => p.id === h.id);
                      if (proc) addProcedure(proc);
                    }}
                    className="inline-flex items-center gap-1 rounded-full bg-background border border-border px-2 py-1 text-xs hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {added ? <CheckCircle2 className="h-3 w-3 text-primary" /> : <Plus className="h-3 w-3" />}
                    <span className="truncate max-w-[160px]">{h.nome}</span>
                    <span className="text-[10px] text-muted-foreground">{h.ultima}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};

// ====== Subcomponent: CIDs sugeridos para o procedimento ======
const CidPickerForProc: React.FC<{
  proc: ProcedimentoDB;
  allCids: CidItem[];
  selectedCodes: string[];
  onAdd: (c: CidItem) => void;
  onLoad: () => void;
}> = ({ proc, allCids, selectedCodes, onAdd, onLoad }) => {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (open) onLoad(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const available = allCids.filter(c => !selectedCodes.includes(c.codigo));
  return (
    <div className="px-3 pb-3 pt-3">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="text-xs text-primary hover:underline inline-flex items-center gap-1"
      >
        <Plus className="h-3 w-3" /> {open ? 'Ocultar CIDs sugeridos' : `Adicionar CID${available.length ? ` (${available.length} sugerido${available.length > 1 ? 's' : ''})` : ''}`}
      </button>
      {open && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {available.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic">
              Nenhum CID sugerido para este procedimento — use a busca global acima.
            </p>
          ) : available.map(c => (
            <button
              key={c.codigo} type="button"
              onClick={() => onAdd(c)}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-border bg-background px-2 py-0.5 text-[11px] hover:border-primary hover:bg-primary/5 transition-colors"
            >
              <Plus className="h-2.5 w-2.5" />
              <code className="font-mono font-semibold">{c.codigo}</code>
              <span className="text-muted-foreground truncate max-w-[180px]">
                {c.descricao && `· ${c.descricao.slice(0, 32)}`}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ====== Subcomponent: Save status pill ======
const SaveStatus: React.FC<{
  status: 'idle' | 'saving' | 'saved' | 'error';
  at: Date | null;
  onRetry?: () => void;
}> = ({ status, at, onRetry }) => {
  if (status === 'saving') return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-full border">
      <Loader2 className="h-3 w-3 animate-spin" /> Salvando…
    </span>
  );
  if (status === 'saved') return (
    <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-1 rounded-full">
      <CheckCircle2 className="h-3 w-3" /> Salvo{at && ` às ${at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
    </span>
  );
  if (status === 'error') return (
    <span className="inline-flex items-center gap-1.5 text-xs text-destructive bg-destructive/10 border border-destructive/30 px-2 py-1 rounded-full">
      <CloudOff className="h-3 w-3" /> Erro ao salvar
      {onRetry && (
        <button type="button" onClick={onRetry} className="underline ml-1 font-medium">tentar novamente</button>
      )}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/30 px-2 py-1 rounded-full border">
      <CloudUpload className="h-3 w-3" /> Alterações serão salvas automaticamente
    </span>
  );
};

export default ProcedimentosCidCards;
