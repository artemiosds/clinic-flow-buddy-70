DROP POLICY IF EXISTS "Staff read pacientes" ON public.pacientes;
DROP POLICY IF EXISTS "Staff insert pacientes" ON public.pacientes;
DROP POLICY IF EXISTS "Staff update pacientes" ON public.pacientes;
DROP POLICY IF EXISTS "Staff delete pacientes" ON public.pacientes;

CREATE POLICY "Staff read pacientes" ON public.pacientes
  FOR SELECT TO authenticated
  USING (
    is_staff_member() OR 
    EXISTS (SELECT 1 FROM public.funcionarios WHERE auth_user_id = auth.uid() AND role = 'master')
  );

CREATE POLICY "Staff insert pacientes" ON public.pacientes
  FOR INSERT TO authenticated
  WITH CHECK (
    is_staff_member()
  );

CREATE POLICY "Staff update pacientes" ON public.pacientes
  FOR UPDATE TO authenticated
  USING (
    is_staff_member() OR 
    EXISTS (SELECT 1 FROM public.funcionarios WHERE auth_user_id = auth.uid() AND role = 'master')
  )
  WITH CHECK (
    is_staff_member() OR 
    EXISTS (SELECT 1 FROM public.funcionarios WHERE auth_user_id = auth.uid() AND role = 'master')
  );

CREATE POLICY "Staff delete pacientes" ON public.pacientes
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.funcionarios WHERE auth_user_id = auth.uid() AND role = 'master')
  );
