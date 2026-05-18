-- Extensão para busca por similaridade/parcial em alta velocidade
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── PACIENTES ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pacientes_nome ON public.pacientes (nome);
CREATE INDEX IF NOT EXISTS idx_pacientes_cpf ON public.pacientes (cpf);
CREATE INDEX IF NOT EXISTS idx_pacientes_cns ON public.pacientes (cns);
CREATE INDEX IF NOT EXISTS idx_pacientes_unidade ON public.pacientes (unidade_id);
CREATE INDEX IF NOT EXISTS idx_pacientes_status_falta ON public.pacientes (status_falta);
-- Busca parcial (ilike '%x%') por similaridade
CREATE INDEX IF NOT EXISTS idx_pacientes_nome_trgm ON public.pacientes USING gin (nome gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_pacientes_cpf_trgm  ON public.pacientes USING gin (cpf  gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_pacientes_cns_trgm  ON public.pacientes USING gin (cns  gin_trgm_ops);

-- ─── PRONTUARIOS ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_prontuarios_paciente      ON public.prontuarios (paciente_id);
CREATE INDEX IF NOT EXISTS idx_prontuarios_profissional  ON public.prontuarios (profissional_id);
CREATE INDEX IF NOT EXISTS idx_prontuarios_paciente_data ON public.prontuarios (paciente_id, data_atendimento DESC, hora_atendimento DESC);
CREATE INDEX IF NOT EXISTS idx_prontuarios_unidade       ON public.prontuarios (unidade_id);
CREATE INDEX IF NOT EXISTS idx_prontuarios_evolucao_trgm ON public.prontuarios USING gin (evolucao gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_prontuarios_queixa_trgm   ON public.prontuarios USING gin (queixa_principal gin_trgm_ops);

-- ─── AGENDAMENTOS ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_agendamentos_data                    ON public.agendamentos (data);
CREATE INDEX IF NOT EXISTS idx_agendamentos_paciente                ON public.agendamentos (paciente_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_data_prof_status        ON public.agendamentos (data, profissional_id, status);
CREATE INDEX IF NOT EXISTS idx_agendamentos_unidade_data            ON public.agendamentos (unidade_id, data);
CREATE INDEX IF NOT EXISTS idx_agendamentos_paciente_data           ON public.agendamentos (paciente_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_agendamentos_status                  ON public.agendamentos (status);

-- ─── ATENDIMENTOS ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_atendimentos_data           ON public.atendimentos (data);
CREATE INDEX IF NOT EXISTS idx_atendimentos_status         ON public.atendimentos (status);
CREATE INDEX IF NOT EXISTS idx_atendimentos_data_status    ON public.atendimentos (data, status);
CREATE INDEX IF NOT EXISTS idx_atendimentos_profissional   ON public.atendimentos (profissional_id);
CREATE INDEX IF NOT EXISTS idx_atendimentos_paciente       ON public.atendimentos (paciente_id);

-- ─── FUNCIONARIOS (equivalente a "usuarios") ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_funcionarios_email     ON public.funcionarios (email);
CREATE INDEX IF NOT EXISTS idx_funcionarios_usuario   ON public.funcionarios (usuario);
CREATE INDEX IF NOT EXISTS idx_funcionarios_role      ON public.funcionarios (role);
CREATE INDEX IF NOT EXISTS idx_funcionarios_auth_user ON public.funcionarios (auth_user_id);
CREATE INDEX IF NOT EXISTS idx_funcionarios_unidade   ON public.funcionarios (unidade_id);
CREATE INDEX IF NOT EXISTS idx_funcionarios_ativo     ON public.funcionarios (ativo) WHERE ativo = true;

-- ─── FILA DE ESPERA + SESSÕES (telas críticas) ──────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fila_status_posicao   ON public.fila_espera (status, posicao);
CREATE INDEX IF NOT EXISTS idx_fila_paciente         ON public.fila_espera (paciente_id);
CREATE INDEX IF NOT EXISTS idx_fila_unidade_status   ON public.fila_espera (unidade_id, status);
CREATE INDEX IF NOT EXISTS idx_ts_cycle              ON public.treatment_sessions (cycle_id);
CREATE INDEX IF NOT EXISTS idx_ts_patient_status     ON public.treatment_sessions (patient_id, status);
CREATE INDEX IF NOT EXISTS idx_ts_appointment        ON public.treatment_sessions (appointment_id);

-- Atualiza estatísticas para o planner usar os novos índices imediatamente
ANALYZE public.pacientes;
ANALYZE public.prontuarios;
ANALYZE public.agendamentos;
ANALYZE public.atendimentos;
ANALYZE public.funcionarios;
ANALYZE public.fila_espera;
ANALYZE public.treatment_sessions;