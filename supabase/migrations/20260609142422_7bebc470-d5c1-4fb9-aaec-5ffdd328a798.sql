-- 1. Simplificar e corrigir a função is_staff_member para ser ultra-eficiente e robusta
-- Mudamos para SQL puro para evitar overhead de PL/pgSQL em chamadas de RLS
CREATE OR REPLACE FUNCTION public.is_staff_member()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.funcionarios
    WHERE auth_user_id = auth.uid()
    AND ativo = true
  );
$function$;

-- 2. Recriar as políticas da tabela prontuarios com lógica simplificada e eficaz
DROP POLICY IF EXISTS "Staff read prontuarios" ON public.prontuarios;
DROP POLICY IF EXISTS "Staff insert prontuarios" ON public.prontuarios;
DROP POLICY IF EXISTS "Staff update prontuarios" ON public.prontuarios;
DROP POLICY IF EXISTS "Staff delete prontuarios" ON public.prontuarios;
DROP POLICY IF EXISTS "Pacientes read own prontuarios" ON public.prontuarios;

-- Política de Leitura: Funcionários ativos OU o próprio paciente
CREATE POLICY "Leitura de prontuários" ON public.prontuarios
  FOR SELECT TO authenticated
  USING (
    is_staff_member() 
    OR 
    (paciente_id IN (SELECT id FROM public.pacientes WHERE auth_user_id = auth.uid()))
  );

-- Política de Inserção: Apenas funcionários ativos
CREATE POLICY "Inserção de prontuários" ON public.prontuarios
  FOR INSERT TO authenticated
  WITH CHECK (is_staff_member());

-- Política de Atualização: Funcionários ativos (Edição permitida para toda a equipe ou master)
CREATE POLICY "Atualização de prontuários" ON public.prontuarios
  FOR UPDATE TO authenticated
  USING (is_staff_member())
  WITH CHECK (is_staff_member());

-- Política de Deleção: Apenas Master
CREATE POLICY "Deleção de prontuários" ON public.prontuarios
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.funcionarios 
      WHERE auth_user_id = auth.uid() 
      AND role = 'master' 
      AND ativo = true
    )
  );

-- 3. Corrigir a política de procedimentos para não depender de joins complexos no SELECT
DROP POLICY IF EXISTS "Profissionais podem gerenciar procedimentos de seus prontuários" ON public.prontuario_procedimentos;
DROP POLICY IF EXISTS "Staff read procedures" ON public.prontuario_procedimentos;
DROP POLICY IF EXISTS "Staff read prontuario_procedimentos" ON public.prontuario_procedimentos;

CREATE POLICY "Gerenciamento de procedimentos" ON public.prontuario_procedimentos
  FOR ALL TO authenticated
  USING (is_staff_member())
  WITH CHECK (is_staff_member());

-- 4. Garantir permissões de acesso ao esquema
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prontuarios TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prontuario_procedimentos TO authenticated;
GRANT ALL ON public.prontuarios TO service_role;
GRANT ALL ON public.prontuario_procedimentos TO service_role;
