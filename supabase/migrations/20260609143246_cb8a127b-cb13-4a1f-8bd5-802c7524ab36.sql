DROP POLICY IF EXISTS "Leitura de prontuários" ON public.prontuarios;
CREATE POLICY "Leitura de prontuários" ON public.prontuarios
FOR SELECT
TO authenticated
USING (
  is_staff_member() 
  OR 
  (paciente_id IN (SELECT id FROM pacientes WHERE auth_user_id = auth.uid()))
);
GRANT SELECT ON public.prontuarios TO authenticated;
GRANT SELECT ON public.prontuarios TO service_role;