The user is experiencing issues with the Central de Atualização Cadastral (Patient Registration Update Center), specifically that the municipalities list is not loading and the unit cannot be linked or selected. My analysis shows that:
1. `MunicipioIbgeCombobox` relies on an external IBGE API which might be failing or blocked in some environments.
2. `QuickEditPatientModal` has the `unidade_id` field as a disabled `Input`, making it impossible to change.
3. `ConferirDadosPacienteModal` uses a hardcoded, very limited list of municipalities for the residence field and lacks a unit selector.

### Proposed Changes

#### 1. Enhance `MunicipioIbgeCombobox`
- Add robust error handling to `loadMunicipios`.
- Provide a fallback mechanism or a clear "Retry" action if the IBGE API fails.
- Log specific errors to help diagnose why it's "not loading".

#### 2. Update `QuickEditPatientModal`
- Replace the disabled `unidade_id` input with a searchable `Select` or `Combobox`.
- Fetch active units from the `unidades` table to populate the selector.
- Ensure the `unidade_id` is correctly persisted to the `pacientes` table.

#### 3. Update `ConferirDadosPacienteModal`
- Replace the hardcoded `MUNICIPIOS` select for "Município de residência" with `MunicipioIbgeCombobox`.
- Add a "Unidade Vinculada" selector to allow correcting the patient's primary unit.
- Standardize the mapping of `custom_data` to ensure all fields (including `uf` and `codigoIbge` from the municipality selection) are correctly stored.

#### 4. Update `pacienteService.ts` (if needed)
- Ensure `updatePacienteCadastro` handles all incoming fields from both modals consistently.

### Technical Details
- Use `@tanstack/react-query` to fetch units for the selectors.
- Implement a reusable `UnidadeSelect` component or utility to avoid duplication.
- Ensure RLS policies allow the current user to see and link units.

### Verification Plan
- Verify that `MunicipioIbgeCombobox` loads data or shows a helpful error message.
- Verify that units can be selected and saved in both modals.
- Confirm that changes reflect in the database and across the application.
