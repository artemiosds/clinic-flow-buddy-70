import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Send, Network, RefreshCcw } from 'lucide-react';
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

  useEffect(() => {
    if (!open) return;
    setSistemaId(''); setProfissionais([]); setProfDestinoId('');
    setEspecialidadeDestino(''); setMotivo(''); setResumo('');
    setCid(paciente?.cid || '');
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
      const { data, error } = await supabase.functions.invoke('integracao-test-connection', {
        body: { sistema_id: sId },
      });
      // test-connection apenas pinga; usamos um endpoint dedicado: invoke a edge enviar-encam não lista; vamos usar fetch direto via uma função alternativa
      // Como temos integracao-listar-profissionais como endpoint público no parceiro, precisamos de um proxy autenticado.
      // Reaproveitamos o test-connection apenas para validar; e listamos via uma chamada extra:
      if (error) throw error;
      // Chama listar via outra invocação proxy (criamos abaixo)
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
        body: { sistema_id: sistemaId, payload },
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
