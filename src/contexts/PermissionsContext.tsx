import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type ModuleName =
  | 'dashboard'
  | 'agenda'
  | 'fila_espera'
  | 'pacientes'
  | 'atendimentos'
  | 'gestao_tratamentos'
  | 'prontuario'
  | 'triagem'
  | 'historico_triagem'
  | 'avaliacao_enfermagem'
  | 'pts'
  | 'avaliacao_multi'
  | 'relatorio_alta'
  | 'encaminhamentos'
  | 'encaminhamentos_externos'
  | 'arquivo_digital'
  | 'relatorios'
  | 'bpa_producao'
  | 'funcionarios'
  | 'unidades_salas'
  | 'disponibilidade'
  | 'feriados_bloqueios'
  | 'logs_auditoria'
  | 'configuracoes'
  | 'permissoes'
  | 'assinatura_eletronica'
  | 'modelos_documentos'
  | 'sistema';

export interface ModulePermission {
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_execute: boolean;
  can_print: boolean;
  can_export: boolean;
  can_attach: boolean;
  can_sign: boolean;
  can_approve: boolean;
  can_cancel: boolean;
  can_config: boolean;
}

type PermissionsMap = Record<ModuleName, ModulePermission>;

interface PermissionsContextType {
  permissions: PermissionsMap | null;
  loading: boolean;
  can: (modulo: ModuleName, action: keyof ModulePermission) => boolean;
  reload: () => Promise<void>;
}

export const ALL_MODULES: ModuleName[] = [
  'dashboard', 'agenda', 'fila_espera', 'pacientes', 'atendimentos',
  'gestao_tratamentos', 'prontuario', 'triagem', 'historico_triagem',
  'avaliacao_enfermagem', 'pts', 'avaliacao_multi', 'relatorio_alta',
  'encaminhamentos', 'encaminhamentos_externos', 'arquivo_digital',
  'relatorios', 'bpa_producao', 'funcionarios', 'unidades_salas',
  'disponibilidade', 'feriados_bloqueios', 'logs_auditoria',
  'configuracoes', 'permissoes', 'assinatura_eletronica',
  'modelos_documentos', 'sistema'
];

export const ALL_ACTIONS: (keyof ModulePermission)[] = [
  'can_view', 'can_create', 'can_edit', 'can_delete', 'can_execute',
  'can_print', 'can_export', 'can_attach', 'can_sign', 'can_approve',
  'can_cancel', 'can_config'
];

const defaultPerm: ModulePermission = {
  can_view: false, can_create: false, can_edit: false, can_delete: false, can_execute: false,
  can_print: false, can_export: false, can_attach: false, can_sign: false, can_approve: false,
  can_cancel: false, can_config: false
};

const fullPerm: ModulePermission = {
  can_view: true, can_create: true, can_edit: true, can_delete: true, can_execute: true,
  can_print: true, can_export: true, can_attach: true, can_sign: true, can_approve: true,
  can_cancel: true, can_config: true
};

const DEFAULT_PERMISSIONS_BY_ROLE: Record<string, Partial<PermissionsMap>> = {
  gestao: {
    dashboard: { can_view: true },
    pacientes: { can_view: true, can_create: true, can_edit: true, can_print: true, can_export: true },
    agenda: { can_view: true, can_create: true, can_edit: true, can_delete: true, can_execute: true, can_print: true },
    relatorios: { can_view: true, can_export: true },
    configuracoes: { can_view: true, can_config: true },
    permissoes: { can_view: true, can_edit: true }
  },
  profissional: {
    agenda: { can_view: true, can_execute: true, can_print: true },
    pacientes: { can_view: true },
    atendimentos: { can_view: true, can_create: true, can_edit: true },
    prontuario: { can_view: true, can_create: true, can_edit: true, can_print: true, can_sign: true }
  },
  recepcao: {
    agenda: { can_view: true, can_create: true, can_edit: true, can_execute: true },
    pacientes: { can_view: true, can_create: true, can_edit: true },
    fila_espera: { can_view: true, can_create: true, can_execute: true }
  }
};

function buildFullMap(partial: Partial<PermissionsMap>): PermissionsMap {
  const map = {} as PermissionsMap;
  ALL_MODULES.forEach((m) => {
    map[m] = { ...defaultPerm, ...(partial[m] || {}) };
  });
  return map;
}

const PermissionsContext = createContext<PermissionsContextType | null>(null);

export const usePermissions = () => {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error('usePermissions must be used within PermissionsProvider');
  return ctx;
};

export const PermissionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isGlobalAdmin } = useAuth();
  const [permissions, setPermissions] = useState<PermissionsMap | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPermissions = useCallback(async () => {
    if (!user) {
      setPermissions(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      // 1. Regra MASTER Global (admin.sms)
      if (isGlobalAdmin || (user.role === 'master' && !user.unidadeId)) {
        const full = {} as PermissionsMap;
        ALL_MODULES.forEach((m) => { full[m] = { ...fullPerm }; });
        setPermissions(full);
        setLoading(false);
        return;
      }

      const role = (user.role || '').toLowerCase().trim();
      const unidadeId = user.unidadeId || '';

      // 2. Buscar permissões de perfil
      const { data: perfilData } = await supabase
        .from('permissoes')
        .select('*')
        .eq('perfil', role)
        .in('unidade_id', unidadeId ? [unidadeId, ''] : ['']);

      // 3. Buscar overrides individuais
      const { data: userOverrides } = await supabase
        .from('permissoes_usuario')
        .select('*')
        .eq('user_id', user.id)
        .in('unidade_id', unidadeId ? [unidadeId, ''] : ['']);

      // 4. Consolidar mapa de permissões
      const map: Partial<PermissionsMap> = {};
      
      ALL_MODULES.forEach((m) => {
        // Hierarquia de prioridade:
        // 1. Override Individual na Unidade
        // 2. Override Individual Global
        // 3. Perfil na Unidade
        // 4. Perfil Global
        // 5. Default Hardcoded
        
        const uUnid = (userOverrides || []).find((r: any) => r.modulo === m && r.unidade_id === unidadeId && unidadeId);
        const uGlob = (userOverrides || []).find((r: any) => r.modulo === m && r.unidade_id === '');
        const pUnid = (perfilData || []).find((r: any) => r.modulo === m && r.unidade_id === unidadeId && unidadeId);
        const pGlob = (perfilData || []).find((r: any) => r.modulo === m && r.unidade_id === '');

        const pick = uUnid || uGlob || pUnid || pGlob;

        if (pick) {
          map[m] = {
            can_view: !!pick.can_view,
            can_create: !!pick.can_create,
            can_edit: !!pick.can_edit,
            can_delete: !!pick.can_delete,
            can_execute: !!pick.can_execute,
            can_print: !!pick.can_print,
            can_export: !!pick.can_export,
            can_attach: !!pick.can_attach,
            can_sign: !!pick.can_sign,
            can_approve: !!pick.can_approve,
            can_cancel: !!pick.can_cancel,
            can_config: !!pick.can_config,
          };
        } else {
          // Fallback para defaults se nada for encontrado no banco
          map[m] = (DEFAULT_PERMISSIONS_BY_ROLE[role]?.[m]) || { ...defaultPerm };
        }
      });

      setPermissions(buildFullMap(map));
    } catch (err) {
      console.error('[Permissions] Erro fatal:', err);
      setPermissions(buildFullMap({}));
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.role, user?.unidadeId, isGlobalAdmin]);

  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`permissoes-realtime-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'permissoes' }, () => loadPermissions())
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'permissoes_usuario', 
        filter: `user_id=eq.${user.id}` 
      }, () => loadPermissions())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, loadPermissions]);

  const can = useCallback(
    (modulo: ModuleName, action: keyof ModulePermission): boolean => {
      // Se for MASTER global, sempre true (já tratado no loadPermissions, mas garantindo aqui)
      if (isGlobalAdmin || (user?.role === 'master' && !user?.unidadeId)) return true;
      
      if (loading || !permissions) return false;
      return !!permissions[modulo]?.[action];
    },
    [permissions, loading, isGlobalAdmin, user?.role, user?.unidadeId]
  );

  return (
    <PermissionsContext.Provider value={{ permissions, loading, can, reload: loadPermissions }}>
      {children}
    </PermissionsContext.Provider>
  );
};
