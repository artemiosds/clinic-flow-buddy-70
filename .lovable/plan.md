The issue involves professionals being unable to save procedures in the medical record (prontuário). The error message "Erro ao salvar: Não foi possível salvar os procedimentos do prontuário" (or similar) occurs during "Salvar Rascunho", "Finalizar Prontuário", or "Salvar Alterações".

### Analysis:
1.  **Multiple Save Flows**: The `Prontuario.tsx` file has multiple save flows: `handleSave`, `performAutosave`, and `handleRegistrarSessaoOnly`. All of them attempt to delete existing procedures and re-insert the selected ones into the `prontuario_procedimentos` table.
2.  **Missing Fields**: In some flows (like `handleRegistrarSessaoOnly`), the `prontuario_procedimentos` insert might be missing required fields or sending incorrect types. Specifically, the table schema shows `prontuario_id` as a UUID and `observacao` as a non-nullable text field.
3.  **RLS Policies**: There are three RLS policies on `prontuario_procedimentos`. One of them, "Staff manage prontuario_procedimentos", allows Staff to perform ALL operations if `is_staff_member()` is true. Another "Permitir acesso total para autenticados" allows all authenticated users. However, if a professional is not correctly identified as staff or if the `with_check` fails, the insert might be blocked.
4.  **Autosave/Manual Conflict**: The autosave logic also performs deletions and insertions, which might conflict with manual saves if triggered simultaneously.
5.  **Error Handling**: The current error handling often wraps specific errors in generic messages, making it hard to see the underlying database failure (e.g., foreign key violation, null constraint, or RLS denial).

### Proposed Fixes:

#### 1. Robust `buildProntuarioProcedimentoLinks`
Standardize the payload generation to ensure all required fields are present and correctly typed. Ensure `observacao` is always an empty string if no JSON content is provided, satisfying the NOT NULL constraint.

#### 2. Synchronized Procedure Saving
Create a centralized `saveProcedimentos` function that handles the delete-then-insert logic with better error reporting and ensuring the `prontuario_id` is valid.

#### 3. Update Save Flows
Refactor `handleSave`, `performAutosave`, and `handleRegistrarSessaoOnly` to use the centralized procedure saving logic. Ensure that the `prontuario_id` is always obtained before attempting to save procedures.

#### 4. Improved Error Logging
Add detailed console logging for Supabase errors in the procedure saving process to help identify RLS or constraint issues during development.

#### 5. RLS Verification
Ensure the `prontuario_procedimentos` table has a policy that explicitly allows professionals to manage records linked to their own prontuários. If the current "Staff manage" policy is insufficient, I will add a targeted policy.

### Technical Details:
- Modify `src/pages/painel/Prontuario.tsx`.
- Centralize procedure persistence logic.
- Ensure `observacao` is never null/undefined.
- Add specific error catching for the `prontuario_procedimentos` operations.
