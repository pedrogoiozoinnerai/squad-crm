import { requireUser } from "@/lib/auth";
import { livekitConfigurado } from "@/lib/livekit-servidor";
import { MonitoramentoView } from "@/components/monitoramento/MonitoramentoView";
import { reunioesSemDados, saudeDoLiveKit } from "@/lib/queries-monitoramento";

export default async function MonitoramentoPage() {
  await requireUser("admin");

  const agora = new Date();
  const [saude, semDados] = await Promise.all([saudeDoLiveKit(agora), reunioesSemDados(agora)]);

  return (
    <MonitoramentoView
      configurado={livekitConfigurado()}
      saude={saude}
      semDados={semDados}
      agora={agora}
    />
  );
}
