-- 1. Certificar que RLS está habilitado na action_logs
ALTER TABLE public.action_logs ENABLE ROW LEVEL SECURITY;

-- 2. Criar política para action_logs com casting correto (user_id é TEXT)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'action_logs' 
        AND policyname = 'Usuários autenticados podem inserir logs'
    ) THEN
        CREATE POLICY "Usuários autenticados podem inserir logs"
        ON public.action_logs
        FOR INSERT
        TO authenticated
        WITH CHECK (auth.uid()::text = user_id);
    END IF;
END $$;

-- 3. Criar política para prontuario_procedimentos (profissional_id é TEXT)
-- Esta política permite que o profissional gerencie procedimentos se o prontuário for dele
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'prontuario_procedimentos' 
        AND policyname = 'Profissionais podem gerenciar procedimentos de seus prontuários'
    ) THEN
        CREATE POLICY "Profissionais podem gerenciar procedimentos de seus prontuários"
        ON public.prontuario_procedimentos
        FOR ALL
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.prontuarios p
                WHERE p.id = prontuario_procedimentos.prontuario_id
                AND p.profissional_id = auth.uid()::text
            )
        )
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.prontuarios p
                WHERE p.id = prontuario_procedimentos.prontuario_id
                AND p.profissional_id = auth.uid()::text
            )
        );
    END IF;
END $$;
