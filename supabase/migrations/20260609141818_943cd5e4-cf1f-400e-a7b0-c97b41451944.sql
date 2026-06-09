-- 1. Reconciliação de Funcionários (Garantir que todos os funcionários ativos estejam linkados ao Auth)
UPDATE public.funcionarios f
SET auth_user_id = u.id
FROM auth.users u
WHERE lower(f.email) = lower(u.email)
AND f.auth_user_id IS NULL;

-- 2. Atualização da função is_staff_member para ser mais robusta
CREATE OR REPLACE FUNCTION public.is_staff_member()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_staff BOOLEAN;
  current_user_id UUID;
BEGIN
  current_user_id := auth.uid();
  
  -- Se for service_role (migrações, scripts), permite tudo
  IF auth.role() = 'service_role' THEN
    RETURN TRUE;
  END IF;

  IF current_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Verifica se é um funcionário ativo ou se tem perfil master
  SELECT EXISTS (
    SELECT 1 FROM public.funcionarios
    WHERE auth_user_id = current_user_id
    AND ativo = true
  ) INTO is_staff;

  RETURN is_staff;
END;
$function$;

-- 3. Correção das políticas de prontuarios para permitir acesso total a Masters
-- Removemos as políticas antigas para garantir limpeza
DROP POLICY IF EXISTS "Staff read prontuarios" ON public.prontuarios;
DROP POLICY IF EXISTS "Staff insert prontuarios" ON public.prontuarios;
DROP POLICY IF EXISTS "Staff update prontuarios" ON public.prontuarios;
DROP POLICY IF EXISTS "Staff delete prontuarios" ON public.prontuarios;

CREATE POLICY "Staff read prontuarios" ON public.prontuarios
  FOR SELECT TO authenticated
  USING (
    is_staff_member() OR 
    EXISTS (SELECT 1 FROM public.funcionarios WHERE auth_user_id = auth.uid() AND role = 'master')
  );

CREATE POLICY "Staff insert prontuarios" ON public.prontuarios
  FOR INSERT TO authenticated
  WITH CHECK (
    is_staff_member()
  );

CREATE POLICY "Staff update prontuarios" ON public.prontuarios
  FOR UPDATE TO authenticated
  USING (
    is_staff_member() OR 
    EXISTS (SELECT 1 FROM public.funcionarios WHERE auth_user_id = auth.uid() AND role = 'master')
  )
  WITH CHECK (
    is_staff_member() OR 
    EXISTS (SELECT 1 FROM public.funcionarios WHERE auth_user_id = auth.uid() AND role = 'master')
  );

CREATE POLICY "Staff delete prontuarios" ON public.prontuarios
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.funcionarios WHERE auth_user_id = auth.uid() AND role = 'master')
  );

-- 4. Correção da política de procedimentos (Causa Raiz do erro de salvamento/visibilidade)
DROP POLICY IF EXISTS "Profissionais podem gerenciar procedimentos de seus prontuário" ON public.prontuario_procedimentos;
DROP POLICY IF EXISTS "Staff manage prontuario_procedimentos" ON public.prontuario_procedimentos;
DROP POLICY IF EXISTS "Permitir acesso total para autenticados" ON public.prontuario_procedimentos;

-- Política definitiva para procedimentos: vincula profissional_id do prontuário com o auth.uid do usuário logado via tabela funcionarios
CREATE POLICY "Profissionais podem gerenciar procedimentos de seus prontuários" ON public.prontuario_procedimentos
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.prontuarios p
      JOIN public.funcionarios f ON p.profissional_id = f.id::text
      WHERE p.id = prontuario_procedimentos.prontuario_id
      AND f.auth_user_id = auth.uid()
    ) OR 
    EXISTS (SELECT 1 FROM public.funcionarios WHERE auth_user_id = auth.uid() AND role = 'master')
  );

CREATE POLICY "Staff read procedures" ON public.prontuario_procedimentos
  FOR SELECT TO authenticated
  USING (is_staff_member());

GRANT ALL ON public.prontuarios TO authenticated;
GRANT ALL ON public.prontuarios TO service_role;
GRANT ALL ON public.prontuario_procedimentos TO authenticated;
GRANT ALL ON public.prontuario_procedimentos TO service_role;
