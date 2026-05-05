import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Home } from "lucide-react";
import { motion } from "framer-motion";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute inset-0 gradient-hero opacity-5 pointer-events-none" />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="text-center max-w-md w-full relative z-10"
      >
        <div className="text-9xl font-extrabold text-primary/10 mb-[-60px] select-none">404</div>
        <h1 className="text-3xl font-bold font-display text-foreground mb-4">Página não encontrada</h1>
        <p className="text-muted-foreground mb-8 text-lg">
          Desculpe, a página que você está procurando não existe ou foi movida.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link to="/">
            <Button className="w-full sm:w-auto gradient-primary text-primary-foreground font-semibold px-8 h-12">
              <Home className="w-4 h-4 mr-2" />
              Voltar ao Início
            </Button>
          </Link>
          <Button 
            variant="outline" 
            onClick={() => window.history.back()}
            className="w-full sm:w-auto border-primary/20 text-primary hover:bg-primary/5 h-12"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Página Anterior
          </Button>
        </div>
      </motion.div>
    </div>
  );
};

export default NotFound;
