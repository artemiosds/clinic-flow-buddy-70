-- Indices for pacientes table
CREATE INDEX IF NOT EXISTS idx_pacientes_nome ON public.pacientes (nome);
CREATE INDEX IF NOT EXISTS idx_pacientes_cpf ON public.pacientes (cpf);
CREATE INDEX IF NOT EXISTS idx_pacientes_cns ON public.pacientes (cns);
CREATE INDEX IF NOT EXISTS idx_pacientes_telefone ON public.pacientes (telefone);
CREATE INDEX IF NOT EXISTS idx_pacientes_unidade_id ON public.pacientes (unidade_id);
CREATE INDEX IF NOT EXISTS idx_pacientes_criado_em ON public.pacientes (criado_em DESC);

-- Indices for agendamentos table
CREATE INDEX IF NOT EXISTS idx_agendamentos_data ON public.agendamentos (data DESC);
CREATE INDEX IF NOT EXISTS idx_agendamentos_unidade_id ON public.agendamentos (unidade_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_profissional_id ON public.agendamentos (profissional_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_paciente_id ON public.agendamentos (paciente_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_status ON public.agendamentos (status);
CREATE INDEX IF NOT EXISTS idx_agendamentos_criado_em ON public.agendamentos (criado_em DESC);

-- Indices for prontuarios table
CREATE INDEX IF NOT EXISTS idx_prontuarios_paciente_id ON public.prontuarios (paciente_id);
CREATE INDEX IF NOT EXISTS idx_prontuarios_profissional_id ON public.prontuarios (profissional_id);
CREATE INDEX IF NOT EXISTS idx_prontuarios_unidade_id ON public.prontuarios (unidade_id);
CREATE INDEX IF NOT EXISTS idx_prontuarios_data_atendimento ON public.prontuarios (data_atendimento DESC);
CREATE INDEX IF NOT EXISTS idx_prontuarios_criado_em ON public.prontuarios (criado_em DESC);

-- Indices for fila_espera table
CREATE INDEX IF NOT EXISTS idx_fila_espera_status ON public.fila_espera (status);
CREATE INDEX IF NOT EXISTS idx_fila_espera_unidade_id ON public.fila_espera (unidade_id);
CREATE INDEX IF NOT EXISTS idx_fila_espera_paciente_id ON public.fila_espera (paciente_id);
CREATE INDEX IF NOT EXISTS idx_fila_espera_criado_em ON public.fila_espera (criado_em DESC);

-- Indices for action_logs table
CREATE INDEX IF NOT EXISTS idx_action_logs_created_at ON public.action_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_action_logs_user_id ON public.action_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_entidade ON public.action_logs (entidade);
CREATE INDEX IF NOT EXISTS idx_action_logs_acao ON public.action_logs (acao);
