import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PERMISSIONS_REGISTRY, MODULE_ACTIONS_MAP } from '@/config/permissions-registry';

// Nome de módulo agora é dinâmico baseado no registry
export type ModuleName = string;

// ModulePermission agora é um Record para suportar ações arbitrárias do JSONB
export type ModulePermission = Record<string, boolean>;

export type PermissionSourceType = 'role_global' | 'role_unit' | 'user_global' | 'user_unit' | 'master_global' | 'default';

export interface PermissionDetail {
  allowed: boolean;
  source: PermissionSourceType;
  inheritedFrom?: string;
}

type PermissionsMap = Record<ModuleName, ModulePermission>;
type PermissionsDetailMap = Record<ModuleName, Record<string, PermissionDetail>>;

interface PermissionsContextType {
  permissions: PermissionsMap | null;
  details: PermissionsDetailMap | null;
  loading: boolean;
  can: (modulo: ModuleName, action: string) => boolean;
  getDetail: (modulo: ModuleName, action: string) => PermissionDetail;
  reload: () => Promise<void>;
}

// Colunas fixas (boolean) que já existem no banco
const LEGACY_ACTION_COLUMNS = [
  'can_view', 'can_create', 'can_edit', 'can_delete', 'can_execute',
  'can_print', 'can_export', 'can_attach', 'can_sign', 'can_approve',
  'can_cancel', 'can_config'
];

const DEFAULT_PERMISSIONS_BY_ROLE: Record<string, Record<string, Partial<ModulePermission>>> = {
  gestao: {
    dashboard: { can_view: true },
    pacientes: { can_view: true, can_create: true, can_edit: true, can_print: true, can_export: true },
    agenda: { can_view: true, can_create: true, can_edit: true, can_delete: true, can_print: true },
    relatorios: { can_view: true, can_export: true },
    configuracoes: { can_view: true, can_config: true },
    permissoes: { can_view: true, can_edit: true }
  },
  profissional: {
    agenda: { can_view: true, can_print: true },
    pacientes: { can_view: true },
    atendimentos: { can_view: true, can_create: true, can_edit: true },
    prontuario: { can_view: true, can_create: true, can_edit: true, can_print: true, can_sign: true }
  },
  recepcao: {
    agenda: { can_view: true, can_create: true, can_edit: true },
    pacientes: { can_view: true, can_create: true, can_edit: true },
    fila_espera: { can_view: true, can_create: true }
  }
};

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
      // 1. Regra MASTER Global (admin.sms ou master sem unidade)
      if (isGlobalAdmin || (user.role === 'master' && !user.unidadeId)) {
        const full: PermissionsMap = {};
        const det: PermissionsDetailMap = {};
        
        PERMISSIONS_REGISTRY.forEach((mod) => {
          full[mod.id] = {};
          det[mod.id] = {};
          mod.actions.forEach(act => {
            full[mod.id][act.key] = true;
            det[mod.id][act.key] = { allowed: true, source: 'master_global' };
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
      const map: PermissionsMap = {};
      const detMap: PermissionsDetailMap = {};
      
      PERMISSIONS_REGISTRY.forEach((mod) => {
        const m = mod.id;
        map[m] = {};
        detMap[m] = {};

        const uUnid = (userOverrides || []).find((r: any) => r.modulo === m && r.unidade_id === unidadeId && unidadeId);
        const uGlob = (userOverrides || []).find((r: any) => r.modulo === m && r.unidade_id === '');
        const pUnid = (perfilData || []).find((r: any) => r.modulo === m && r.unidade_id === unidadeId && unidadeId);
        const pGlob = (perfilData || []).find((r: any) => r.modulo === m && r.unidade_id === '');

        mod.actions.forEach(act => {
          const a = act.key;
          let allowed = false;
          let source: PermissionSourceType = 'default';

          // Helper para pegar valor de permissão (seja da coluna boolean ou do JSONB)
          const getVal = (row: any, key: string) => {
            if (!row) return undefined;
            if (LEGACY_ACTION_COLUMNS.includes(key)) return row[key];
            return row.acoes_especificas?.[key];
          };

          const valUUnid = getVal(uUnid, a);
          const valUGlob = getVal(uGlob, a);
          const valPUnid = getVal(pUnid, a);
          const valPGlob = getVal(pGlob, a);

          if (valUUnid !== undefined) {
            allowed = !!valUUnid;
            source = 'user_unit';
          } else if (valUGlob !== undefined) {
            allowed = !!valUGlob;
            source = 'user_global';
          } else if (valPUnid !== undefined) {
            allowed = !!valPUnid;
            source = 'role_unit';
          } else if (valPGlob !== undefined) {
            allowed = !!valPGlob;
            source = 'role_global';
          } else {
            allowed = !!(DEFAULT_PERMISSIONS_BY_ROLE[role]?.[m]?.[a]);
            source = 'default';
          }

          map[m][a] = allowed;
          detMap[m][a] = { allowed, source };
        });
      });

      setPermissions(map);
      setDetails(detMap);
    } catch (err) {
      console.error('[Permissions] Erro fatal ao carregar permissões:', err);
      // Fallback para mapa vazio
      const fallbackMap: PermissionsMap = {};
      PERMISSIONS_REGISTRY.forEach(m => fallbackMap[m.id] = {});
      setPermissions(fallbackMap);
      setDetails(null);
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.role, user?.unidadeId, isGlobalAdmin]);

  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  // Realtime updates
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
    (modulo: ModuleName, action: string): boolean => {
      // Master global sempre tem acesso a tudo
      if (isGlobalAdmin || (user?.role === 'master' && !user?.unidadeId)) return true;
      if (loading || !permissions) return false;
      return !!permissions[modulo]?.[action];
    },
    [permissions, loading, isGlobalAdmin, user?.role, user?.unidadeId]
  );

  const getDetail = useCallback(
    (modulo: ModuleName, action: string): PermissionDetail => {
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
