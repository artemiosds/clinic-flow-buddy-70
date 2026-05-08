
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface UnidadeSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

const UnidadeSelect: React.FC<UnidadeSelectProps> = ({ 
  value, 
  onValueChange, 
  placeholder = "Selecione a unidade", 
  disabled = false 
}) => {
  const { data: unidades, isLoading } = useQuery({
    queryKey: ["unidades-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("unidades")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data || [];
    }
  });

  return (
    <Select value={value || ""} onValueChange={onValueChange} disabled={disabled || isLoading}>
      <SelectTrigger className="w-full">
        {isLoading ? (
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Carregando...</span>
          </div>
        ) : (
          <SelectValue placeholder={placeholder} />
        )}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Nenhuma Unidade (Desvincular)</SelectItem>
        {unidades?.map((unidade) => (
          <SelectItem key={unidade.id} value={unidade.id}>
            {unidade.nome}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default UnidadeSelect;
