import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Calendar,
  Shield,
  Phone,
  MapPin,
  Clock,
  Heart,
  Stethoscope,
  Baby,
  Smile,
  Activity,
  Brain,
  Apple,
  User,
  HeartHandshake,
  HandMetal,
  UserCheck,
  CheckCircle2,
  FileText,
  ClipboardList,
  Search,
} from "lucide-react";
import { motion } from "framer-motion";
import { loadDocumentConfig, type DocumentConfig } from "@/lib/printLayout";
import logoSmsFallback from "@/assets/logo-sms.jpeg";

const services = [
  { 
    icon: Stethoscope, 
    title: "Agendamento de consultas", 
    desc: "Solicite ou acompanhe seus agendamentos de forma simples e rápida." 
  },
  { 
    icon: UserCheck, 
    title: "Acompanhamento pelo paciente", 
    desc: "Acesse seu histórico, verifique status e gerencie seus dados de saúde." 
  },
  { 
    icon: Activity, 
    title: "Atendimento especializado", 
    desc: "Acesso a diversas especialidades médicas e multiprofissionais." 
  },
  { 
    icon: HeartHandshake, 
    title: "Encaminhamentos", 
    desc: "Gestão integrada de encaminhamentos internos e externos." 
  },
  { 
    icon: FileText, 
    title: "Prontuário e histórico", 
    desc: "Histórico clínico consolidado para continuidade do cuidado." 
  },
  { 
    icon: ClipboardList, 
    title: "Documentos e declarações", 
    desc: "Emissão de documentos clínicos, atestados e declarações." 
  },
];

const medicalSpecialties = [
  { icon: Stethoscope, title: "Clínica Geral" },
  { icon: Baby, title: "Pediatria" },
  { icon: Smile, title: "Odontologia" },
  { icon: Heart, title: "Enfermagem" },
  { icon: Activity, title: "Fisioterapia" },
  { icon: Brain, title: "Psicologia" },
  { icon: Apple, title: "Nutrição" },
  { icon: Baby, title: "Odontopediatria" },
  { icon: HeartHandshake, title: "Assistência Social" },
  { icon: HandMetal, title: "Terapia Ocupacional" },
];

const Home: React.FC = () => {
  const [config, setConfig] = React.useState<DocumentConfig | null>(null);

  React.useEffect(() => {
    loadDocumentConfig().then(setConfig);
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Hero Section */}
      <section className="relative overflow-hidden gradient-hero text-primary-foreground">
        {/* Background Patterns */}
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-white blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-white blur-[120px]" />
        </div>

        <div className="container mx-auto px-4 py-12 md:py-20 relative z-10">
          <div className="flex flex-col items-center text-center max-w-4xl mx-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="mb-6"
            >
              <img 
                src={config?.logoEsquerda || logoSmsFallback} 
                alt="Logo SMS" 
                className="w-24 h-24 md:w-28 md:h-28 rounded-2xl object-cover shadow-2xl border-4 border-white/20"
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              <h1 className="text-3xl md:text-5xl lg:text-6xl font-extrabold font-display leading-tight mb-4 tracking-tight">
                {config?.linha1 || 'SECRETARIA MUNICIPAL DE SAÚDE DE ORIXIMINÁ'}
              </h1>
              <p className="text-lg md:text-xl opacity-90 mb-10 max-w-2xl mx-auto font-medium">
                Sistema online para agendamento, acompanhamento e acesso aos serviços de saúde do município.
              </p>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl"
            >
              <Link to="/agendar" className="w-full">
                <Button
                  size="xl"
                  className="w-full bg-white text-primary font-bold shadow-xl hover:bg-white/90 hover:-translate-y-1 transition-all duration-300"
                >
                  <Calendar className="w-5 h-5 mr-3" />
                  Agendar Online
                </Button>
              </Link>
              <Link to="/portal" className="w-full">
                <Button
                  size="xl"
                  variant="outline"
                  className="w-full bg-white/10 border-white/30 text-white font-bold backdrop-blur-md shadow-xl hover:bg-white/20 hover:-translate-y-1 transition-all duration-300"
                >
                  <User className="w-5 h-5 mr-3" />
                  Portal do Paciente
                </Button>
              </Link>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1, delay: 0.5 }}
              className="mt-8 flex flex-wrap justify-center gap-6 opacity-70 text-sm font-medium"
            >
              <Link to="/login" className="flex items-center hover:opacity-100 transition-opacity">
                <Shield className="w-4 h-4 mr-2" /> Painel Interno
              </Link>
              <Link to="/externo" className="flex items-center hover:opacity-100 transition-opacity">
                <UserCheck className="w-4 h-4 mr-2" /> Acesso Externo
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="flex-grow">
        {/* Important Info Section */}
        <section className="container mx-auto px-4 -mt-8 relative z-20">
          <div className="max-w-5xl mx-auto">
            <Card className="shadow-2xl border-0 overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-12">
                <div className="md:col-span-5 bg-primary p-8 text-white">
                  <h3 className="text-xl font-bold mb-4 flex items-center">
                    <CheckCircle2 className="w-6 h-6 mr-2 text-white/80" />
                    Antes de agendar, tenha em mãos:
                  </h3>
                  <ul className="space-y-3">
                    {[
                      "Nome completo",
                      "Data de nascimento",
                      "CPF ou CNS (Cartão SUS)",
                      "Telefone para contato",
                      "Unidade ou serviço desejado"
                    ].map((item, idx) => (
                      <li key={idx} className="flex items-start gap-3 text-sm font-medium text-white/90">
                        <div className="w-1.5 h-1.5 rounded-full bg-white/50 mt-1.5 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="md:col-span-7 bg-white p-8">
                  <h3 className="text-xl font-bold text-foreground mb-4">Acesso Rápido</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Link to="/agendar" className="group">
                      <div className="p-4 rounded-xl border border-border bg-muted/30 group-hover:border-primary group-hover:bg-primary/5 transition-all duration-200 h-full">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                          <Calendar className="w-5 h-5 text-primary" />
                        </div>
                        <h4 className="font-bold text-sm text-foreground mb-1">Agendar atendimento</h4>
                        <p className="text-xs text-muted-foreground">Solicite sua vaga online agora.</p>
                      </div>
                    </Link>
                    <Link to="/portal" className="group">
                      <div className="p-4 rounded-xl border border-border bg-muted/30 group-hover:border-primary group-hover:bg-primary/5 transition-all duration-200 h-full">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                          <Search className="w-5 h-5 text-primary" />
                        </div>
                        <h4 className="font-bold text-sm text-foreground mb-1">Consultar agendamento</h4>
                        <p className="text-xs text-muted-foreground">Veja data e hora da sua consulta.</p>
                      </div>
                    </Link>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </section>

        {/* Services Section */}
        <section className="container mx-auto px-4 py-16">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold font-display text-foreground mb-4">Nossos Serviços</h2>
            <div className="w-20 h-1.5 bg-primary mx-auto rounded-full" />
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {services.map((s, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <Card className="h-full shadow-card border-0 hover:shadow-elevated hover:-translate-y-1 transition-all duration-300">
                  <CardContent className="p-8">
                    <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                      <s.icon className="w-8 h-8 text-primary" />
                    </div>
                    <h3 className="text-xl font-bold font-display text-foreground mb-3">{s.title}</h3>
                    <p className="text-muted-foreground leading-relaxed">{s.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Contact Info Section */}
        <section className="bg-muted/30 py-16 border-y border-border">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10 max-w-5xl mx-auto">
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <MapPin className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-bold text-lg text-foreground mb-2">Localização</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Rua Barão do Rio Branco, nº 2336<br />
                  Centro, Oriximiná - PA, 68270-000
                </p>
              </div>
              
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Clock className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-bold text-lg text-foreground mb-2">Horário de Atendimento</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Segunda a Sexta-feira<br />
                  Das 08:00 às 18:00
                </p>
              </div>

              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Phone className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-bold text-lg text-foreground mb-2">Canais de Contato</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Telefone: (93) 3544-1587<br />
                  WhatsApp: (93) 99999-0000
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer Section */}
      <footer className="bg-white border-t border-border pt-12 pb-6">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center mb-10">
            <img 
              src={config?.logoEsquerda || logoSmsFallback} 
              alt="Logo SMS" 
              className="w-16 h-16 rounded-xl grayscale opacity-50 mb-4"
            />
            <h4 className="text-lg font-bold text-foreground">Secretaria Municipal de Saúde de Oriximiná</h4>
            <p className="text-sm text-muted-foreground">Governo Municipal de Oriximiná - Pará</p>
          </div>
          
          <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-border gap-4">
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} SMS Oriximiná. Todos os direitos reservados.
            </p>
            <div className="flex gap-6 text-sm text-muted-foreground">
              <a href="#" className="hover:text-primary transition-colors">Termos de Uso</a>
              <a href="#" className="hover:text-primary transition-colors">Privacidade</a>
              <a href="#" className="hover:text-primary transition-colors">Acessibilidade</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Home;
