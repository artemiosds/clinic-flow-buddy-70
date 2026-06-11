-- Add client_operation_id to more tables for offline sync support
DO $$ 
DECLARE 
    t_name text;
    tables_to_update text[] := ARRAY[
        'treatment_cycles', 'treatment_sessions', 'pts', 'pts_metas', 
        'pts_sigtap', 'pts_cid', 'pts_revisoes', 'patient_regulation', 
        'patient_evaluations', 'prontuarios', 'prontuario_procedimentos',
        'horarios_funcionamento', 'especialidades', 'multiprofessional_evaluations',
        'nursing_evaluations', 'medications', 'exam_types', 'patient_discharges'
    ];
BEGIN 
    FOREACH t_name IN ARRAY tables_to_update LOOP
        -- Add column if not exists
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = t_name 
            AND column_name = 'client_operation_id'
        ) THEN
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN client_operation_id UUID', t_name);
            EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I (client_operation_id) WHERE client_operation_id IS NOT NULL', 'unique_' || t_name || '_client_op', t_name);
            EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (client_operation_id)', 'idx_' || t_name || '_client_op', t_name);
        END IF;
    END LOOP;
END $$;
