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

export type PermissionSourceType = 'role_global' | 'role_unit' | 'user_global' | 'user_unit' | 'master_global' | 'default';

export interface PermissionDetail {
  allowed: boolean;
  source: PermissionSourceType;
  inheritedFrom?: string;
}

type PermissionsMap = Record<ModuleName, ModulePermission>;
type PermissionsDetailMap = Record<ModuleName, Record<keyof ModulePermission, PermissionDetail>>;

interface PermissionsContextType {
  permissions: PermissionsMap | null;
  details: PermissionsDetailMap | null;
  loading: boolean;
  can: (modulo: ModuleName, action: keyof ModulePermission) => boolean;
  getDetail: (modulo: ModuleName, action: keyof ModulePermission) => PermissionDetail;
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
    dashboard: { ...defaultPerm, can_view: true },
    pacientes: { ...defaultPerm, can_view: true, can_create: true, can_edit: true, can_print: true, can_export: true },
    agenda: { ...defaultPerm, can_view: true, can_create: true, can_edit: true, can_delete: true, can_execute: true, can_print: true },
    relatorios: { ...defaultPerm, can_view: true, can_export: true },
    configuracoes: { ...defaultPerm, can_view: true, can_config: true },
    permissoes: { ...defaultPerm, can_view: true, can_edit: true }
  },
  profissional: {
    agenda: { ...defaultPerm, can_view: true, can_execute: true, can_print: true },
    pacientes: { ...defaultPerm, can_view: true },
    atendimentos: { ...defaultPerm, can_view: true, can_create: true, can_edit: true },
    prontuario: { ...defaultPerm, can_view: true, can_create: true, can_edit: true, can_print: true, can_sign: true }
  },
  recepcao: {
    agenda: { ...defaultPerm, can_view: true, can_create: true, can_edit: true, can_execute: true },
    pacientes: { ...defaultPerm, can_view: true, can_create: true, can_edit: true },
    fila_espera: { ...defaultPerm, can_view: true, can_create: true, can_execute: true }
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
  const [details, setDetails] = useState<PermissionsDetailMap | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPermissions = useCallback(async () => {
    if (!user) {
      setPermissions(null);
      setDetails(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      // 1. Regra MASTER Global (admin.sms)
      if (isGlobalAdmin || (user.role === 'master' && !user.unidadeId)) {
        const full = {} as PermissionsMap;
        const det = {} as PermissionsDetailMap;
        ALL_MODULES.forEach((m) => { 
          full[m] = { ...fullPerm }; 
          det[m] = {} as Record<keyof ModulePermission, PermissionDetail>;
          ALL_ACTIONS.forEach(a => {
            det[m][a] = { allowed: true, source: 'master_global' };
          });
        });
        setPermissions(full);
        setDetails(det);
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

      // 4. Consolidar mapa de permissões e detalhes
      const map: Partial<PermissionsMap> = {};
      const detMap = {} as PermissionsDetailMap;
      
      ALL_MODULES.forEach((m) => {
        map[m] = { ...defaultPerm };
        detMap[m] = {} as Record<keyof ModulePermission, PermissionDetail>;

        const uUnid = (userOverrides || []).find((r: any) => r.modulo === m && r.unidade_id === unidadeId && unidadeId);
        const uGlob = (userOverrides || []).find((r: any) => r.modulo === m && r.unidade_id === '');
        const pUnid = (perfilData || []).find((r: any) => r.modulo === m && r.unidade_id === unidadeId && unidadeId);
        const pGlob = (perfilData || []).find((r: any) => r.modulo === m && r.unidade_id === '');

        ALL_ACTIONS.forEach(a => {
          let allowed = false;
          let source: PermissionSourceType = 'default';

          if (uUnid && uUnid[a] !== undefined) {
            allowed = !!uUnid[a];
            source = 'user_unit';
          } else if (uGlob && uGlob[a] !== undefined) {
            allowed = !!uGlob[a];
            source = 'user_global';
          } else if (pUnid && pUnid[a] !== undefined) {
            allowed = !!pUnid[a];
            source = 'role_unit';
          } else if (pGlob && pGlob[a] !== undefined) {
            allowed = !!pGlob[a];
            source = 'role_global';
          } else {
            allowed = !!(DEFAULT_PERMISSIONS_BY_ROLE[role]?.[m]?.[a]);
            source = 'default';
          }

          map[m]![a] = allowed;
          detMap[m][a] = { allowed, source };
        });
      });

      setPermissions(buildFullMap(map));
      setDetails(detMap);
    } catch (err) {
      console.error('[Permissions] Erro fatal:', err);
      setPermissions(buildFullMap({}));
      setDetails(null);
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
      if (isGlobalAdmin || (user?.role === 'master' && !user?.unidadeId)) return true;
      if (loading || !permissions) return false;
      return !!permissions[modulo]?.[action];
    },
    [permissions, loading, isGlobalAdmin, user?.role, user?.unidadeId]
  );

  const getDetail = useCallback(
    (modulo: ModuleName, action: keyof ModulePermission): PermissionDetail => {
      if (isGlobalAdmin || (user?.role === 'master' && !user?.unidadeId)) {
        return { allowed: true, source: 'master_global' };
      }
      if (loading || !details || !details[modulo]) {
        return { allowed: false, source: 'default' };
      }
      return details[modulo][action] || { allowed: false, source: 'default' };
    },
    [details, loading, isGlobalAdmin, user?.role, user?.unidadeId]
  );

  return (
    <PermissionsContext.Provider value={{ permissions, details, loading, can, getDetail, reload: loadPermissions }}>
      {children}
    </PermissionsContext.Provider>
  );
};

