import { supabase } from "@/integrations/supabase/client";

/**
 * Service to manage patient absence logic and synchronization.
 */
export const patientAbsenceService = {
  /**
   * Recalculates the absence status for a patient across all sources (Agenda and Treatments).
   * Calls the centralized RPC function in the database.
   */
  async recalculateStatus(patientId: string): Promise<void> {
    if (!patientId) return;
    try {
      const { error } = await supabase.rpc('recalcular_status_falta_paciente', { 
        p_paciente_id: patientId 
      });
      if (error) {
        console.error(`[patientAbsenceService] Error recalculating status for ${patientId}:`, error);
        throw error;
      }
    } catch (err) {
      console.error(`[patientAbsenceService] Unexpected error:`, err);
    }
  },

  /**
   * Dispatches a global event to notify components that a patient's status might have changed.
   */
  notifyStatusChange(patientId: string): void {
    if (!patientId) return;
    window.dispatchEvent(new CustomEvent("refresh-patient-status", { 
      detail: { pacienteId: patientId } 
    }));
  }
};
