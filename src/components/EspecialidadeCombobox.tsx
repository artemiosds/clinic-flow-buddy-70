import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Especialidade {
  id: string;
  nome: string;
  categoria?: string;
  origem: "padrao" | "personalizada";
}

interface EspecialidadeComboboxProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  unidadeId?: string;
}

const norm = (s: string) =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export default function EspecialidadeCombobox({
  value,
  onChange,
  placeholder = "Selecione a especialidade",
  disabled,
  className,
  unidadeId,
}: EspecialidadeComboboxProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<Especialidade[]>([]);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadEspecialidades = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("especialidades_config")
        .select("id, nome, categoria, origem")
        .eq("ativo", true)
        .order("nome");

      if (error) throw error;
      setList(data as Especialidade[]);
    } catch (err) {
      console.error("[loadEspecialidades]", err);
      toast.error("Erro ao carregar especialidades");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadEspecialidades();
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = norm(query);
    if (!q) return list;
    return list.filter((item) => norm(`${item.nome} ${item.categoria}`).includes(q));
  }, [query, list]);

  const handleAddCustom = async () => {
    if (!query.trim()) return;
    
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("especialidades_config")
        .insert({
          nome: query.trim(),
          origem: "personalizada",
          unidade_id: unidadeId,
          created_by: userData.user?.id
        } as any)
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          toast.error("Esta especialidade já existe");
        } else {
          throw error;
        }
        return;
      }

      toast.success("Especialidade personalizada adicionada!");
      setList(prev => [...prev, data as Especialidade].sort((a, b) => a.nome.localeCompare(b.nome)));
      onChange(data.nome);
      setOpen(false);
      setQuery("");
    } catch (err) {
      console.error("[addCustom]", err);
      toast.error("Erro ao adicionar especialidade");
    } finally {
      setSaving(false);
    }
  };

  const selectedItem = list.find(item => item.nome === value);

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
            placeholder="Buscar especialidade…"
            className="h-9 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-0"
          />
        </div>
        <div className="max-h-[280px] overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando especialidades…
            </div>
          )}
          
          {!loading && filtered.length === 0 && query.trim().length > 0 && (
            <div className="p-2 border-b">
              <Button 
                variant="ghost" 
                size="sm" 
                className="w-full justify-start gap-2 text-primary hover:text-primary hover:bg-primary/10"
                onClick={handleAddCustom}
                disabled={saving}
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Adicionar "{query.trim()}"
              </Button>
            </div>
          )}

          {!loading && filtered.length === 0 && query.trim().length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma especialidade encontrada.
            </div>
          )}

          {!loading &&
            filtered.map((item) => {
              const selected = value === item.nome;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onChange(item.nome);
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
                  <div className="flex flex-col">
                    <span className="truncate">{item.nome}</span>
                    {item.categoria && (
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        {item.categoria}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
