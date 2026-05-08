1.  Refactor QuickEditPatientModal to use the useData context for global state synchronization and logging.
2.  Implement robust data normalization (unmasking) for CPF and CNS before saving to ensure database consistency.
3.  Expand query invalidation to cover all patient-related caches (pacientes, pacientes-paginated, etc.).
4.  Add a safety mechanism to ensure pending changes are saved when the modal is closed.
5.  Improve error handling and user feedback during the save process.
6.  Ensure all non-nullable fields are properly handled to prevent database constraint violations.
