import { supabase } from "@/integrations/supabase/client";

async function fetchTriagem() {
  const { data, error } = await supabase
    .from("triagem" as any)
    .select("*")
    .limit(1);
  
  if (error) {
    console.error("Error fetching triagem:", error);
  } else {
    console.log("Triagem data structure:", JSON.stringify(data, null, 2));
  }
}

fetchTriagem();
