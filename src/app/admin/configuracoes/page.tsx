import { SECOES, SettingsView, type Secao } from "@/components/settings/SettingsView";
import { requireUser } from "@/lib/auth";
import { getConfig, getOwners } from "@/lib/queries";

const BASE = "/admin/configuracoes";

export default async function ConfiguracoesPage(props: PageProps<"/admin/configuracoes">) {
  await requireUser("admin");

  // A seção aberta vive na URL: mandar "as etapas estão assim" é um link.
  const { secao } = await props.searchParams;
  const pedida = Array.isArray(secao) ? secao[0] : secao;
  const atual: Secao = SECOES.includes(pedida as Secao) ? (pedida as Secao) : "etapas";

  const [config, owners] = await Promise.all([getConfig(), getOwners()]);

  return (
    <SettingsView
      basePath={BASE}
      secao={atual}
      stages={config.stages}
      lossReasons={config.lossReasons}
      templates={config.templates}
      automations={config.automations}
      cases={config.cases}
      series={config.series}
      owners={owners}
      regra={config.regra}
    />
  );
}
