import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Download, FileText, Search, Users, Activity, HeartPulse, Stethoscope, AlertTriangle, TrendingUp, Filter } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b', '#ec4899', '#f97316'];

// Mapeamento CID -> Categoria Assistencial
export const CLASSIFICACAO_CLINICA: Record<string, { label: string; cor: string; icon: any }> = {
  'TEA': { label: 'TEA / Autismo', cor: '#8b5cf6', icon: Activity },
  'SURDEZ': { label: 'Pessoa Surda', cor: '#0ea5e9', icon: Activity },
  'DEF_AUDITIVA': { label: 'Deficiência Auditiva', cor: '#3b82f6', icon: Activity },
  'DEF_VISUAL': { label: 'Deficiência Visual', cor: '#10b981', icon: Activity },
  'DEF_FISICA': { label: 'Deficiência Física', cor: '#f59e0b', icon: Activity },
  'DEF_INTELECTUAL': { label: 'Deficiência Intelectual', cor: '#f97316', icon: Activity },
  'FALA_LINGUAGEM': { label: 'Fala e Linguagem', cor: '#ec4899', icon: Activity },
  'NEURODESENVOLVIMENTO': { label: 'Neurodesenvolvimento', cor: '#6366f1', icon: Activity },
  'MOTORES': { label: 'Transtornos Motores', cor: '#14b8a6', icon: Activity },
  'NEUROLOGICO': { label: 'Condições Neurológicas', cor: '#475569', icon: Activity },
  'REABILITACAO': { label: 'Reabilitação Geral', cor: '#22c55e', icon: Activity },
  'OUTROS': { label: 'Outras Condições', cor: '#94a3b8', icon: Activity },
};

// Regras de classificação baseadas em prefixos ou códigos CID-10
export const getCategoriaPorCid = (cid: string): string => {
  if (!cid) return 'OUTROS';
  const c = cid.toUpperCase().trim();
  
  if (c.startsWith('F84')) return 'TEA';
  if (c === 'H90' || c === 'H91' || c.startsWith('H90') || c.startsWith('H91')) return 'DEF_AUDITIVA';
  if (c === 'H54' || c.startsWith('H54')) return 'DEF_VISUAL';
  if (c.startsWith('F70') || c.startsWith('F71') || c.startsWith('F72') || c.startsWith('F73') || c.startsWith('F79')) return 'DEF_INTELECTUAL';
  if (c.startsWith('F80') || c.startsWith('R47') || c.startsWith('F81')) return 'FALA_LINGUAGEM';
  if (c.startsWith('F82') || c.startsWith('G80') || c.startsWith('G81') || c.startsWith('G82')) return 'MOTORES';
  if (c.startsWith('F8')) return 'NEURODESENVOLVIMENTO';
  if (c.startsWith('G')) return 'NEUROLOGICO';
  if (c.startsWith('M') || c.startsWith('Q6') || c.startsWith('Q7')) return 'DEF_FISICA';
  if (c.startsWith('Z50')) return 'REABILITACAO';
  
  return 'OUTROS';
};

interface AnaliseClinicaProps {
  dateFrom: string;
  dateTo: string;
  filterUnit: string;
  filterProf: string;
}

const AnaliseClinica: React.FC<AnaliseClinicaProps> = ({ dateFrom, dateTo, filterUnit, filterProf }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [detalheCategoria, setDetalheCategoria] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Buscar prontuarios e procedimentos com CID
      let query = (supabase as any)
        .from('prontuario_procedimentos')
        .select(`
          id,
          paciente_id,
          profissional_id,
          unidade_id,
          codigo_sigtap,
          nome_procedimento,
          cid,
          observacao,
          prontuarios:prontuario_id(
            data_atendimento,
            profissional_nome,
            setor,
            pacientes:paciente_id(nome, cns, data_nascimento)
          )
        `);

      if (dateFrom) query = query.gte('prontuarios.data_atendimento', dateFrom);
      if (dateTo) query = query.lte('prontuarios.data_atendimento', dateTo);
      if (filterUnit !== 'all') query = query.eq('unidade_id', filterUnit);
      if (filterProf !== 'all') query = query.eq('profissional_id', filterProf);

      const { data: res, error } = await query;

      if (error) throw error;

      // 2. Processar dados para o relatório
      const processed = (res || []).map((item: any) => {
        const cids = [];
        if (item.cid) cids.push(item.cid);
        
        // Tentar extrair CIDs extras da observação (JSON)
        try {
          if (item.observacao) {
            const parsed = JSON.parse(item.observacao);
            if (Array.isArray(parsed?.cids)) {
              parsed.cids.forEach((c: any) => {
                if (c.codigo && !cids.includes(c.codigo)) cids.push(c.codigo);
              });
            }
          }
        } catch (e) {}

        return {
          ...item,
          cids,
          categorias: cids.map(getCategoriaPorCid),
          paciente_nome: item.prontuarios?.pacientes?.nome || 'Desconhecido',
          data: item.prontuarios?.data_atendimento,
          profissional: item.prontuarios?.profissional_nome
        };
      });

      setData(processed);
    } catch (err) {
      console.error('Erro ao carregar análise clínica:', err);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadData();
  }, [dateFrom, dateTo, filterUnit, filterProf]);

  const stats = useMemo(() => {
    const pacUnicos = new Set();
    const pacPorCategoria: Record<string, Set<string>> = {};
    const atendimentosPorCategoria: Record<string, number> = {};
    const cidsFreq: Record<string, number> = {};
    const procsFreq: Record<string, number> = {};
    
    data.forEach(item => {
      pacUnicos.add(item.paciente_id);
      
      item.cids.forEach((c: string) => {
        cidsFreq[c] = (cidsFreq[c] || 0) + 1;
      });

      item.categorias.forEach((cat: string) => {
        if (!pacPorCategoria[cat]) pacPorCategoria[cat] = new Set();
        pacPorCategoria[cat].add(item.paciente_id);
        atendimentosPorCategoria[cat] = (atendimentosPorCategoria[cat] || 0) + 1;
      });

      const procKey = `${item.codigo_sigtap} - ${item.nome_procedimento}`;
      procsFreq[procKey] = (procsFreq[procKey] || 0) + 1;
    });

    const categoriasChart = Object.keys(CLASSIFICACAO_CLINICA).map(catKey => ({
      name: CLASSIFICACAO_CLINICA[catKey].label,
      pacientes: pacPorCategoria[catKey]?.size || 0,
      atendimentos: atendimentosPorCategoria[catKey] || 0,
      key: catKey,
      color: CLASSIFICACAO_CLINICA[catKey].cor
    })).filter(c => c.pacientes > 0 || c.atendimentos > 0).sort((a, b) => b.pacientes - a.pacientes);

    const cidsRanking = Object.entries(cidsFreq)
      .map(([cid, count]) => ({ cid, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const procsRanking = Object.entries(procsFreq)
      .map(([proc, count]) => ({ proc, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalPacientes: pacUnicos.size,
      totalAtendimentos: data.length,
      pacPorCategoria,
      categoriasChart,
      cidsRanking,
      procsRanking,
      teaCount: pacPorCategoria['TEA']?.size || 0,
      surdezCount: (pacPorCategoria['SURDEZ']?.size || 0) + (pacPorCategoria['DEF_AUDITIVA']?.size || 0),
      fisicaCount: pacPorCategoria['DEF_FISICA']?.size || 0,
      intelectualCount: pacPorCategoria['DEF_INTELECTUAL']?.size || 0,
      multiCidCount: Array.from(pacUnicos).filter(pid => {
        const pData = data.filter(d => d.paciente_id === pid);
        const allCids = new Set(pData.flatMap(d => d.cids));
        return allCids.size > 1;
      }).length
    };
  }, [data]);

  const filteredPacientesList = useMemo(() => {
    if (!detalheCategoria) return [];
    const pids = stats.pacPorCategoria[detalheCategoria] || new Set();
    const list: any[] = [];
    const seenPids = new Set();
    
    data.forEach(item => {
      if (pids.has(item.paciente_id) && !seenPids.has(item.paciente_id)) {
        seenPids.add(item.paciente_id);
        const pacData = data.filter(d => d.paciente_id === item.paciente_id);
        const cids = [...new Set(pacData.flatMap(d => d.cids))];
        const procs = [...new Set(pacData.map(d => d.nome_procedimento))];
        list.push({
          id: item.paciente_id,
          nome: item.paciente_nome,
          cids: cids.join(', '),
          procedimentos: procs.slice(0, 2).join(', ') + (procs.length > 2 ? '...' : ''),
          totalAtendimentos: pacData.length,
          ultimoAtendimento: item.data
        });
      }
    });
    return list;
  }, [detalheCategoria, data, stats]);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {[
          { label: 'Pacientes c/ CID', value: stats.totalPacientes, icon: Users, color: 'text-blue-600' },
          { label: 'TEA / Autismo', value: stats.teaCount, icon: Activity, color: 'text-purple-600' },
          { label: 'Surdez / Auditiva', value: stats.surdezCount, icon: HeartPulse, color: 'text-cyan-600' },
          { label: 'Def. Física', value: stats.fisicaCount, icon: Stethoscope, color: 'text-amber-600' },
          { label: 'Def. Intelectual', value: stats.intelectualCount, icon: AlertTriangle, color: 'text-orange-600' },
          { label: 'Múltiplos CIDs', value: stats.multiCidCount, icon: TrendingUp, color: 'text-indigo-600' },
          { label: 'Atendimentos', value: stats.totalAtendimentos, icon: Activity, color: 'text-emerald-600' },
          { label: 'Procedimentos', value: stats.totalAtendimentos, icon: Filter, color: 'text-slate-600' },
        ].map((kpi, idx) => (
          <Card key={idx} className="border-none shadow-sm bg-white overflow-hidden">
            <CardContent className="p-3 text-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center mx-auto mb-1 ${kpi.color.replace('text', 'bg')}/10`}>
                <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
              </div>
              <p className="text-xl font-bold">{kpi.value}</p>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight">{kpi.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico de Categorias */}
        <Card className="border-none shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" /> Pacientes por Condição Clínica
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.categoriasChart} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 10 }} />
                  <Tooltip 
                    cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload;
                        return (
                          <div className="bg-white border p-2 shadow-lg rounded-md text-xs">
                            <p className="font-bold border-b mb-1">{d.name}</p>
                            <p>Pacientes: <span className="font-semibold">{d.pacientes}</span></p>
                            <p>Atendimentos: <span className="font-semibold">{d.atendimentos}</span></p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar 
                    dataKey="pacientes" 
                    radius={[0, 4, 4, 0]} 
                    onClick={(data) => setDetalheCategoria(data.key)}
                    cursor="pointer"
                  >
                    {stats.categoriasChart.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[10px] text-muted-foreground text-center mt-2 italic">Clique nas barras para ver a lista de pacientes</p>
          </CardContent>
        </Card>

        {/* Distribuição por Categoria (Pie) */}
        <Card className="border-none shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" /> Distribuição Assistencial
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.categoriasChart}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="pacientes"
                  >
                    {stats.categoriasChart.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Ranking CIDs */}
        <Card className="border-none shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-primary" /> CIDs Mais Frequentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.cidsRanking.map((c, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-12 text-xs font-mono font-bold text-primary">{c.cid}</div>
                  <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary/60 rounded-full" 
                      style={{ width: `${(c.count / stats.cidsRanking[0].count) * 100}%` }}
                    />
                  </div>
                  <div className="text-xs font-bold w-8 text-right">{c.count}</div>
                </div>
              ))}
              {stats.cidsRanking.length === 0 && <p className="text-center text-xs text-muted-foreground py-8">Nenhum CID registrado</p>}
            </div>
          </CardContent>
        </Card>

        {/* Ranking Procedimentos */}
        <Card className="border-none shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <HeartPulse className="w-4 h-4 text-primary" /> Procedimentos por Perfil Clínico
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.procsRanking.map((p, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <div className="flex justify-between items-center text-[10px] uppercase font-semibold">
                    <span className="truncate max-w-[280px]">{p.proc}</span>
                    <span className="font-bold">{p.count}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500/60 rounded-full" 
                      style={{ width: `${(p.count / stats.procsRanking[0].count) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
              {stats.procsRanking.length === 0 && <p className="text-center text-xs text-muted-foreground py-8">Nenhum procedimento registrado</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Detalhes (Rastreabilidade) */}
      {detalheCategoria && (
        <Card className="border-none shadow-lg animate-in fade-in slide-in-from-bottom-4">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Users className="w-4 h-4" /> Pacientes: {CLASSIFICACAO_CLINICA[detalheCategoria].label}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setDetalheCategoria(null)} className="h-7 text-xs">Fechar</Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left py-2 px-3">Nome do Paciente</th>
                    <th className="text-left py-2 px-3">CIDs Vinculados</th>
                    <th className="text-left py-2 px-3">Principais Procedimentos</th>
                    <th className="text-center py-2 px-3">Qtd Atend.</th>
                    <th className="text-center py-2 px-3">Último Atendimento</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPacientesList.map((p, idx) => (
                    <tr key={idx} className="border-b hover:bg-muted/10 transition-colors">
                      <td className="py-2 px-3 font-semibold">{p.nome}</td>
                      <td className="py-2 px-3">
                        <div className="flex flex-wrap gap-1">
                          {p.cids.split(', ').map((c: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-[9px] h-4 px-1">{c}</Badge>
                          ))}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-muted-foreground italic">{p.procedimentos}</td>
                      <td className="py-2 px-3 text-center font-bold">{p.totalAtendimentos}</td>
                      <td className="py-2 px-3 text-center">{p.ultimoAtendimento ? new Date(p.ultimoAtendimento).toLocaleDateString('pt-BR') : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AnaliseClinica;
