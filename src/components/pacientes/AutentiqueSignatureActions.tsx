import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { 
  ShieldCheck, Loader2, Send, CheckCircle2, 
  ExternalLink, XCircle, RefreshCw, AlertCircle,
  Users, Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';

interface Props {
  documentoId: string;
  paciente?: any;
  profissional?: any;
  unidadeId?: string;
  titulo?: string;
  onSuccess?: () => void;
}

const AutentiqueSignatureActions: React.FC<Props> = ({ 
  documentoId, 
  paciente, 
  profissional, 
  unidadeId,
  titulo = 'Documento Clínico',
  onSuccess 
}) => {
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<any>(null);
  const [envioStatus, setEnvioStatus] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState(false);
  
  // Signatários selecionados
  const [signatarios, setSignatarios] = useState<any[]>([
    { nome: profissional?.nome || '', email: '', tipo_signatario: 'profissional', papel: 'assinar', selecionado: true },
    { nome: paciente?.nome || '', email: '', tipo_signatario: 'paciente', papel: 'assinar', selecionado: true },
  ]);

  useEffect(() => {
    loadConfig();
    checkStatus();
  }, [documentoId]);

  const loadConfig = async () => {
    const { data } = await supabase
      .from('assinatura_eletronica_config_public')
      .select('*')
      .eq('ativo', true)
      .maybeSingle();
    setConfig(data);
  };

  const checkStatus = async () => {
    const { data } = await supabase
      .from('documentos_assinatura_autentique')
      .select('*')
      .eq('documento_local_id', documentoId)
      .maybeSingle();
    setEnvioStatus(data);
  };

  const handleEnviar = async () => {
    const selecionados = signatarios.filter(s => s.selecionado);
    if (selecionados.some(s => !s.email)) {
      toast.error('Preencha o e-mail de todos os signatários selecionados.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('autentique-criar-documento', {
        body: {
          documento_local_id: documentoId,
          paciente_id: paciente?.id,
          titulo,
          signatarios: selecionados,
          unidade_id: unidadeId
        }
      });

      if (error) throw error;
      if (data.ok) {
        toast.success('Documento enviado ao Autentique!');
        setModalOpen(false);
        checkStatus();
        onSuccess?.();
      } else {
        toast.error('Erro ao enviar: ' + data.message);
      }
    } catch (e: any) {
      toast.error('Erro na integração: ' + e.message);
    }
    setLoading(false);
  };

  const updateSignatario = (index: number, field: string, value: any) => {
    setSignatarios(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  if (!config) return null;

  // Se já foi enviado, mostra status
  if (envioStatus) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant={
          envioStatus.status === 'concluido' ? 'default' : 
          envioStatus.status === 'erro' ? 'destructive' : 'secondary'
        } className="gap-1">
          {envioStatus.status === 'concluido' ? <CheckCircle2 className="w-3 h-3" /> : <Loader2 className="w-3 h-3 animate-spin" />}
          {envioStatus.status.replace('_', ' ').toUpperCase()}
        </Badge>
        {envioStatus.url_autentique && (
          <Button variant="ghost" size="sm" asChild className="h-7 text-[10px] gap-1">
            <a href={envioStatus.url_autentique} target="_blank" rel="noopener noreferrer">
              Ver no Autentique <ExternalLink className="w-3 h-3" />
            </a>
          </Button>
        )}
      </div>
    );
  }

  return (
    <>
      <Button 
        variant="outline" 
        size="sm" 
        className="bg-primary/5 hover:bg-primary/10 border-primary/20 text-primary gap-2 h-8"
        onClick={() => setModalOpen(true)}
      >
        <ShieldCheck className="w-4 h-4" />
        Assinar via Autentique
      </Button>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Enviar para Autentique
            </DialogTitle>
            <DialogDescription>
              Selecione quem deve assinar este documento eletronicamente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <Label className="text-sm font-bold flex items-center gap-2">
                <Users className="w-4 h-4" /> Signatários
              </Label>
              {signatarios.map((s, i) => (
                <div key={i} className="flex flex-col gap-2 p-3 rounded-lg border bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Checkbox 
                        checked={s.selecionado} 
                        onCheckedChange={(v) => updateSignatario(i, 'selecionado', !!v)} 
                      />
                      <span className="text-sm font-medium">{s.nome || (s.tipo_signatario === 'paciente' ? 'Paciente' : 'Profissional')}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {s.tipo_signatario}
                    </Badge>
                  </div>
                  {s.selecionado && (
                    <div className="grid grid-cols-1 gap-2 mt-1">
                      <Input 
                        placeholder={`E-mail do ${s.tipo_signatario}`}
                        value={s.email}
                        onChange={(e) => updateSignatario(i, 'email', e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg flex gap-3">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[10px] text-amber-800 leading-relaxed">
                Um link de assinatura será enviado para cada e-mail informado. O documento será validado juridicamente pelo Autentique.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button 
              onClick={handleEnviar} 
              disabled={loading || !signatarios.some(s => s.selecionado)}
              className="gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Enviar Agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AutentiqueSignatureActions;
