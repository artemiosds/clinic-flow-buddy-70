import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

/**
 * Combobox de municípios brasileiros (IBGE).
 * Carrega a lista oficial uma única vez e armazena em localStorage para
 * reutilização (alta performance + busca instantânea por nome/UF/código IBGE).
 *
 * Valor controlado: string no formato "Município - UF" (ex: "Oriximiná - PA").
 * onChange recebe (label, payload) onde payload contém { nome, uf, codigoIbge }.
 */

export interface MunicipioIbge {
  nome: string;
  uf: string;
  codigoIbge: string;
}

interface Props {
  value?: string;
  onChange: (label: string, payload: MunicipioIbge | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

const CACHE_KEY = "ibge_municipios_v1";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 dias

let inMemoryCache: MunicipioIbge[] | null = null;
let inflight: Promise<MunicipioIbge[]> | null = null;

async function loadMunicipios(): Promise<MunicipioIbge[]> {
  if (inMemoryCache) return inMemoryCache;
  if (inflight) return inflight;

  // localStorage
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.ts && Date.now() - parsed.ts < CACHE_TTL_MS && Array.isArray(parsed.data) && parsed.data.length > 0) {
        console.log("[IBGE] Carregando municípios do cache local...");
        inMemoryCache = parsed.data;
        return inMemoryCache;
      }
    }
  } catch (e) {
    console.warn("[IBGE] Erro ao ler cache local:", e);
  }

  inflight = (async () => {
    try {
      console.log("[IBGE] Buscando municípios da API oficial...");
      const res = await fetch(
        "https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome",
        { signal: AbortSignal.timeout(15000) } // Timeout de 15s
      );
      
      if (!res.ok) {
        console.error("[IBGE] Erro na API (Status):", res.status);
        throw new Error(`ibge_api_error_${res.status}`);
      }
      
      const json: any[] = await res.json();
      if (!Array.isArray(json) || json.length === 0) {
        throw new Error("ibge_api_empty_response");
      }

      const data: MunicipioIbge[] = json.map((m) => ({
        nome: m.nome,
        uf: m?.microrregiao?.mesorregiao?.UF?.sigla || m?.["regiao-imediata"]?.["regiao-intermediaria"]?.UF?.sigla || "",
        codigoIbge: String(m.id),
      }));

      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
      } catch (e) {
        console.warn("[IBGE] Erro ao salvar cache local:", e);
      }
      
      console.log(`[IBGE] ${data.length} municípios carregados com sucesso.`);
      inMemoryCache = data;
      return data;
    } catch (e: any) {
      console.error("[IBGE] Erro fatal ao carregar municípios:", e);
      throw e;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

// Normaliza para busca acent-insensitive
const norm = (s: string) =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export default function MunicipioIbgeCombobox({
  value,
  onChange,
  placeholder = "Selecione o município de naturalidade",
  disabled,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<MunicipioIbge[]>([]);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchList = useCallback(async (isManual = false) => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    try {
      const data = await loadMunicipios();
      if (!cancelled) {
        setList(data);
      }
    } catch (err: any) {
      if (!cancelled) {
        console.error("[MunicipioIbgeCombobox] Falha no fetch:", err);
        setError(err.message || "Erro de conexão");
        setList([]);
      }
    } finally {
      if (!cancelled) setLoading(false);
    }
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!open) return;
    if (list.length > 0) return;
    fetchList();
  }, [open, list.length, fetchList]);

  // Foco automático no input ao abrir
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = norm(query);
    if (!q) return list.slice(0, 200);
    const out: MunicipioIbge[] = [];
    for (const m of list) {
      const hay = norm(`${m.nome} ${m.uf} ${m.codigoIbge}`);
      if (hay.includes(q)) {
        out.push(m);
        if (out.length >= 200) break;
      }
    }
    return out;
  }, [query, list]);

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
            "w-full justify-between h-10 font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
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
            placeholder="Buscar município (nome, UF ou código IBGE)…"
            className="h-9 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-0"
          />
        </div>
        <div className="max-h-[280px] overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando municípios…
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="py-6 px-4 text-center text-sm text-muted-foreground flex flex-col items-center gap-3">
              {list.length === 0 ? (
                <>
                  <p className="text-destructive font-medium">
                    {error?.includes("403") ? "Acesso bloqueado pela API do IBGE." : 
                     error?.includes("timeout") ? "A API do IBGE demorou muito a responder." :
                     "Não foi possível carregar a lista de municípios."}
                  </p>
                  <Button size="sm" variant="outline" onClick={() => fetchList(true)}>
                    Tentar Novamente
                  </Button>
                </>
              ) : (
                "Nenhum município encontrado."
              )}
            </div>
          )}
          {!loading &&
            filtered.map((m) => {
              const label = `${m.nome} - ${m.uf}`;
              const selected = value === label;
              return (
                <button
                  key={m.codigoIbge}
                  type="button"
                  onClick={() => {
                    onChange(label, m);
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
                  <span className="truncate">{label}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {m.codigoIbge}
                  </span>
                </button>
              );
            })}
          {!loading && list.length > 0 && filtered.length >= 200 && (
            <div className="px-3 py-2 text-[11px] text-muted-foreground border-t">
              Mostrando os 200 primeiros. Refine sua busca.
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
