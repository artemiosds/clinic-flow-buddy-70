import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  FileText, Search, RefreshCw, ExternalLink, Download, 
  History, User, Building, Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/layout/PageHeader';
import { cn } from '@/lib/utils';


const ArquivoDigital: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    loadDocuments();
  }, [user?.unidadeId]);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('documentos_assinatura_autentique')
        .select('*')
        .order('enviado_em', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (searchTerm) {
        query = query.or(`paciente_nome.ilike.%${searchTerm}%,titulo_documento.ilike.%${searchTerm}%`);
      }

      const { data, error } = await query;

      if (error) throw error;
      setDocuments(data || []);
    } catch (e: any) {
      toast.error('Erro ao carregar documentos: ' + e.message);
    }
    setLoading(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'concluido':
        return <Badge className="bg-green-100 text-green-700 border-green-200">Assinado</Badge>;
      case 'pendente':
        return <Badge variant="outline" className="text-amber-600 border-amber-200">Pendente</Badge>;
      case 'parcialmente_assinado':
        return <Badge variant="outline" className="text-blue-600 border-blue-200">Parcial</Badge>;
      case 'recusado':
        return <Badge variant="destructive">Recusado</Badge>;
      case 'cancelado':
        return <Badge variant="secondary">Cancelado</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const handleDownload = async (doc: any) => {
    if (!doc.storage_path_assinado) {
      toast.error('Arquivo assinado ainda não disponível para download.');
      return;
    }

    try {
      const { data, error } = await supabase.storage
        .from(doc.storage_bucket || 'documentos')
        .createSignedUrl(doc.storage_path_assinado, 60);

      if (error) throw error;
      window.open(data.signedUrl, '_blank');
    } catch (e: any) {
      toast.error('Erro ao gerar link de download: ' + e.message);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <PageHeader
        title="Arquivo Digital"
        subtitle="Central de documentos assinados eletronicamente via Autentique"
        actions={
          <Button variant="outline" size="sm" onClick={loadDocuments} disabled={loading}>
            <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
            Atualizar Base
          </Button>
        }
      />


      <Card className="shadow-card border-0">
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar por paciente ou documento..." 
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadDocuments()}
              />
            </div>
            <div className="w-full md:w-48">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Status</SelectItem>
                  <SelectItem value="concluido">Assinados</SelectItem>
                  <SelectItem value="pendente">Pendentes</SelectItem>
                  <SelectItem value="parcialmente_assinado">Parciais</SelectItem>
                  <SelectItem value="recusado">Recusados</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={loadDocuments}>Filtrar</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <ScrollArea className="h-[600px] w-full">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-muted-foreground border-b sticky top-0 z-10">
                    <th className="p-4 text-left font-medium">Paciente / Origem</th>
                    <th className="p-4 text-left font-medium">Documento / Tipo</th>
                    <th className="p-4 text-left font-medium">Profissional / Unidade</th>
                    <th className="p-4 text-left font-medium">Status</th>
                    <th className="p-4 text-left font-medium">Datas</th>
                    <th className="p-4 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="p-12 text-center">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary/30" />
                        <p className="mt-2 text-muted-foreground">Carregando documentos...</p>
                      </td>
                    </tr>
                  ) : documents.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-12 text-center text-muted-foreground">
                        <History className="w-12 h-12 mx-auto opacity-20 mb-2" />
                        <p>Nenhum documento encontrado.</p>
                      </td>
                    </tr>
                  ) : (
                    documents.map((doc) => (
                      <tr key={doc.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-4">
                          <div className="font-semibold">{doc.paciente_nome || 'N/D'}</div>
                          <div className="flex items-center gap-1 mt-1">
                             <Badge variant="outline" className="text-[9px] h-4 uppercase">
                               {doc.origem === 'gerado_sistema' ? 'Sistema' : 'Upload'}
                             </Badge>
                             <span className="text-[10px] text-muted-foreground">ID: {doc.paciente_id}</span>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="max-w-[200px] truncate font-medium" title={doc.titulo_documento}>
                            {doc.titulo_documento || 'Sem Título'}
                          </div>
                          <div className="text-[10px] text-muted-foreground uppercase">{doc.tipo_documento}</div>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-1.5">
                            <User className="w-3 h-3 text-muted-foreground" />
                            <span>{doc.profissional_nome || 'N/D'}</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground">
                            <Building className="w-3 h-3" />
                            <span>{doc.unidade_nome || 'Unidade Padrão'}</span>
                          </div>
                        </td>
                        <td className="p-4">
                          {getStatusBadge(doc.status)}
                        </td>
                        <td className="p-4 text-[11px] space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground w-12 italic">Envio:</span>
                            <span>{doc.enviado_em ? format(new Date(doc.enviado_em), 'dd/MM/yy HH:mm') : '-'}</span>
                          </div>
                          {doc.finalizado_em && (
                            <div className="flex items-center gap-2 text-green-600 font-medium">
                              <span className="text-muted-foreground w-12 italic font-normal text-green-600/70">Fim:</span>
                              <span>{format(new Date(doc.finalizado_em), 'dd/MM/yy HH:mm')}</span>
                            </div>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex justify-end gap-1">
                            {doc.url_autentique && (
                              <Button variant="outline" size="icon" className="h-8 w-8" asChild>
                                <a href={doc.url_autentique} target="_blank" rel="noopener noreferrer" title="Ver no Autentique">
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              </Button>
                            )}
                            <Button 
                              variant="outline" 
                              size="icon" 
                              className={`h-8 w-8 ${doc.storage_path_assinado ? 'text-green-600 border-green-200 bg-green-50 hover:bg-green-100' : ''}`}
                              onClick={() => handleDownload(doc)}
                              disabled={!doc.storage_path_assinado}
                              title={doc.storage_path_assinado ? "Baixar PDF Assinado" : "Aguardando assinatura"}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </ScrollArea>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ArquivoDigital;
