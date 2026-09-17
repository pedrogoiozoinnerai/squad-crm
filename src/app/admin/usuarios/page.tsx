import { liberarCadastro, revogarCadastro, setUserRole, toggleUserActive } from "@/app/actions/users";
import { RoleSelect } from "@/components/admin/RoleSelect";
import { Acao } from "@/components/ui/Acao";
import { PageHeader } from "@/components/shell/PageHeader";
import { allowedDomain, requireUser } from "@/lib/auth";
import { getUsers } from "@/lib/queries";

export default async function UsersPage() {
  const me = await requireUser("admin");
  const users = await getUsers();

  return (
    <>
      <PageHeader
        title="Usuários"
        subtitle={`Contas do time — cadastro só para e-mails @${allowedDomain()} liberados aqui`}
      />

      <Acao
        action={liberarCadastro}
        mensagem="Não deu para liberar o cadastro."
        className="card mb-4 flex flex-wrap items-end gap-3 p-4"
      >
        <div className="flex-1 min-w-[240px]">
          <label htmlFor="email-convite" className="mb-1 block text-xs font-semibold text-muted">
            Liberar cadastro
          </label>
          <input
            id="email-convite"
            name="email"
            type="email"
            required
            placeholder={`pessoa@${allowedDomain()}`}
            className="field w-full"
          />
        </div>
        <button type="submit" className="btn-primary">
          Liberar
        </button>
        <p className="w-full text-xs text-muted">
          Sem liberação, ninguém cria conta — nem com e-mail do domínio. As {" "}
          {users.filter((u) => u.aAssumir).length} contas vindas do HubSpot só podem ser
          assumidas por quem você liberar aqui.
        </p>
      </Acao>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-semibold text-muted">
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">E-mail</th>
              <th className="px-4 py-3">Nível</th>
              <th className="px-4 py-3">Leads</th>
              <th className="px-4 py-3">Negócios</th>
              <th className="px-4 py-3">Tarefas</th>
              <th className="px-4 py-3">Acesso</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isMe = user.id === me.id;

              return (
                <tr
                  key={user.id}
                  className={`border-b border-line last:border-b-0 ${user.active ? "" : "opacity-55"}`}
                >
                  <td className="px-4 py-3 font-medium">
                    {user.name}
                    {isMe && <span className="ml-2 text-xs text-muted">(você)</span>}
                  </td>
                  <td className="px-4 py-3 text-muted">{user.email}</td>
                  <td className="px-4 py-3">
                    <Acao action={setUserRole} mensagem="Não deu para mudar o nível desta conta.">
                      <input type="hidden" name="userId" value={user.id} />
                      <RoleSelect value={user.role} />
                    </Acao>
                  </td>
                  <td className="px-4 py-3 text-muted">{user._count.leads}</td>
                  <td className="px-4 py-3 text-muted">{user._count.deals}</td>
                  <td className="px-4 py-3 text-muted">{user._count.tasks}</td>
                  <td className="px-4 py-3">
                    {!user.aAssumir ? (
                      <span className="chip bg-waz-95 text-waz-20">Com senha</span>
                    ) : user.liberado ? (
                      <Acao action={revogarCadastro} mensagem="Não deu para revogar a liberação.">
                        <input type="hidden" name="email" value={user.email} />
                        <button type="submit" className="chip bg-sky-50 text-sky-700 hover:bg-sky-100">
                          Liberado · revogar
                        </button>
                      </Acao>
                    ) : (
                      <Acao action={liberarCadastro} mensagem="Não deu para liberar o cadastro.">
                        <input type="hidden" name="email" value={user.email} />
                        <button type="submit" className="chip bg-surface-2 text-muted hover:bg-line">
                          Liberar cadastro
                        </button>
                      </Acao>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Acao action={toggleUserActive} mensagem="Não deu para mudar o status desta conta.">
                      <input type="hidden" name="userId" value={user.id} />
                      <button
                        type="submit"
                        disabled={isMe}
                        className={`chip transition disabled:cursor-not-allowed disabled:opacity-60 ${
                          user.active
                            ? "bg-waz-95 text-waz-20 hover:bg-waz-90"
                            : "bg-surface-2 text-muted hover:bg-line"
                        }`}
                      >
                        {user.active ? "Ativo" : "Inativo"}
                      </button>
                    </Acao>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-muted">
        O nível é salvo assim que você troca o seletor. Desativar uma conta encerra as
        sessões abertas imediatamente.
      </p>
    </>
  );
}
