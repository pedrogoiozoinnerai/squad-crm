"use client";

import { useActionState } from "react";
import { CheckCircle2, ScrollText } from "lucide-react";

import { alternarRubrica, publicarRubrica } from "@/app/actions/sessoes";
import { FormFeedback } from "@/components/ui/FormFeedback";
import { Acao } from "@/components/ui/Acao";
import { TZ } from "@/lib/dates";
import type { FormState } from "@/lib/guard";

export type RubricaRow = {
  id: string;
  versao: number;
  ativo: boolean;
  corpo: string;
  createdAt: Date;
  autor: { name: string } | null;
};

/**
 * A régua pela qual as calls são julgadas.
 *
 * Duas coisas desta tela são decisões, não estilo.
 *
 * **Versionar, nunca editar.** Salvar cria uma versão nova e desliga a
 * anterior; a anterior continua pendurada nas análises que ela produziu. Sem
 * isso, ajustar uma frase da régua reescreveria o significado de todas as notas
 * já dadas — e duas calls com a mesma nota teriam sido medidas por textos
 * diferentes, sem nada registrando isso.
 *
 * **O formato não está aqui.** O contrato de saída é gerado do schema pelo
 * código e anexado depois da régua. É o que impede o erro documentado do CRM de
 * referência: lá o prompt pede dezenas de campos e o schema aceita cinco, então
 * a maior parte da análise é gerada, paga e descartada sem ninguém ver.
 */
export function Rubrica({ versoes, analisePronta }: { versoes: RubricaRow[]; analisePronta: boolean }) {
  const [estado, acao, salvando] = useActionState<FormState, FormData>(publicarRubrica, null);
  const ativa = versoes.find((v) => v.ativo) ?? null;

  return (
    <section className="flex flex-col gap-5">
      <div className="card overflow-hidden">
        <header className="border-b border-line px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ScrollText className="size-4 text-muted" />
            Rubrica de auditoria de call
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            A régua pela qual cada call é julgada: os blocos do playbook na ordem, o que
            conta como erro, as palavras que não se diz. Escreva só o JULGAMENTO — o
            formato da resposta é montado pelo sistema a partir do schema, e não pode ser
            mudado aqui.
          </p>
          {!analisePronta && (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
              A análise ainda não está ligada: falta a chave da Anthropic. A rubrica pode
              ser escrita desde já e passa a valer sozinha no dia em que a chave existir.
            </p>
          )}
        </header>

        <form action={acao} className="flex flex-col gap-3 p-5">
          <textarea
            name="corpo"
            rows={14}
            required
            minLength={50}
            maxLength={20000}
            defaultValue={ativa?.corpo ?? ""}
            placeholder={
              "Você audita calls de venda do Squad contra o playbook comercial.\n\n" +
              "Percorra os blocos na ordem: abertura, diagnóstico, apresentação, oferta, fechamento.\n" +
              "Para cada bloco, diga se foi feito, parcialmente feito ou pulado.\n\n" +
              "Aponte erros só quando houver uma frase literal da transcrição que os sustente."
            }
            className="field resize-y font-mono text-base leading-relaxed sm:text-[13px]"
          />
          <FormFeedback state={estado} sucesso="Rubrica publicada." />
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-muted">
              Salvar publica a <strong>versão {(versoes[0]?.versao ?? 0) + 1}</strong> e desliga a
              anterior. Nada é sobrescrito.
            </p>
            <button type="submit" disabled={salvando} className="btn btn-primary text-sm">
              {salvando ? "Publicando…" : "Publicar versão"}
            </button>
          </div>
        </form>
      </div>

      {versoes.length > 0 && (
        <div className="card overflow-hidden">
          <h3 className="border-b border-line px-5 py-3.5 text-sm font-semibold">
            Versões
            <span className="ml-2 text-xs font-normal text-muted">
              as antigas ficam: elas explicam as notas que deram
            </span>
          </h3>
          <ul className="divide-y divide-line">
            {versoes.map((v) => (
              <li key={v.id} className="flex items-center gap-3 px-5 py-3.5">
                <span className="w-12 shrink-0 text-sm font-semibold tabular-nums">v{v.versao}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-muted">
                    {v.corpo.slice(0, 120)}
                    {v.corpo.length > 120 ? "…" : ""}
                  </span>
                  <span className="block text-[11px] text-muted">
                    {v.autor?.name ?? "autor removido"} ·{" "}
                    {v.createdAt.toLocaleString("pt-BR", {
                      timeZone: TZ,
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                </span>
                {v.ativo ? (
                  <span className="chip bg-waz-90 text-waz-20">
                    <CheckCircle2 className="size-3.5" />
                    Em vigor
                  </span>
                ) : (
                  <Acao action={alternarRubrica} mensagem="Não deu para mudar a rubrica em uso.">
                    <input type="hidden" name="id" value={v.id} />
                    <button type="submit" className="btn-ghost text-xs">
                      Voltar a esta
                    </button>
                  </Acao>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
