import { requireUser } from "@/lib/auth";
import { livekitConfigurado } from "@/lib/livekit-servidor";
import { MonitoramentoView } from "@/components/monitoramento/MonitoramentoView";
import { reunioesSemDados, saudeDaAgenda, saudeDoLiveKit } from "@/lib/queries-monitoramento";

export default async function MonitoramentoPage() {
  await requireUser("admin");

  const agora = new Date();
  const [saude, semDados, agenda] = await Promise.all([
    saudeDoLiveKit(agora),
    reunioesSemDados(agora),
    saudeDaAgenda(agora),
  ]);

  return (
    <MonitoramentoView
      configurado={livekitConfigurado()}
      saude={saude}
      semDados={semDados}
      agenda={agenda}
      agora={agora}
    />
  );
}
