import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Send, Network, RefreshCcw, Paperclip, X, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface PacienteRef {
  id: string;
  nome: string;
  cpf?: string;
  cns?: string;
  data_nascimento?: string;
  telefone?: string;
  cid?: string;
  endereco?: string;
  municipio?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  paciente?: PacienteRef;
  onSent?: () => void;
}

interface Sistema {
  id: string;
  nome: string;
  identificador_sistema: string;
  url_base: string;
  ativo: boolean;
  permite_enviar: boolean;
}

interface ProfRemoto {
  id: string;
  nome: string;
  especialidade: string;
  cargo?: string;
  conselho?: string;
}

const EncaminhamentoExternoModal: React.FC<Props> = ({ open, onOpenChange, paciente, onSent }) => {
  const { user } = useAuth();
  const [sistemas, setSistemas] = useState<Sistema[]>([]);
  const [sistemaId, setSistemaId] = useState('');
  const [profissionais, setProfissionais] = useState<ProfRemoto[]>([]);
  const [loadingProfs, setLoadingProfs] = useState(false);
  const [profDestinoId, setProfDestinoId] = useState('');
  const [especialidadeDestino, setEspecialidadeDestino] = useState('');
  const [motivo, setMotivo] = useState('');
  const [resumo, setResumo] = useState('');
  const [cid, setCid] = useState('');
  const [sending, setSending] = useState(false);
  const [anexos, setAnexos] = useState<Array<{ nome: string; mime_type: string; tamanho: number; storage_path: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setSistemaId(''); setProfissionais([]); setProfDestinoId('');
    setEspecialidadeDestino(''); setMotivo(''); setResumo('');
    setCid(paciente?.cid || '');
    setAnexos([]);
    (async () => {
      const { data } = await supabase
        .from('sistemas_integrados')
        .select('id, nome, identificador_sistema, url_base, ativo, permite_enviar')
        .eq('ativo', true)
        .eq('permite_enviar', true)
        .order('nome');
      setSistemas((data ?? []) as Sistema[]);
    })();
  }, [open, paciente?.cid]);

  const loadProfissionais = async (sId: string) => {
    if (!sId) return;
    setLoadingProfs(true);
    setProfissionais([]); setProfDestinoId('');
    try {
      const { data: lista, error: lErr } = await supabase.functions.invoke('integracao-listar-profissionais-proxy', {
        body: { sistema_id: sId },
      });
      if (lErr) throw lErr;
      if (lista?.ok) {
        setProfissionais((lista.profissionais ?? []) as ProfRemoto[]);
      } else {
        toast.error(`Falha ao listar profissionais: ${lista?.error ?? 'desconhecido'}`);
      }
    } catch (e: any) {
      toast.error(`Erro: ${e?.message ?? 'falha de rede'}`);
    } finally {
      setLoadingProfs(false);
    }
  };

  const especialidadesDisponiveis = useMemo(() => {
    const set = new Set(profissionais.map(p => p.especialidade).filter(Boolean));
    return Array.from(set);
  }, [profissionais]);

  const profsFiltrados = useMemo(() => {
    if (!especialidadeDestino) return profissionais;
    return profissionais.filter(p => p.especialidade === especialidadeDestino);
  }, [especialidadeDestino, profissionais]);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const novos: typeof anexos = [];
      for (const f of Array.from(files)) {
        if (f.size > 15 * 1024 * 1024) {
          toast.error(`${f.name}: tamanho máximo 15MB`);
          continue;
        }
        const path = `enviados/${paciente?.id || 'anon'}/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const { error } = await supabase.storage.from('encaminhamentos').upload(path, f, {
          contentType: f.type || 'application/octet-stream',
          upsert: false,
        });
        if (error) { toast.error(`${f.name}: ${error.message}`); continue; }
        novos.push({ nome: f.name, mime_type: f.type || 'application/octet-stream', tamanho: f.size, storage_path: path });
      }
      if (novos.length) setAnexos(prev => [...prev, ...novos]);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removerAnexo = async (storagePath: string) => {
    await supabase.storage.from('encaminhamentos').remove([storagePath]).catch(() => {});
    setAnexos(prev => prev.filter(a => a.storage_path !== storagePath));
  };

  const handleSubmit = async () => {
    if (!paciente) { toast.error('Paciente não identificado.'); return; }
    if (!sistemaId) { toast.error('Selecione o sistema de destino.'); return; }
    if (!motivo.trim() || motivo.trim().length < 10) {
      toast.error('Descreva o motivo (mín. 10 caracteres).');
      return;
    }
    const profDest = profissionais.find(p => p.id === profDestinoId);

    setSending(true);
    try {
      const payload = {
        origem_unidade: '',
        origem_profissional_id: user?.id || '',
        origem_profissional_nome: user?.nome || '',
        origem_especialidade: user?.profissao || '',
        destino_profissional_id: profDest?.id || '',
        destino_profissional_nome: profDest?.nome || '',
        destino_especialidade: especialidadeDestino || profDest?.especialidade || '',
        paciente_id_origem: paciente.id,
        paciente_nome: paciente.nome,
        paciente_cpf: paciente.cpf || '',
        paciente_cns: paciente.cns || '',
        paciente_data_nascimento: paciente.data_nascimento || '',
        paciente_telefone: paciente.telefone || '',
        paciente_dados: {
          endereco: paciente.endereco || '',
          municipio: paciente.municipio || '',
        },
        motivo: motivo.trim(),
        resumo_clinico: resumo.trim(),
        cid: cid.trim(),
        documento_texto: [
          `ENCAMINHAMENTO EXTERNO`,
          ``,
          `Paciente: ${paciente.nome}`,
          `CPF: ${paciente.cpf || '—'}    CNS: ${paciente.cns || '—'}`,
          `Nasc.: ${paciente.data_nascimento || '—'}`,
          ``,
          `Encaminhado por: ${user?.nome || ''} (${user?.profissao || user?.role || ''})`,
          profDest ? `Para: ${profDest.nome} — ${profDest.especialidade}` : `Especialidade: ${especialidadeDestino || '—'}`,
          ``,
          `Motivo:`,
          motivo.trim(),
          resumo.trim() ? `\nResumo clínico:\n${resumo.trim()}` : '',
          cid.trim() ? `\nCID: ${cid.trim()}` : '',
        ].join('\n'),
      };

      const { data, error } = await supabase.functions.invoke('integracao-enviar-encaminhamento', {
        body: { sistema_id: sistemaId, payload, anexos },
      });
      if (error) throw error;
      if (!data?.ok) {
        toast.error(`Falha: ${data?.message ?? data?.error ?? 'erro desconhecido'}`);
        return;
      }
      toast.success('Encaminhamento enviado ao sistema externo.');
      onSent?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao enviar encaminhamento.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Network className="w-5 h-5 text-primary" /> Encaminhamento Externo
          </DialogTitle>
          <DialogDescription>
            Envia o paciente para uma unidade parceira integrada via API segura.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-sm">Paciente</Label>
            <div className="text-sm font-medium mt-1">{paciente?.nome || '—'}</div>
          </div>

          <div>
            <Label className="text-sm">Sistema de Destino *</Label>
            <div className="flex gap-2 mt-1">
              <Select value={sistemaId} onValueChange={(v) => { setSistemaId(v); loadProfissionais(v); }}>
                <SelectTrigger>
                  <SelectValue placeholder={sistemas.length === 0 ? 'Nenhum sistema cadastrado' : 'Selecione...'} />
                </SelectTrigger>
                <SelectContent>
                  {sistemas.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {sistemaId && (
                <Button variant="outline" size="icon" onClick={() => loadProfissionais(sistemaId)} disabled={loadingProfs}>
                  {loadingProfs ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                </Button>
              )}
            </div>
            {sistemaId && !loadingProfs && profissionais.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Nenhum profissional disponível no destino ou conexão não retornou resultados.
              </p>
            )}
          </div>

          {profissionais.length > 0 && (
            <>
              <div>
                <Label className="text-sm">Especialidade de Destino</Label>
                <Select value={especialidadeDestino} onValueChange={(v) => { setEspecialidadeDestino(v); setProfDestinoId(''); }}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Qualquer especialidade disponível" />
                  </SelectTrigger>
                  <SelectContent>
                    {especialidadesDisponiveis.map(e => (
                      <SelectItem key={e} value={e}>{e}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm">Profissional de Destino (opcional)</Label>
                <Select value={profDestinoId} onValueChange={setProfDestinoId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Deixar em aberto (a unidade destino define)" />
                  </SelectTrigger>
                  <SelectContent>
                    {profsFiltrados.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome} <Badge variant="outline" className="ml-2 text-xs">{p.especialidade}</Badge>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <div>
            <Label className="text-sm">CID (opcional)</Label>
            <Input value={cid} onChange={e => setCid(e.target.value)} placeholder="Ex.: M54.5" className="mt-1" />
          </div>

          <div>
            <Label className="text-sm">Motivo do Encaminhamento *</Label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={4}
              placeholder="Justificativa clínica para o encaminhamento..."
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">{motivo.trim().length} caracteres (mín. 10)</p>
          </div>

          <div>
            <Label className="text-sm">Resumo Clínico (opcional)</Label>
            <Textarea
              value={resumo}
              onChange={(e) => setResumo(e.target.value)}
              rows={3}
              placeholder="História clínica resumida, condutas anteriores, exames relevantes..."
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-sm">Anexos clínicos (exames, imagens, PDFs)</Label>
            <div className="mt-1 flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                accept="image/*,application/pdf,.doc,.docx"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Paperclip className="w-4 h-4 mr-2" />}
                Adicionar arquivos
              </Button>
              <span className="text-xs text-muted-foreground">Máx. 15MB por arquivo</span>
            </div>
            {anexos.length > 0 && (
              <ul className="mt-2 space-y-1">
                {anexos.map(a => (
                  <li
                    key={a.storage_path}
                    className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2 py-1.5 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-primary shrink-0" />
                      <span className="truncate" title={a.nome}>{a.nome}</span>
                      <span className="text-muted-foreground shrink-0">
                        ({(a.tamanho / 1024).toFixed(0)} KB)
                      </span>
                    </div>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => removerAnexo(a.storage_path)}
                      aria-label={`Remover ${a.nome}`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={sending || !sistemaId} className="gradient-primary text-primary-foreground">
            {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Enviar Encaminhamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EncaminhamentoExternoModal;
