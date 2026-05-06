import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PERMISSION_REGISTRY } from '@/config/permissionsRegistry';

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
        
        PERMISSION_REGISTRY.forEach((mod) => {
...
      PERMISSIONS_REGISTRY.forEach((mod) => {
...
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
